import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const require = createRequire(realpathSync('node_modules/vite/package.json'));
const { build } = require('esbuild');
const output = '.sites-runtime/test-access-crypto/auth.mjs';
mkdirSync('.sites-runtime/test-access-crypto', { recursive: true });
await build({
  entryPoints: ['lib/access-auth.ts'], outfile: output, bundle: true,
  platform: 'node', format: 'esm', packages: 'external', tsconfig: 'tsconfig.json',
  plugins: [{
    name: 'isolated-auth-environment', setup(build) {
      build.onResolve({ filter: /^(cloudflare:workers|next\/headers)$/ }, args => ({ path: args.path, namespace: 'isolated-auth' }));
      build.onLoad({ filter: /.*/, namespace: 'isolated-auth' }, args => ({ contents: args.path === 'cloudflare:workers'
        ? 'export const env={ACCESS_DAF_ENABLED:"1"};'
        : 'export async function headers(){return new Headers();}' }));
    },
  }],
});
const { hashPassword, verifyPassword, validatePassword } = await import(pathToFileURL(process.cwd() + '/' + output));
let checks = 0;
async function check(name, test) { await test(); checks++; console.log('PASS ' + name); }

await check('production derivation avoids the capped native APIs', () => {
  const source = readFileSync('lib/access-auth.ts', 'utf8');
  const nativeImport = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]node:crypto['"]/);
  assert.ok(nativeImport); assert.doesNotMatch(nativeImport[1], /\bpbkdf2(?:Sync)?\b/);
  assert.doesNotMatch(source, /(?:subtle\s*\.\s*derive(?:Bits|Key)|@noble\/hashes\/webcrypto)/);
  assert.match(source, /from\s*['"]@noble\/hashes\/pbkdf2\.js['"]/);
  assert.match(source, /from\s*['"]@noble\/hashes\/sha2\.js['"]/);
  assert.match(source, /PASSWORD_ROUNDS\s*=\s*600000/);
});

// Published PBKDF2-HMAC-SHA256 known answers, independent of application code.
for (const [rounds, expected] of [
  [1, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
  [2, 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'],
  [4096, 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a'],
]) await check('standard known answer, ' + rounds + ' rounds', async () => {
  const value = await pbkdf2Async(sha256, new TextEncoder().encode('password'), new TextEncoder().encode('salt'), { c: rounds, dkLen: 32, asyncTick: 8 });
  assert.equal(Buffer.from(value).toString('hex'), expected);
});

// These 600k answers were independently calculated with Python hashlib/OpenSSL.
const salt = '000102030405060708090a0b0c0d0e0f';
for (const [password, expected] of [
  ['password', '3bc37118e625093e9b79ed08930ea7af7389591233fdd92dddf369371e60dbc0'],
  ['  Egypt مصر🙂 preserved  ', '011ae545f9f5fb3f820a044b0371207e92c27d3fae4b0a3708f94576f6c48897'],
]) await check('application accepts independent 600k answer (' + (password === 'password' ? 'ASCII' : 'Unicode and spaces') + ')', async () => {
  assert.equal(await verifyPassword(password, `pbkdf2-sha256:600000:${salt}:${expected}`), true);
});

let current;
for (const [label, password] of [
  ['ASCII', 'A secure test password 2026'],
  ['Unicode and spaces', '  Egypt مصر🙂 preserved  '],
  ['128 Unicode code points', '🙂'.repeat(128)],
]) await check('new hash is byte-identical to native OpenSSL (' + label + ')', async () => {
  const encoded = await hashPassword(password);
  const [scheme, rounds, encodedSalt, key] = encoded.split(':');
  assert.equal(scheme, 'pbkdf2-sha256'); assert.equal(rounds, '600000');
  assert.match(encodedSalt, /^[a-f0-9]{32}$/); assert.match(key, /^[a-f0-9]{64}$/);
  const independent = pbkdf2Sync(password, Buffer.from(encodedSalt, 'hex'), 600000, 32, 'sha256').toString('hex');
  assert.equal(key, independent);
  assert.equal(await verifyPassword(password, encoded), true);
  if (label === 'Unicode and spaces') current = { password, encoded };
});
await check('wrong password is rejected', async () => assert.equal(await verifyPassword('wrong password', current.encoded), false));
await check('leading and trailing spaces remain significant', async () => assert.equal(await verifyPassword(current.password.trim(), current.encoded), false));
await check('tampered key is rejected', async () => {
  const changed = current.encoded.slice(0, -1) + (current.encoded.endsWith('0') ? '1' : '0');
  assert.equal(await verifyPassword(current.password, changed), false);
});
await check('altered iteration field is rejected', async () => assert.equal(await verifyPassword(current.password, current.encoded.replace(':600000:', ':100000:')), false));
await check('malformed encoded hash is rejected', async () => assert.equal(await verifyPassword(current.password, 'malformed'), false));
await check('15-character minimum and 128-code-point maximum', () => {
  assert.throws(() => validatePassword('x'.repeat(14)));
  validatePassword('x'.repeat(15)); validatePassword('🙂'.repeat(128));
  assert.throws(() => validatePassword('🙂'.repeat(129)));
});
console.log(`Access crypto: ${checks} PASS; 0 FAIL. Hosted CPU budget remains a deployment verification.`);
