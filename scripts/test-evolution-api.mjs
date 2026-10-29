// Uses a disposable local Worker, D1 and R2, with simulated trusted identities only.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(fs.realpathSync('node_modules/wrangler/package.json'));
const { Miniflare } = require('miniflare');
const root = process.cwd() + '/dist/server';
const modules = [{ type: 'ESModule', path: root + '/index.js' }, ...fs.readdirSync(root, { recursive: true }).filter(x => /\.m?js$/.test(x) && x !== 'index.js').map(x => ({ type: 'ESModule', path: root + '/' + x }))];
const mf = new Miniflare({ modulesRoot: root, modules, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings: { PILOT_OWNER_EMAIL: 'owner@evolution.test', COMMAND_CENTER_PILOT: 'isolated', COMMAND_CENTER_DATASET_ID: 'evolution-api-disposable' }, cf: false });
try {
    const db = await mf.getD1Database('DB');
    const migrations = fs.readdirSync('drizzle').filter(x => x.endsWith('.sql')).sort();
    const statements = migrations.flatMap(file => fs.readFileSync('drizzle/' + file, 'utf8').split('--> statement-breakpoint')).map(sql => sql.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
    await require(process.cwd() + '/tests/evolution-api.cjs')({ mf, db, migrations });
} finally { await mf.dispose(); }
