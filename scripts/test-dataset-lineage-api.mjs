// Disposable local Worker/D1/R2 only. These headers simulate platform identities;
// they are never sent to a hosted application or used to bypass real login.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(fs.realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const modules=[{type:'ESModule',path:process.cwd()+'/dist/server/index.js'},...fs.readdirSync('dist/server',{recursive:true}).filter(x=>/\.m?js$/.test(x)&&x!=='index.js').map(x=>({type:'ESModule',path:process.cwd()+'/dist/server/'+x}))];
const rootId='cc-lineage-local-root';
const make=(isolated=true)=>new Miniflare({modulesRoot:process.cwd()+'/dist/server',modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PILOT_OWNER_EMAIL:'owner@pilot.test',...(isolated?{COMMAND_CENTER_PILOT:'isolated',COMMAND_CENTER_DATASET_ID:rootId}:{})},cf:false});
const mf=make(),legacy=make(false);
let pass=0;
function ok(name,value=true){assert.ok(value,name);pass++;console.log('PASS',name);}
async function api(path,body,user='owner',method=body?'POST':'GET',worker=mf){
 const r=await worker.dispatchFetch('http://lineage.local'+path,{method,headers:{...(user?{'oai-authenticated-user-id':'lineage-'+user,'oai-authenticated-user-email':user+'@pilot.test'}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw new Error('Unexpected non-JSON API response: '+raw.slice(0,300));}return {status:r.status,data};
}
async function snapshot(user='owner',path='/api/command-center/state',worker=mf){const out=await api(path,undefined,user,'GET',worker);assert.equal(out.status,200,JSON.stringify(out.data));return out.data;}
async function command(c,user='owner'){const before=await snapshot();return api('/api/command-center/action',{command:c,version:before.dataset.version,operationId:crypto.randomUUID()},user);}
async function go(c,user='owner'){const out=await command(c,user);assert.equal(out.status,200,JSON.stringify(out.data));return out.data;}
async function backup(type,extra={}){const before=await snapshot();const out=await api('/api/backup',{type,...extra,version:before.dataset.version,operationId:crypto.randomUUID()});assert.equal(out.status,200,JSON.stringify(out.data));return out.data;}
async function migrate(worker){const db=await worker.getD1Database('DB');const sql=fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort().map(x=>fs.readFileSync('drizzle/'+x,'utf8')).join('\n--> statement-breakpoint\n').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);await db.batch(sql.map(x=>db.prepare(x)));return db;}
try{
 const db=await migrate(mf);await migrate(legacy);
 let data=await snapshot();ok('Configured root opens in the isolated Command Center',data.dataset.id===rootId&&data.actor.role==='owner');
 ok('The legacy state endpoint reads the same isolated root',(await snapshot('owner','/api/state')).dataset.id===rootId);
 await go({type:'seed'});data=await snapshot();const productCount=data.state.products.length,projectId=data.state.projects[0].id;
 assert.ok(productCount>0,'The backup fixture must contain persisted records');
 await db.batch([
  db.prepare("INSERT INTO members(user_id,name,role,function,active) VALUES ('lineage-viewer','Scoped test viewer','viewer','all',1)"),
  db.prepare("INSERT INTO members(user_id,name,role,function,active) VALUES ('lineage-disabled','Disabled test account','viewer','all',0)"),
  db.prepare("INSERT INTO members(user_id,name,role,function,active) VALUES ('lineage-unassigned','Unassigned test account','contributor','all',1)"),
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').bind('member_scope:lineage-viewer',JSON.stringify([projectId])),
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').bind('member_operations:lineage-viewer',JSON.stringify({warehouseIds:null,resourceIds:null}))
 ]);
 const membershipState=async()=>JSON.stringify({members:(await db.prepare('SELECT * FROM members ORDER BY user_id').all()).results,scopes:(await db.prepare("SELECT * FROM settings WHERE key LIKE 'member_scope:%' OR key LIKE 'member_operations:%' ORDER BY key").all()).results});
 const originalMemberships=await membershipState();
 const scopedBefore=await snapshot('viewer');ok('Existing project scope filters the root snapshot',scopedBefore.state.projects.length===1&&scopedBefore.state.projects[0].id===projectId&&scopedBefore.members.length===0);
 const firstBackup=await backup('backup');
 const firstRestore=await backup('restore',{backupId:firstBackup.id});
 data=await snapshot();const firstRestoredId=data.dataset.id;
 ok('Actual owner restore opens its newly active descendant',firstRestoredId===firstRestore.datasetId&&firstRestoredId!==rootId&&data.state.products.length===productCount);
 ok('Legacy state cannot strand an owner after a real restore',(await snapshot('owner','/api/state')).dataset.id===firstRestoredId);
 ok('Draft read accepts the same proven restored dataset',(await api('/api/command-center/draft?key=lineage-read')).status===200);
 const provenance=await db.prepare('SELECT d.created_at,a.at,a.action,a.details FROM datasets d JOIN audit a ON a.dataset_id=d.id WHERE d.id=? AND a.at=d.created_at').bind(firstRestoredId).all();
 ok('Real restore emits one creation-time provenance edge',provenance.results.length===1&&provenance.results[0].action==='restore'&&JSON.parse(provenance.results[0].details).fromDataset===rootId);
 const secondBackup=await backup('backup');
 await backup('restore',{backupId:secondBackup.id});
 const nested=await snapshot();
 ok('A nested real restore remains reachable through both ancestry hops',nested.dataset.id!==firstRestoredId&&nested.state.products.length===productCount&&(await snapshot('owner','/api/state')).dataset.id===nested.dataset.id);
 const scopedAfter=await snapshot('viewer');
 ok('Restore never widens the existing project scope',JSON.stringify(scopedAfter.actor.projectIds)===JSON.stringify([projectId])&&scopedAfter.state.projects.every(p=>p.id===projectId)&&scopedAfter.members.length===0);
 ok('Viewer still cannot write after restore',(await command({type:'master',kind:'customers',data:{code:'DENIED-LINEAGE',name:'Must not exist'}},'viewer')).status===403);
 ok('Non-owner still cannot invoke restoration',(await api('/api/backup',{type:'restore',backupId:firstBackup.id,version:nested.dataset.version,operationId:crypto.randomUUID()},'viewer')).status===403);
 ok('Anonymous access is still denied',(await api('/api/command-center/state',undefined,null)).status===401);
 ok('An unrelated identity cannot claim an existing owner',(await api('/api/command-center/state',undefined,'stranger')).status===403);
 ok('Inactive membership remains denied',(await api('/api/state',undefined,'disabled')).status===403);
 ok('Contributor with unassigned function remains denied',(await api('/api/command-center/state',undefined,'unassigned')).status===403);
 await backup('reset',{confirmation:'RESET'});data=await snapshot();const goodId=data.dataset.id;
 ok('Actual owner reset creates an accepted empty descendant',data.state.products.length===0&&goodId!==nested.dataset.id&&(await snapshot('owner','/api/state')).dataset.id===goodId);
 ok('Repair leaves member roles, activation and permission settings unchanged',await membershipState()===originalMemberships);

 // Read-only validation must not create provenance, switch datasets, or mutate
 // any operational table. Auth bootstrap was deliberately completed above.
 // D1 reserves _cf_ metadata, which is not an application table and cannot be
 // read through its SQL API. Fingerprint every readable application table.
 async function databaseImage(){const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results.filter(({name})=>!name.toLowerCase().startsWith('_cf_'));const out={};for(const {name} of tables){const rows=(await db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()).results;out[name]=rows.map(x=>JSON.stringify(x)).sort();}return JSON.stringify(out);}
 const beforeRead=await databaseImage();
 await snapshot();await snapshot('owner','/api/state');await api('/api/command-center/draft?key=read-only-lineage');
 ok('Successful dataset validation and state reads perform no database writes',await databaseImage()===beforeRead);

 let tick=0;
 // Synthetic descendants are later than the runtime-created root, so an
 // unrelated chronology failure cannot mask the intended depth/cycle checks.
 const fixtureEpoch=Date.now()+1000;
 const timestamp=()=>new Date(fixtureEpoch+1000*(++tick)).toISOString();
 async function addDataset(id,{parent,details,action='restore',auditAt,createdAt,edges=1,withAudit=true}={}){
  const at=createdAt??timestamp();await db.prepare('INSERT INTO datasets(id,name,version,active,created_at) VALUES (?,?,0,0,?)').bind(id,'LOCAL LINEAGE TEST '+id,at).run();
  if(withAudit)for(let i=0;i<edges;i++)await db.prepare('INSERT INTO audit(id,dataset_id,user_id,action,details,at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'lineage-owner',action,details??JSON.stringify({fromDataset:parent,backupId:'local-fixture'}),auditAt??at).run();
  return at;
 }
 async function activate(id){await db.batch([db.prepare('UPDATE datasets SET active=0'),db.prepare('UPDATE datasets SET active=1 WHERE id=?').bind(id)]);}
 async function denied(id,name,{activateFirst=true}={}){
  if(activateFirst)await activate(id);const before=await databaseImage();
  for(const path of ['/api/command-center/state','/api/state','/api/command-center/draft?key=invalid-lineage']){const out=await api(path);assert.equal(out.status,503,name+' '+path+' '+JSON.stringify(out.data));assert.equal(out.data.code,'PILOT_ISOLATION',name+' '+path);}
  const write=await api('/api/command-center/action',{command:{type:'master',kind:'customers',data:{code:'BAD-LINEAGE',name:'Must not save'}},version:0,operationId:crypto.randomUUID()});
  assert.equal(write.status,503,name+' action');assert.equal(write.data.code,'PILOT_ISOLATION',name+' action');
  ok(name,await databaseImage()===before);await activate(goodId);
 }
 await db.prepare('UPDATE datasets SET active=1 WHERE id=?').bind(rootId).run();
 await denied(goodId,'Multiple active trusted datasets require review instead of choosing one',{activateFirst:false});
 await addDataset('pilot-guessed-prefix',{withAudit:false});await denied('pilot-guessed-prefix','A pilot-prefixed dataset without provenance fails closed without writes');
 await addDataset('lineage-orphan',{parent:'does-not-exist'});await denied('lineage-orphan','An orphan provenance parent is rejected by all state and draft paths');
 await addDataset('lineage-wrong-root',{withAudit:false});await addDataset('lineage-other-child',{parent:'lineage-wrong-root'});await denied('lineage-other-child','A valid-looking edge to an unrelated root does not bypass isolation');
 await addDataset('lineage-malformed',{details:'{"fromDataset":'});await denied('lineage-malformed','Malformed provenance JSON fails closed');
 await addDataset('lineage-array',{details:'[]'});await denied('lineage-array','Non-object provenance is rejected');
 await addDataset('lineage-empty-parent',{details:JSON.stringify({fromDataset:''})});await denied('lineage-empty-parent','Empty provenance parent is rejected');
 await addDataset('lineage-wrong-time',{parent:rootId,auditAt:'2000-01-01T00:00:00.000Z'});await denied('lineage-wrong-time','An audit outside dataset creation time cannot establish lineage');
 await addDataset('lineage-duplicate',{parent:rootId,edges:2});await denied('lineage-duplicate','Duplicate creation-time lineage records are rejected as ambiguous');
 await addDataset('lineage-wrong-action',{parent:rootId,action:'create_request'});await denied('lineage-wrong-action','Ordinary actions cannot masquerade as restoration provenance');
 await addDataset('pilot-main',{parent:rootId});await denied('pilot-main','The reserved legacy pilot-main is rejected even with an apparent parent');
 await addDataset('lineage-via-pilot-main',{parent:'pilot-main'});await denied('lineage-via-pilot-main','A reserved pilot-main ancestor cannot connect a descendant to the root');
 const futureParentTime=await addDataset('lineage-future-parent',{parent:rootId});await addDataset('lineage-before-parent',{parent:'lineage-future-parent',createdAt:new Date(Date.parse(futureParentTime)-1000).toISOString()});await denied('lineage-before-parent','A child created before its alleged parent is rejected');
 await addDataset('lineage-self',{parent:'lineage-self'});await denied('lineage-self','A self-referencing provenance cycle fails closed');
 const cycleTime=timestamp();await addDataset('lineage-cycle-a',{parent:'lineage-cycle-b',createdAt:cycleTime});await addDataset('lineage-cycle-b',{parent:'lineage-cycle-a',createdAt:cycleTime});await denied('lineage-cycle-a','A multi-dataset provenance cycle fails closed');
 let parent=rootId;for(let i=0;i<21;i++){const id='lineage-deep-'+i;await addDataset(id,{parent});parent=id;}
 await activate('lineage-deep-19');ok('Exactly twenty verified lineage hops remain accepted',(await snapshot()).dataset.id==='lineage-deep-19'&&(await snapshot('owner','/api/state')).dataset.id==='lineage-deep-19');await activate(goodId);
 await denied(parent,'A twenty-first lineage hop is bounded and rejected');
 ok('The proven active dataset still opens after all invalid isolated fixtures',(await snapshot()).dataset.id===goodId);
 const legacyData=await snapshot('owner','/api/state',legacy);ok('Non-isolated legacy state behavior remains unchanged',legacyData.dataset.id==='pilot-main');
 const legacyReset=await api('/api/backup',{type:'reset',confirmation:'RESET',version:legacyData.dataset.version,operationId:crypto.randomUUID()},'owner','POST',legacy);assert.equal(legacyReset.status,200,JSON.stringify(legacyReset.data));
 ok('Non-isolated legacy reset still opens without isolated lineage configuration',(await snapshot('owner','/api/state',legacy)).dataset.id===legacyReset.data.datasetId);
 ok('The Command Center still requires its explicit isolated configuration',(await api('/api/command-center/state',undefined,'owner','GET',legacy)).status===503);
 console.log(JSON.stringify({suite:'Dataset lineage startup repair; disposable local Worker/D1/R2, simulated identities',pass,fail:0}));
}catch(e){console.error('FAIL',e);process.exitCode=1;}finally{await Promise.all([mf.dispose(),legacy.dispose()]);}
