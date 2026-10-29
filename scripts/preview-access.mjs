// Local-only ACCESS-DAF review. This script is never imported by the hosted Worker.
// It creates a private fixture database, not an application owner in production.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pbkdf2, randomBytes, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { promisify } from 'node:util';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const DATASET = 'access-daf-local-review';
const OWNER = 'access-preview-owner';
const OWNER_NAME = 'مالك معاينة محلية — TEST ONLY';
const derive = promisify(pbkdf2);
const argv = process.argv.slice(2);
const prepareOnly = argv.includes('--prepare-only');
const stdinCredentials = argv.includes('--credentials-stdin');
const stateIndex = argv.indexOf('--state-name');
const stateName = stateIndex === -1 ? 'access-preview' : argv[stateIndex + 1];
if (typeof stateName !== 'string' || !/^access-preview(?:-[a-z0-9-]{1,60})?$/.test(stateName)) throw new Error('Choose a local state name beginning access-preview, using lowercase letters, digits and hyphens.');
const STATE = path.join(ROOT, '.sites-runtime', stateName);
const portIndex = argv.indexOf('--port');
const requestedPort = portIndex === -1 ? 4173 : Number(argv[portIndex + 1]);
class PreviewError extends Error {}
for (let index = 0; index < argv.length; index++) {
  if (['--port', '--state-name'].includes(argv[index])) { index++; continue; }
  if (!['--prepare-only', '--credentials-stdin'].includes(argv[index])) throw new PreviewError('Unsupported preview option.');
}
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new PreviewError('Choose a local port between1024 and65535.');

function fail(message) { throw new PreviewError(message); }
async function promptLine(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(label); } finally { rl.close(); }
}
async function promptSecret(label) {
  let silent = false;
  const output = new Writable({ write(chunk, encoding, callback) { if (!silent) process.stdout.write(chunk, encoding); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const answer = rl.question(label); silent = true;
    return await answer;
  } finally { silent = false; rl.close(); process.stdout.write('\n'); }
}
async function credentials() {
  let values;
  if (stdinCredentials) {
    let raw = '';
    for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 5000) fail('Credential input is too large.'); }
    try { values = JSON.parse(raw); } catch { fail('Expected private JSON input with username and password.'); }
    raw = '';
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) fail('First launch needs an interactive terminal, or private --credentials-stdin input.');
    const username = await promptLine('اسم دخول مالك المعاينة المحلية: ');
    const password = await promptSecret('كلمة مرور جديدة للمعاينة (15–128 حرفًا، الإدخال مخفي): ');
    const confirmation = await promptSecret('أعد كلمة المرور: ');
    if (password !== confirmation) fail('Passwords did not match; no owner account created.');
    values = { username, password };
  }
  const username = typeof values?.username === 'string' ? values.username.trim().toLocaleLowerCase('en-US') : '';
  const password = values?.password;
  if (!/^[a-z0-9][a-z0-9._@+-]{2,253}$/.test(username)) fail('Use a username of3–254 ASCII letters/numbers and . _ @ + - .');
  if (typeof password !== 'string' || [...password].length < 15 || [...password].length > 128) fail('Password must contain15–128 characters. Spaces and Unicode are preserved.');
  const salt = randomBytes(16), key = await derive(password, salt, 600000, 32, 'sha256');
  values.password = undefined;
  return { username, passwordHash: `pbkdf2-sha256:600000:${salt.toString('hex')}:${key.toString('hex')}` };
}

const mime = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
async function migrate(database) {
  await database.prepare('CREATE TABLE IF NOT EXISTS access_preview_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL)').run();
  const applied = (await database.prepare('SELECT name,sha256 FROM access_preview_migrations').all()).results;
  for (const name of fs.readdirSync(path.join(ROOT, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(ROOT, 'drizzle', name), 'utf8');
    const sha = createHash('sha256').update(sql).digest('hex');
    const old = applied.find(row => row.name === name);
    if (old) { if (old.sha256 !== sha) fail('A previously applied local migration changed. Use a separate clean review checkout; existing local data was preserved.'); continue; }
    const statements = sql.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);
    await database.batch([...statements.map(value => database.prepare(value)), database.prepare('INSERT INTO access_preview_migrations(name,sha256) VALUES (?,?)').bind(name, sha)]);
  }
}

async function initialize(database) {
  const owner = await database.prepare("SELECT value FROM settings WHERE key='owner_id'").first();
  if (owner && owner.value !== OWNER) fail('This local database has a different owner. It was not modified.');
  const account = await database.prepare('SELECT username FROM access_accounts WHERE user_id=?').bind(OWNER).first();
  if (account) return;
  const existing = await database.prepare('SELECT count(*) AS n FROM members').first();
  const dataset = await database.prepare('SELECT id FROM datasets').all();
  if (existing.n || dataset.results.length) fail('The local fixture is partially initialized. Stop and review it; no account was overwritten.');
  const chosen = await credentials();
  const at = new Date().toISOString();
  await database.batch([
    database.prepare("INSERT INTO settings(key,value) VALUES ('owner_id',?)").bind(OWNER),
    database.prepare("INSERT INTO members(user_id,name,role,function,active) VALUES (?,?,'owner','all',1)").bind(OWNER, OWNER_NAME),
    database.prepare('INSERT INTO datasets(id,name,version,active,created_at) VALUES (?,?,0,1,?)').bind(DATASET, 'DAF — معاينة محلية معزولة · لا بيانات تشغيل فعلية', at),
    // Schema intentionally explicit. It must track the additive access migration.
    database.prepare("INSERT INTO access_accounts(user_id,username,email,password_hash,active,revision,grant_id,starts_at,ends_at,unlimited,client_admin,overrides,created_by,updated_at) VALUES (?,?,'',?,1,1,NULL,NULL,NULL,1,0,?,?,?)").bind(OWNER, chosen.username, chosen.passwordHash, '{}', OWNER, at),
  ]);
  chosen.passwordHash = undefined;
}

function localTLS() {
  const certPath = path.join(STATE, 'localhost-cert.pem'), keyPath = path.join(STATE, 'localhost-key.pem');
  // A private localhost certificate is never packaged or used for hosted DAF.
  // Generate a fresh short-lived certificate on each run; do not trust it system-wide.
  const created = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' });
  if (created.error || created.status !== 0) fail('OpenSSL is needed to generate a private localhost HTTPS certificate. Install OpenSSL and retry. No HTTP downgrade is provided.');
  fs.chmodSync(keyPath, 0o600); fs.chmodSync(certPath, 0o600);
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

async function main() {
  const built = path.join(ROOT, 'dist/server');
  if (!fs.existsSync(path.join(built, 'index.js'))) fail('Build this review source first with pnpm build. No server was started.');
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  const require = createRequire(fs.realpathSync(path.join(ROOT, 'node_modules/wrangler/package.json')));
  const { Miniflare } = require('miniflare');
  const modules = [{ type: 'ESModule', path: path.join(built, 'index.js') }, ...fs.readdirSync(built, { recursive: true }).filter(name => /\.m?js$/.test(name) && name !== 'index.js').map(name => ({ type: 'ESModule', path: path.join(built, name) }))];
  const mf = new Miniflare({ modulesRoot: built, modules, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], r2Buckets: ['BUCKET'], d1Persist: path.join(STATE, 'd1'), r2Persist: path.join(STATE, 'r2'),
    bindings: { ACCESS_DAF_ENABLED: '1', COMMAND_CENTER_PILOT: 'isolated', COMMAND_CENTER_DATASET_ID: DATASET }, cf: false });
  let server;
  const close = async () => { if (server) await new Promise(resolve => server.close(resolve)); await mf.dispose(); };
  try {
    const database = await mf.getD1Database('DB');
    await migrate(database); await initialize(database);
    if (prepareOnly) { console.log('Prepared isolated local ACCESS-DAF review. No HTTP listener, operational projects or stock were created.'); await close(); return; }
    const assets = path.join(ROOT, 'dist/client');
    server = https.createServer(localTLS(), async (request, response) => {
      try {
        const host = request.headers.host || '';
        const allowedHosts = new Set([`localhost:${requestedPort}`, `127.0.0.1:${requestedPort}`]);
        if (!allowedHosts.has(host)) { response.writeHead(403); response.end('Local preview only'); return; }
        const remote = request.socket.remoteAddress;
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) { response.writeHead(403); response.end('Local preview only'); return; }
        const origin = request.headers.origin;
        if (origin && origin !== `https://${host}`) { response.writeHead(403); response.end('Origin rejected'); return; }
        const url = new URL(request.url || '/', `https://${host}`);
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (key.startsWith('oai-authenticated-') || key === 'oai-sites-authorization' || key === 'authorization' || key === 'cf-connecting-ip' || key === 'host' || key === 'connection' || value === undefined) continue;
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        headers.set('cf-connecting-ip', '127.0.0.1');
        const decoded = decodeURIComponent(url.pathname);
        const asset = path.resolve(assets, '.' + decoded);
        if (['GET', 'HEAD'].includes(request.method) && decoded !== '/' && !decoded.includes('\0') && asset.startsWith(assets + path.sep) && fs.existsSync(asset) && fs.statSync(asset).isFile()) {
          response.writeHead(200, { 'Content-Type': mime[path.extname(asset)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
          if (request.method === 'HEAD') response.end(); else fs.createReadStream(asset).pipe(response);
          return;
        }
        const chunks = []; let length = 0;
        for await (const chunk of request) { length += chunk.length; if (length > 6000000) { response.writeHead(413); response.end('Request too large'); return; } chunks.push(chunk); }
        const result = await mf.dispatchFetch(url.href, { method: request.method, headers, ...(!['GET', 'HEAD'].includes(request.method) ? { body: Buffer.concat(chunks) } : {}) });
        const outputHeaders = Object.fromEntries(result.headers);
        // Cookies keep Secure, HttpOnly, SameSite and __Host constraints intact.
        const cookies = result.headers.getSetCookie?.(); if (cookies?.length) outputHeaders['set-cookie'] = cookies;
        response.writeHead(result.status, outputHeaders);
        if (request.method === 'HEAD') response.end(); else response.end(Buffer.from(await result.arrayBuffer()));
      } catch { if (!response.headersSent) response.writeHead(503, { 'Cache-Control': 'no-store' }); response.end('Local preview request unavailable. No production resources were contacted.'); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(requestedPort, '127.0.0.1', resolve); });
    console.log(`LOCAL TEST ONLY — open https://localhost:${requestedPort}/`);
    console.log('The browser will ask you to review this local self-signed certificate. Do not trust it system-wide.');
    console.log('No operational projects or stock were seeded. Create test data deliberately inside this local preview.');
    console.log(`Local review state persists only in .sites-runtime/${stateName}. Ctrl+C stops the server.`);
    let closing = false;
    const stop = async () => { if (closing) return; closing = true; await close(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) { await close(); throw error; }
}
main().catch(error => { console.error(error instanceof PreviewError ? error.message : 'Local review could not start. Existing state was preserved; no production resources were contacted.'); process.exitCode = 1; });
