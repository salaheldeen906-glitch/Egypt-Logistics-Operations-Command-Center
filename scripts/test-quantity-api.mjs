// Disposable local Worker, D1 and R2 only. Identities are simulated trusted
// platform headers; this suite does not authenticate against the hosted Site.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(fs.realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const root=process.cwd()+'/dist/server';
const modules=[{type:'ESModule',path:root+'/index.js'},...fs.readdirSync(root,{recursive:true}).filter(x=>/\.m?js$/.test(x)&&x!=='index.js').map(x=>({type:'ESModule',path:root+'/'+x}))];
const mf=new Miniflare({modulesRoot:root,modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PILOT_OWNER_EMAIL:'owner@quantity.test',COMMAND_CENTER_PILOT:'isolated',COMMAND_CENTER_DATASET_ID:'quantity-api-disposable'},cf:false});
try {
 const db=await mf.getD1Database('DB');
 const sql=fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort().flatMap(x=>fs.readFileSync('drizzle/'+x,'utf8').split('--> statement-breakpoint')).map(x=>x.trim()).filter(Boolean);
 await db.batch(sql.map(x=>db.prepare(x)));
 await require(process.cwd()+'/tests/quantity-api-acceptance.cjs')({mf,db});
} finally {await mf.dispose();}
