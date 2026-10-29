// ACCESS-DAF isolated acceptance runner: disposable Worker, D1 and R2 only.
// Trusted Sites headers in this runner are simulated local fixtures, not a live identity test.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(fs.realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const root=process.cwd()+'/dist/server';
if(!fs.existsSync(root+'/index.js')) throw new Error('Build the ACCESS-DAF source before running API acceptance.');
const modules=[{type:'ESModule',path:root+'/index.js'},...fs.readdirSync(root,{recursive:true}).filter(x=>/\.m?js$/.test(x)&&x!=='index.js').map(x=>({type:'ESModule',path:root+'/'+x}))];
const mf=new Miniflare({modulesRoot:root,modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PILOT_OWNER_EMAIL:'owner@access.test',COMMAND_CENTER_PILOT:'isolated',COMMAND_CENTER_DATASET_ID:'access-daf-disposable',ACCESS_DAF_ENABLED:'1'},cf:false});
try {
 const db=await mf.getD1Database('DB');
 const migrations=fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort();
 const statements=migrations.flatMap(x=>fs.readFileSync('drizzle/'+x,'utf8').split('--> statement-breakpoint')).map(x=>x.trim()).filter(Boolean);
 await db.batch(statements.map(x=>db.prepare(x)));
 await require(process.cwd()+'/tests/access-api.cjs')({mf,db,migrations});
}finally{await mf.dispose();}
