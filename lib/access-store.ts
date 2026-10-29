import { env } from 'cloudflare:workers';
import { demand, type Actor, type Role } from './model';
import { accessEnabled, hashPassword } from './access-auth';
import { permissionRegistry, permissionDecision } from './access-policy';
import { commandCenterConfig, requireCommandCenterDataset, requireCommandCenterActor } from './command-center-isolation';

type Scope = string[] | null;
type Override = 'default' | 'allow' | 'deny';
type SessionProof = { id:string; accountRevision:number; grantRevision:number };
type GrantRow = {id:string;dataset_id:string;active:number;revision:number;starts_at:string|null;ends_at:string|null;unlimited:number;project_ids:string;warehouse_ids:string;resource_ids:string;ceiling:string;updated_at:string;updated_by:string};
type AccountRow = {user_id:string;username:string;email:string;password_hash:string;active:number;revision:number;grant_id:string|null;client_admin:number;starts_at:string|null;ends_at:string|null;unlimited:number;overrides:string;created_by:string;updated_at:string};
const db=()=>{const d=(env as Cloudflare.Env).DB;demand(d,'Access storage unavailable / تخزين الوصول غير متاح','UNAVAILABLE',503);return d;};
const q=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
const now=()=>new Date().toISOString();
const parse=<T>(value:string):T=>JSON.parse(value);
export const intersectScope=(a:Scope,b:Scope):Scope=>a===null?b:b===null?a:a.filter(id=>b.includes(id));
const subset=(a:Scope,b:Scope)=>b===null||a!==null&&a.every(id=>b.includes(id));
const originals=(a:Actor)=>({projectIds:a.projectIds??null,warehouseIds:a.warehouseIds??null,resourceIds:a.resourceIds??null});
const context=(a:Actor)=> (a as any).access as any;
async function ownerId(){return (await q("SELECT value FROM settings WHERE key='owner_id'").first<{value:string}>())?.value||'';}
async function currentDataset(){const rows=await q('SELECT id,name,created_at FROM datasets WHERE active=1 ORDER BY created_at DESC LIMIT 2').all<{id:string;name:string;created_at:string}>();demand(rows.results.length===1,'A verified single active DAF dataset is required / يلزم نطاق DAF نشط واحد موثق','PILOT_ISOLATION',503);const d=rows.results[0];if(commandCenterConfig().enabled)await requireCommandCenterDataset(d,db());return d;}
// A dataset restore does not create a new customer delegation or bypass its suspension.
const grantDatasetId=(activeId:string)=>(env as Cloudflare.Env&{COMMAND_CENTER_DATASET_ID?:string}).COMMAND_CENTER_DATASET_ID||activeId;
function inPeriod(value:{active:number;starts_at:string|null;ends_at:string|null;unlimited:number},at=now()){
 return !!value.active&&(!value.starts_at||value.starts_at<=at)&&(!!value.unlimited||!!value.ends_at&&value.ends_at>at);
}
function grantView(g:GrantRow|null){return g?{id:g.id,datasetId:g.dataset_id,active:!!g.active,revision:g.revision,startsAt:g.starts_at,endsAt:g.ends_at,unlimited:!!g.unlimited,projectIds:parse<Scope>(g.project_ids),warehouseIds:parse<Scope>(g.warehouse_ids),resourceIds:parse<Scope>(g.resource_ids),ceiling:parse<string[]>(g.ceiling),updatedAt:g.updated_at}:null;}
async function memberView(userId:string){
 const m=await q('SELECT user_id AS userId,name,role,function,active FROM members WHERE user_id=?',userId).first<any>();
 if(!m)return null;
 const p=await q('SELECT value FROM settings WHERE key=?','member_scope:'+userId).first<{value:string}>();
 const o=await q('SELECT value FROM settings WHERE key=?','member_operations:'+userId).first<{value:string}>();
 return {...m,projectIds:p?parse<Scope>(p.value):null,...(o?parse<any>(o.value):{warehouseIds:null,resourceIds:null})};
}
async function accountView(row:AccountRow){const m=await memberView(row.user_id);return {...m,username:row.username,email:row.email,active:!!row.active&&!!m?.active,clientAdmin:!!row.client_admin,startsAt:row.starts_at,endsAt:row.ends_at,unlimited:!!row.unlimited,revision:row.revision,grantId:row.grant_id,overrides:parse<Record<string,Override>>(row.overrides)};}

/** Apply only explicit grants. The additive migration enrolls nobody and grants no new powers. */
export async function decorateAccessActor(a:Actor,session?:SessionProof):Promise<Actor>{
 if(!accessEnabled())return a;
 const verifiedOwner=(await ownerId())===a.userId;
 const raw=originals(a);
 if(verifiedOwner){
  const ownerAccount=session?await q('SELECT revision,active FROM access_accounts WHERE user_id=?',a.userId).first<{revision:number;active:number}>():null;
  if(session)demand(ownerAccount?.active&&ownerAccount.revision===session.accountRevision,'Owner session ended; sign in again / انتهت جلسة المالك','AUTH',401);
  (a as any).platformOwner=true;(a as any).clientAdmin=false;
  (a as any).access={enabled:true,platformOwner:true,clientAdmin:false,overrides:{},ceiling:['*'],accountRevision:session?.accountRevision||0,grantRevision:0,grantId:null,sessionId:session?.id,originalScopes:raw,sourceProjectIds:raw.projectIds,sourceWarehouseIds:raw.warehouseIds,sourceResourceIds:raw.resourceIds,originalRole:a.role,originalFunction:a.function};
  return a;
 }
 // A mutable role name can never become platform ownership.
 demand(a.role!=='owner','Unverified owner membership / ملكية الحساب تحتاج تحققًا','MEMBERSHIP',403);
 const d=await currentDataset(),g=await q('SELECT * FROM access_grants WHERE dataset_id=?',grantDatasetId(d.id)).first<GrantRow>();
 const account=await q('SELECT * FROM access_accounts WHERE user_id=?',a.userId).first<AccountRow>();
 (a as any).platformOwner=false;(a as any).clientAdmin=false;
 if(!g){demand(!account,'Access delegation not configured / تفويض الوصول غير معد','ACCESS_STOPPED',403);return a;}
 demand(inPeriod(g),'Workspace access stopped or expired / وصول الجهة موقوف أو منتهٍ','ACCESS_STOPPED',403);
 if(account){
  demand(account.grant_id===g.id&&inPeriod(account),'Account access stopped or expired / وصول الحساب موقوف أو منتهٍ','ACCESS_STOPPED',403);
  // Enrollment is explicit. A managed account must establish a fresh app session;
  // removing a revoked cookie must not fall back to an older platform session.
  demand(session,'Use password sign-in for this managed account / سجّل الدخول بكلمة المرور لهذا الحساب المُدار','AUTH',401);
  if(session)demand(session.accountRevision===account.revision&&session.grantRevision===g.revision,'Session ended; sign in again / انتهت الجلسة؛ سجّل الدخول من جديد','AUTH',401);
 }
 const effective={projectIds:intersectScope(raw.projectIds,parse<Scope>(g.project_ids)),warehouseIds:intersectScope(raw.warehouseIds,parse<Scope>(g.warehouse_ids)),resourceIds:intersectScope(raw.resourceIds,parse<Scope>(g.resource_ids))};
 Object.assign(a,effective);
 (a as any).clientAdmin=!!account?.client_admin;
 (a as any).access={enabled:true,platformOwner:false,clientAdmin:!!account?.client_admin,overrides:account?parse<Record<string,Override>>(account.overrides):{},ceiling:parse<string[]>(g.ceiling),accountRevision:account?.revision||0,grantRevision:g.revision,grantId:g.id,sessionId:session?.id,originalScopes:raw,sourceProjectIds:raw.projectIds,sourceWarehouseIds:raw.warehouseIds,sourceResourceIds:raw.resourceIds,originalRole:a.role,originalFunction:a.function};
 return a;
}

/** Guards run in the same D1 batch as the operation, preventing a stale authorization write. */
export function accessCommitGuards(a:Actor,key:string):D1PreparedStatement[]{
 const x=context(a);if(!accessEnabled()||!x)return [];
 const at=now(),id=key+':access-daf';
 if(x.platformOwner){
  let sql="INSERT INTO transaction_guards(id,ok) SELECT ?,CASE WHEN (SELECT value FROM settings WHERE key='owner_id')=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND active=1)";const args:any[]=[id,a.userId,a.userId];
  if(x.sessionId){sql+=' AND EXISTS(SELECT 1 FROM access_accounts WHERE user_id=? AND active=1 AND revision=?) AND EXISTS(SELECT 1 FROM access_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?)';args.push(a.userId,x.accountRevision,x.sessionId,a.userId,at);}
  sql+=' THEN 1 ELSE 0 END';return [q(sql,...args),q('DELETE FROM transaction_guards WHERE id=?',id)];
 }
 let sql="INSERT INTO transaction_guards(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM access_grants g WHERE g.id=? AND g.revision=? AND g.active=1 AND (g.starts_at IS NULL OR g.starts_at<=?) AND (g.unlimited=1 OR g.ends_at>?))";
 const args:any[]=[id,x.grantId,x.grantRevision,at,at];
 const raw=x.originalScopes||originals(a);
 sql+=" AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND active=1 AND role=? AND function=?) AND COALESCE((SELECT value FROM settings WHERE key=?),'null')=? AND COALESCE((SELECT value FROM settings WHERE key=?),?)=?";
 args.push(a.userId,a.role,a.function,'member_scope:'+a.userId,JSON.stringify(raw.projectIds??null),'member_operations:'+a.userId,JSON.stringify({warehouseIds:null,resourceIds:null}),JSON.stringify({warehouseIds:raw.warehouseIds??null,resourceIds:raw.resourceIds??null}));
 if(x.accountRevision){sql+=" AND EXISTS(SELECT 1 FROM access_accounts a WHERE a.user_id=? AND a.revision=? AND a.active=1 AND (a.starts_at IS NULL OR a.starts_at<=?) AND (a.unlimited=1 OR a.ends_at>?))";args.push(a.userId,x.accountRevision,at,at);}
 if(x.sessionId){sql+=" AND EXISTS(SELECT 1 FROM access_sessions s WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>?)";args.push(x.sessionId,a.userId,at);}
 sql+=' THEN 1 ELSE 0 END';
 return [q(sql,...args),q('DELETE FROM transaction_guards WHERE id=?',id)];
}
export function demandAccessManagement(a:Actor,owner=false){
 demand(accessEnabled(),'Access management not enabled / إدارة الوصول غير مفعلة','NOT_FOUND',404);
 const x=context(a);demand(x?.platformOwner||!owner&&x?.clientAdmin&&permissionDecision(a,'users.manage').allowed,'Access management forbidden / إدارة الوصول غير مسموحة','FORBIDDEN',403);
}
export function publicAccessActor(a:Actor):Actor{
 const x=context(a);if(!x)return a;
 const {originalScopes,originalScope,sourceProjectIds,sourceWarehouseIds,sourceResourceIds,originalRole,originalFunction,sessionId,...safe}=x;
 return {...a,access:safe} as Actor;
}
export async function recordAccessFailure(a:Actor|null){
 if(!accessEnabled())return;
 // Fixed labels only. Never retain raw request bodies, credentials or errors.
 await q('INSERT INTO access_security_events(id,at,event,outcome,user_id,subject_hash) VALUES (?,?,?,?,?,NULL)',crypto.randomUUID(),now(),'access_management','denied',a?.userId||null).run();
}
const visibleTarget=(a:Actor,target:any)=>context(a)?.platformOwner||subset(target.projectIds??null,a.projectIds??null)&&subset(target.warehouseIds??null,a.warehouseIds??null)&&subset(target.resourceIds??null,a.resourceIds??null);
async function records(kind:string,datasetId:string){return (await q(`SELECT t.data FROM ${kind} t JOIN entities e ON e.id=t.id WHERE e.dataset_id=?`,datasetId).all<{data:string}>()).results.map(r=>parse<any>(r.data));}
export async function accessSnapshot(a:Actor){
 demandAccessManagement(a);
 const d=await currentDataset(),g=await q('SELECT * FROM access_grants WHERE dataset_id=?',grantDatasetId(d.id)).first<GrantRow>(),owner=!!context(a)?.platformOwner,oid=await ownerId();
 const rows=(await q('SELECT * FROM access_accounts ORDER BY username').all<AccountRow>()).results;
 const accounts=(await Promise.all(rows.filter(row=>row.user_id!==oid&&(owner||row.grant_id===g?.id)).map(accountView))).filter(t=>visibleTarget(a,t));
 const rawAudit=owner?await q('SELECT * FROM access_audit ORDER BY at DESC LIMIT 200').all<any>():await q("SELECT * FROM access_audit WHERE grant_id=? AND audience='client' ORDER BY at DESC LIMIT 200",g?.id||'').all<any>();
 const permitted=new Set(accounts.map(t=>t.userId));
 const auditData=(raw:string)=>{const value=parse<any>(raw);if(owner||!value)return value;const out={...value};for(const [field,scope] of [['projectIds',a.projectIds??null],['warehouseIds',a.warehouseIds??null],['resourceIds',a.resourceIds??null]] as const)if(field in out)out[field]=intersectScope(out[field]??null,scope);return out;};
 const audit=rawAudit.results.filter(r=>owner||permitted.has(r.target_id)).map(r=>({id:r.id,at:r.at,actorId:!owner&&r.actor_id===oid?'platform-administration':r.actor_id,action:r.action,targetId:r.target_id,reason:r.reason,before:auditData(r.before_json),after:auditData(r.after_json),outcome:r.outcome}));
 const security=owner?(await q('SELECT event,outcome,COUNT(*) AS count,MAX(at) AS at FROM access_security_events WHERE at>? GROUP BY event,outcome',new Date(Date.now()-86400000).toISOString()).all<any>()).results:[];
 const memberRows=(await q("SELECT user_id AS userId,name,role,function,active FROM members WHERE user_id<>? AND role<>'owner' ORDER BY name",oid).all<any>()).results;
 const members=owner?await Promise.all(memberRows.map(m=>memberView(m.userId))):[];
 const ownerAccount=owner?rows.find(row=>row.user_id===oid):undefined;
 let projects=await records('projects',d.id),warehouses=await records('warehouses',d.id),resources=await records('resources',d.id);
 if(!owner){projects=projects.filter(r=>a.projectIds==null||a.projectIds.includes(r.id));warehouses=warehouses.filter(r=>a.warehouseIds==null||a.warehouseIds.includes(r.id));resources=resources.filter(r=>a.resourceIds==null||a.resourceIds.includes(r.id));}
 const visibleGrant=grantView(g);if(visibleGrant&&!owner){visibleGrant.projectIds=a.projectIds??null;visibleGrant.warehouseIds=a.warehouseIds??null;visibleGrant.resourceIds=a.resourceIds??null;visibleGrant.ceiling=visibleGrant.ceiling.filter(key=>permissionDecision(a,key).allowed);}
 return {actor:publicAccessActor(a),accounts,ownerCredentials:ownerAccount?{userId:oid,username:ownerAccount.username,email:ownerAccount.email,revision:ownerAccount.revision}:null,grant:visibleGrant,registry:permissionRegistry.filter(p=>owner||!p.ownerOnly),audit,security,projects,warehouses,resources,members,serverTime:now(),workspace:{id:d.id,name:d.name}};
}
function cleanText(value:unknown,max:number,label:string){demand(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,label);return value.trim();}
function period(data:any){
 const unlimited=data.unlimited===true;
 const date=(v:any)=>{if(v===null||v===undefined||v==='')return null;demand(typeof v==='string'&&Number.isFinite(Date.parse(v)),'Valid server access date required / تاريخ وصول صحيح مطلوب');return new Date(v).toISOString();};
 const startsAt=date(data.startsAt),endsAt=unlimited?null:date(data.endsAt);
 demand(unlimited||endsAt,'Choose an expiry or explicitly unlimited access / حدد انتهاءً أو اختر وصولًا بلا انتهاء صراحة');
 demand(!startsAt||!endsAt||startsAt<endsAt,'Start must precede expiry / البداية تسبق الانتهاء');
 return {startsAt,endsAt,unlimited};
}
function normalizeScope(value:any,valid:Set<string>,label:string):Scope{if(value===null)return null;demand(Array.isArray(value)&&value.length<=2000&&value.every(v=>typeof v==='string'&&valid.has(v)),label);return [...new Set<string>(value)];}
const safeAccount=(row:any)=>{if(!row)return null;const {password_hash,passwordHash,password,hash,token,secret,...safe}=row;return safe;};
function event(a:Actor,action:string,targetId:string|null,grantId:string|null,reason:string,before:any,after:any,audience:'owner'|'client'='client'){
 return q('INSERT INTO access_audit(id,at,actor_id,action,target_id,grant_id,audience,reason,before_json,after_json,outcome) VALUES (?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),now(),a.userId,action,targetId,grantId,audience,reason,JSON.stringify(safeAccount(before)),JSON.stringify(safeAccount(after)),'success');
}
function concurrencyGuard(id:string,query:string,args:any[]){return q(`INSERT INTO transaction_guards(id,ok) SELECT ?,CASE WHEN ${query} THEN 1 ELSE 0 END`,id,...args);}
async function commitAccess(a:Actor,statements:D1PreparedStatement[]){await db().batch([...accessCommitGuards(a,'access-'+crypto.randomUUID()),...statements]);}

export async function accessAction(a:Actor,body:any){
 demandAccessManagement(a);demand(body&&typeof body==='object'&&!Array.isArray(body),'Valid access action required');
 const reason=cleanText(body.reason,500,'Reason required / سبب التغيير مطلوب');
 const revision=body.expectedRevision;demand(Number.isSafeInteger(revision)&&revision>=0,'Expected revision required / رقم مراجعة مطلوب');
 const d=await currentDataset(),owner=!!context(a)?.platformOwner,oid=await ownerId();
 const workspaceDatasetId=grantDatasetId(d.id);
 const g=await q('SELECT * FROM access_grants WHERE dataset_id=?',workspaceDatasetId).first<GrantRow>();
 const action=body.action;
 if(action==='owner_credentials'){
  demandAccessManagement(a,true);demand(a.userId===oid,'Verified owner required','FORBIDDEN',403);
  const row=await q('SELECT * FROM access_accounts WHERE user_id=?',oid).first<AccountRow>();
  demand(revision===(row?.revision||0),'Owner login changed; refresh','CONFLICT',409);
  const username=cleanText(body.username,128,'Login required').normalize('NFKC').toLowerCase();
  demand(/^[\p{L}\p{N}][\p{L}\p{N}._@+\-]{2,127}$/u.test(username),'Invalid login');
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';demand(email.length<=254&&(!email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),'Invalid email');
  demand(!(await q('SELECT user_id FROM access_accounts WHERE user_id<>? AND (username=? OR lower(email)=? OR (?<>\'\' AND (username=? OR lower(email)=?)))',oid,username,username,email,email,email).first()),'Login or email already used','DUPLICATE',409);
  const password=body.password;demand(password===undefined||typeof password==='string','Invalid password');demand(row||typeof password==='string'&&password.length>0,'New owner login needs a password');
  const passwordHash=typeof password==='string'&&password!==''?await hashPassword(password):row!.password_hash;
  const at=now(),guard='owner-credentials-'+crypto.randomUUID();
  const before=row?{userId:oid,username:row.username,email:row.email,revision:row.revision}:null,after={userId:oid,username,email,revision:revision+1};
  await commitAccess(a,[row?concurrencyGuard(guard,'EXISTS(SELECT 1 FROM access_accounts WHERE user_id=? AND revision=?)',[oid,revision]):concurrencyGuard(guard,'NOT EXISTS(SELECT 1 FROM access_accounts WHERE user_id=?)',[oid]),concurrencyGuard(guard+':login',"NOT EXISTS(SELECT 1 FROM access_accounts WHERE user_id<>? AND (username=? OR lower(email)=? OR (?<>'' AND (username=? OR lower(email)=?))))",[oid,username,username,email,email,email]),q('INSERT INTO access_accounts(user_id,username,email,password_hash,active,revision,grant_id,client_admin,starts_at,ends_at,unlimited,overrides,created_by,updated_at) VALUES (?,?,?,?,1,?,NULL,0,NULL,NULL,1,?, ?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,email=excluded.email,password_hash=excluded.password_hash,revision=excluded.revision,updated_at=excluded.updated_at',oid,username,email,passwordHash,revision+1,'{}',oid,at),q('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',at,oid),event(a,'owner_credentials',oid,null,reason.replaceAll(typeof password==='string'&&password?password:'\u0000','[redacted]'),before,after,'owner'),q('DELETE FROM transaction_guards WHERE id IN (?,?)',guard,guard+':login')]);
  return {saved:true,userId:oid,revision:revision+1};
 }
 if(action==='save_grant'){
  demandAccessManagement(a,true);
  const data=body.grant;demand(data&&typeof data==='object','Grant required');
  demand(revision===(g?.revision||0),'Grant changed; refresh and review / تغيّر التفويض؛ حدّث وراجع','CONFLICT',409);
  const p=period(data);
  const [projects,warehouses,resources]=await Promise.all([records('projects',d.id),records('warehouses',d.id),records('resources',d.id)]);
  const projectIds=normalizeScope(data.projectIds,new Set(projects.map(r=>r.id)),'Invalid project scope'),warehouseIds=normalizeScope(data.warehouseIds,new Set(warehouses.map(r=>r.id)),'Invalid warehouse scope'),resourceIds=normalizeScope(data.resourceIds,new Set(resources.map(r=>r.id)),'Invalid courier scope');
  const keys=new Set(permissionRegistry.filter(x=>!x.ownerOnly).map(x=>x.key));
  demand(Array.isArray(data.ceiling)&&data.ceiling.length<=1000&&data.ceiling.every((key:any)=>typeof key==='string'&&keys.has(key)),'Select a valid permission ceiling / حدد سقف صلاحيات صحيح');
  const ceiling=[...new Set<string>(data.ceiling)],id=g?.id||crypto.randomUUID(),at=now(),active=data.active!==false?1:0;
  const next={id,datasetId:workspaceDatasetId,active:!!active,revision:revision+1,...p,projectIds,warehouseIds,resourceIds,ceiling};
  const guard='grant-'+crypto.randomUUID();
  const statements=[g?concurrencyGuard(guard,'EXISTS(SELECT 1 FROM access_grants WHERE id=? AND revision=?)',[id,revision]):concurrencyGuard(guard,'NOT EXISTS(SELECT 1 FROM access_grants WHERE dataset_id=?)',[workspaceDatasetId]),
   q('INSERT INTO access_grants(id,dataset_id,active,revision,starts_at,ends_at,unlimited,project_ids,warehouse_ids,resource_ids,ceiling,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,revision=excluded.revision,starts_at=excluded.starts_at,ends_at=excluded.ends_at,unlimited=excluded.unlimited,project_ids=excluded.project_ids,warehouse_ids=excluded.warehouse_ids,resource_ids=excluded.resource_ids,ceiling=excluded.ceiling,updated_at=excluded.updated_at,updated_by=excluded.updated_by',id,workspaceDatasetId,active,revision+1,p.startsAt,p.endsAt,p.unlimited?1:0,JSON.stringify(projectIds),JSON.stringify(warehouseIds),JSON.stringify(resourceIds),JSON.stringify(ceiling),at,a.userId),
   q('UPDATE access_sessions SET revoked_at=? WHERE user_id IN (SELECT user_id FROM access_accounts WHERE grant_id=?) AND revoked_at IS NULL',at,id),event(a,'save_grant',id,id,reason,grantView(g),next,'owner'),q('DELETE FROM transaction_guards WHERE id=?',guard)];
  await commitAccess(a,statements);return {saved:true,grant:next,revision:revision+1};
 }
 demand(g,'Owner must create explicit workspace delegation first / ينشئ المالك تفويض الجهة أولًا','ACCESS_UNCONFIGURED',409);
 if(!owner)demand(inPeriod(g),'Workspace access stopped or expired','FORBIDDEN',403);
 if(action==='revoke_sessions'){
  const userId=cleanText(body.userId,180,'Account required');demand(userId!==oid,'Platform owner protected / حساب مالك المنصة محمي','FORBIDDEN',403);
  const row=await q('SELECT * FROM access_accounts WHERE user_id=? AND grant_id=?',userId,g.id).first<AccountRow>();
  demand(row,'Account not found','NOT_FOUND',404);const before=await accountView(row);demand(visibleTarget(a,before),'Account outside scope','FORBIDDEN',403);demand(revision===row.revision,'Account changed; refresh','CONFLICT',409);
  const guard='sessions-'+crypto.randomUUID(),at=now();await commitAccess(a,[concurrencyGuard(guard,'EXISTS(SELECT 1 FROM access_accounts WHERE user_id=? AND revision=?)',[userId,revision]),q('UPDATE access_accounts SET revision=revision+1,updated_at=? WHERE user_id=?',at,userId),q('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',at,userId),event(a,'revoke_sessions',userId,g.id,reason,before,{...before,revision:revision+1}),q('DELETE FROM transaction_guards WHERE id=?',guard)]);return {saved:true,userId,revision:revision+1};
 }
 demand(action==='upsert_account','Unknown access action / إجراء وصول غير معروف','FORBIDDEN',403);
 const data=body.account;demand(data&&typeof data==='object'&&!Array.isArray(data),'Account required');
 const userId=data.userId?cleanText(data.userId,180,'Account identity required'):'access:'+crypto.randomUUID();
 demand(userId!==oid,'Platform owner cannot be edited from account forms / مالك المنصة محمي','FORBIDDEN',403);
 const member=await memberView(userId);demand(!member||member.role!=='owner','Owner membership protected','FORBIDDEN',403);
 const row=await q('SELECT * FROM access_accounts WHERE user_id=?',userId).first<AccountRow>();
 demand(!row||row.grant_id===g.id,'Account outside delegation','FORBIDDEN',403);
 demand(!data.userId||member,'Existing person not found','NOT_FOUND',404);
 demand(owner||!member||row&&visibleTarget(a,member),'Account outside scope','FORBIDDEN',403);
 demand(revision===(row?.revision||0),'Account changed; refresh and review','CONFLICT',409);
 const name=cleanText(data.name,180,'Name required / الاسم مطلوب'),username=cleanText(data.username,128,'Login required / اسم الدخول مطلوب').normalize('NFKC').toLowerCase();
 demand(/^[\p{L}\p{N}][\p{L}\p{N}._@+\-]{2,127}$/u.test(username),'Login must be 3–128 letters, numbers or . _ @ + - / اسم الدخول غير صحيح');
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';demand(email.length<=254&&(!email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),'Invalid email / بريد غير صحيح');
 const duplicate=await q('SELECT user_id FROM access_accounts WHERE user_id<>? AND (username=? OR lower(email)=? OR (?<>\'\' AND (username=? OR lower(email)=?)))',userId,username,username,email,email,email).first();demand(!duplicate,'Login or email already used / اسم الدخول أو البريد مستخدم','DUPLICATE',409);
 demand(['manager','contributor','viewer'].includes(data.role),'Role cannot grant platform ownership / الدور غير مسموح','FORBIDDEN',403);
 demand(['all','project_manager','operations','warehouse','dispatcher','representative'].includes(data.function),'Invalid DAF function');
 const role=data.role as Role,fn=data.function as string,p=period(data),active=data.active!==false?1:0,clientAdmin=data.clientAdmin===true;
 if(!owner){demand(userId!==a.userId,'Client administrators cannot edit their own delegation / لا يعدل المسؤول تفويضه بنفسه','FORBIDDEN',403);demand(!p.unlimited||!!g.unlimited,'Cannot outlive delegation','FORBIDDEN',403);}
 demand(!!g.unlimited||!p.unlimited&&!!p.endsAt&&!!g.ends_at&&p.endsAt<=g.ends_at,'Account expiry exceeds delegation / مدة الحساب تتجاوز التفويض','FORBIDDEN',403);
 demand(!g.starts_at||!!p.startsAt&&p.startsAt>=g.starts_at,'Account starts before delegation','FORBIDDEN',403);
 const [projects,warehouses,resources]=await Promise.all([records('projects',d.id),records('warehouses',d.id),records('resources',d.id)]);
 const projectIds=normalizeScope(data.projectIds,new Set(projects.map(r=>r.id)),'Invalid project scope'),warehouseIds=normalizeScope(data.warehouseIds,new Set(warehouses.map(r=>r.id)),'Invalid warehouse scope'),resourceIds=normalizeScope(data.resourceIds,new Set(resources.map(r=>r.id)),'Invalid courier scope');
 for(const [chosen,limit,label] of [[projectIds,parse<Scope>(g.project_ids),'projects'],[warehouseIds,parse<Scope>(g.warehouse_ids),'warehouses'],[resourceIds,parse<Scope>(g.resource_ids),'couriers']] as const)demand(subset(chosen,limit),'Account exceeds delegation '+label,'FORBIDDEN',403);
 if(!owner){demand(subset(projectIds,a.projectIds??null)&&subset(warehouseIds,a.warehouseIds??null)&&subset(resourceIds,a.resourceIds??null),'Cannot grant a wider data scope / لا يمكن منح نطاق أوسع','FORBIDDEN',403);}
 const supplied=data.overrides??{};demand(supplied&&typeof supplied==='object'&&!Array.isArray(supplied),'Invalid permission overrides');
 const keys=new Map(permissionRegistry.map(p=>[p.key,p]));const overrides:Record<string,Override>={};
 for(const [key,value] of Object.entries(supplied)){demand(keys.has(key)&&!keys.get(key)?.ownerOnly&&['default','allow','deny'].includes(value as string),'Invalid permission override / استثناء صلاحية غير صحيح','FORBIDDEN',403);if(value!=='default')overrides[key]=value as Override;}
 const ceiling=parse<string[]>(g.ceiling);
 // Preview the complete resulting account, not just newly granted exception keys.
 const candidate:any={userId,name,role,function:fn,active,projectIds,warehouseIds,resourceIds,access:{enabled:true,platformOwner:false,clientAdmin,overrides,ceiling}};
 // Account forms must not persist an active identity that the existing
 // operational entry guard will reject. Disabling an invalid old account stays possible.
 if(active&&commandCenterConfig().enabled)requireCommandCenterActor(candidate);
 if(!owner)for(const key of permissionRegistry.filter(k=>!k.ownerOnly&&k.action!=='group'&&k.action!=='screen').map(k=>k.key))if(permissionDecision(candidate,key).allowed)demand(permissionDecision(a,key).allowed,'Cannot grant a permission above your effective ceiling / الصلاحية تتجاوز سلطة المنح: '+key,'FORBIDDEN',403);
 for(const [key,value] of Object.entries(overrides))if(value==='allow')demand(ceiling.includes('*')||ceiling.includes(key)||keys.get(key)?.action==='group'||keys.get(key)?.action==='screen','Permission exceeds workspace ceiling: '+key,'FORBIDDEN',403);
 if(fn==='representative')demand(Array.isArray(resourceIds)&&resourceIds.length>0,'Link the assigned courier identity / اربط هوية المندوب');
 if(fn==='warehouse')demand(Array.isArray(warehouseIds)&&warehouseIds.length>0,'Select permitted warehouses / حدد المخازن');
 if(resourceIds?.length){const other=await q("SELECT key,value FROM settings WHERE key LIKE 'member_operations:%' AND key<>?",'member_operations:'+userId).all<{key:string;value:string}>();demand(!other.results.some(o=>(parse<any>(o.value).resourceIds||[]).some((id:string)=>resourceIds.includes(id))),'Courier already linked to another account / المندوب مربوط بحساب آخر','DUPLICATE',409);}
 const password=data.password;demand(password===undefined||typeof password==='string','Invalid password');
 demand(row||typeof password==='string'&&password.length>0,'Password required for new login / كلمة مرور مطلوبة للحساب الجديد');
 const passwordHash=typeof password==='string'&&password!==''?await hashPassword(password):row!.password_hash;
 const at=now(),before=row?await accountView(row):member,after={userId,name,username,email,role,function:fn,active:!!active,clientAdmin,projectIds,warehouseIds,resourceIds,...p,overrides,revision:revision+1,grantId:g.id},guard='account-'+crypto.randomUUID();
 const statements=[row?concurrencyGuard(guard,'EXISTS(SELECT 1 FROM access_accounts WHERE user_id=? AND revision=?)',[userId,revision]):concurrencyGuard(guard,'NOT EXISTS(SELECT 1 FROM access_accounts WHERE user_id=?)',[userId]),
  concurrencyGuard(guard+':grant','EXISTS(SELECT 1 FROM access_grants WHERE id=? AND revision=?)',[g.id,g.revision]),
  concurrencyGuard(guard+':login',"NOT EXISTS(SELECT 1 FROM access_accounts WHERE user_id<>? AND (username=? OR lower(email)=? OR (?<>'' AND (username=? OR lower(email)=?))))",[userId,username,username,email,email,email]),
  concurrencyGuard(guard+':resource',"NOT EXISTS(SELECT 1 FROM settings s,json_each(json_extract(s.value,'$.resourceIds')) r WHERE s.key LIKE 'member_operations:%' AND s.key<>? AND r.value IN (SELECT value FROM json_each(?)))",['member_operations:'+userId,JSON.stringify(resourceIds||[])]),
  member?q('UPDATE members SET name=?,role=?,function=?,active=? WHERE user_id=?',name,role,fn,active,userId):q('INSERT INTO members(user_id,name,role,function,active) VALUES (?,?,?,?,?)',userId,name,role,fn,active),
  q('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','member_scope:'+userId,JSON.stringify(projectIds)),
  q('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','member_operations:'+userId,JSON.stringify({warehouseIds,resourceIds})),
  q('INSERT INTO access_accounts(user_id,username,email,password_hash,active,revision,grant_id,client_admin,starts_at,ends_at,unlimited,overrides,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,email=excluded.email,password_hash=excluded.password_hash,active=excluded.active,revision=excluded.revision,grant_id=excluded.grant_id,client_admin=excluded.client_admin,starts_at=excluded.starts_at,ends_at=excluded.ends_at,unlimited=excluded.unlimited,overrides=excluded.overrides,updated_at=excluded.updated_at',userId,username,email,passwordHash,active,revision+1,g.id,clientAdmin?1:0,p.startsAt,p.endsAt,p.unlimited?1:0,JSON.stringify(overrides),a.userId,at),
  q('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',at,userId),
  event(a,row?'update_account':'create_account',userId,g.id,reason.replaceAll(typeof password==='string'&&password?password:'\u0000','[redacted]'),before,after),q('DELETE FROM transaction_guards WHERE id IN (?,?,?,?)',guard,guard+':grant',guard+':login',guard+':resource')];
 await commitAccess(a,statements);return {saved:true,userId,revision:revision+1};
}

/** Append to the existing atomic recovery batch, after its entity remapping.
 * Authentication IDs, passwords, roles and technical owner are never restored
 * from an operational backup. Only existing explicit scope IDs are remapped.
 */
export async function accessRecoveryStatements(a:Actor,oldDatasetId:string,newDatasetId:string,remap:Map<string,string>,operationType:string):Promise<D1PreparedStatement[]>{
 if(!accessEnabled())return [];
 demandAccessManagement(a,true);
 const g=await q('SELECT * FROM access_grants WHERE dataset_id=?',grantDatasetId(oldDatasetId)).first<GrantRow>();
 const rows=(await q("SELECT key,value FROM settings WHERE key LIKE 'member_scope:%' OR key LIKE 'member_operations:%'").all<{key:string;value:string}>()).results;
 const dropped:{key:string;count:number}[]=[];
 const mapped=(raw:Scope,key:string):Scope=>{
  if(raw===null)return null;
  const out=[...new Set(raw.flatMap(id=>remap.has(id)?[remap.get(id)!]:[]))];
  if(out.length<raw.length)dropped.push({key,count:raw.length-out.length});
  return out;
 };
 const out:D1PreparedStatement[]=[...accessCommitGuards(a,'access-recovery-'+crypto.randomUUID())];
 for(const row of rows){
  const scopeGuard='access-recovery-scope-'+crypto.randomUUID();
  out.push(concurrencyGuard(scopeGuard,'EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',[row.key,row.value]));
  if(row.key.startsWith('member_scope:'))out.push(q('UPDATE settings SET value=? WHERE key=?',JSON.stringify(mapped(parse<Scope>(row.value),row.key)),row.key));
  else{const ops=parse<any>(row.value);out.push(q('UPDATE settings SET value=? WHERE key=?',JSON.stringify({...ops,warehouseIds:mapped(ops.warehouseIds??null,row.key+':warehouses'),resourceIds:mapped(ops.resourceIds??null,row.key+':couriers')}),row.key));}
  out.push(q('DELETE FROM transaction_guards WHERE id=?',scopeGuard));
 }
 const at=now();let after:any={oldDatasetId,newDatasetId,operationType};
 if(g){
  const projectIds=mapped(parse<Scope>(g.project_ids),'grant:projects'),warehouseIds=mapped(parse<Scope>(g.warehouse_ids),'grant:warehouses'),resourceIds=mapped(parse<Scope>(g.resource_ids),'grant:couriers');
  const guard='access-recovery-grant-'+crypto.randomUUID();
  out.push(concurrencyGuard(guard,'EXISTS(SELECT 1 FROM access_grants WHERE id=? AND revision=?)',[g.id,g.revision]),q('UPDATE access_grants SET revision=revision+1,project_ids=?,warehouse_ids=?,resource_ids=?,updated_at=?,updated_by=? WHERE id=?',JSON.stringify(projectIds),JSON.stringify(warehouseIds),JSON.stringify(resourceIds),at,a.userId,g.id),q('UPDATE access_sessions SET revoked_at=? WHERE user_id IN (SELECT user_id FROM access_accounts WHERE grant_id=?) AND revoked_at IS NULL',at,g.id),q('DELETE FROM transaction_guards WHERE id=?',guard));
  after={...after,grant:{...grantView(g),revision:g.revision+1,projectIds,warehouseIds,resourceIds}};
 }
 after.scopeReviewRequired=dropped.length>0;after.droppedUnmatchedScopeCounts=dropped;
 out.push(event(a,'dataset_access_recovery',newDatasetId,g?.id||null,'Preserve access controls during '+operationType,{datasetId:oldDatasetId,grant:grantView(g)},after,'owner'));
 return out;
}
