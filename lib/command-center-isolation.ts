import {env} from 'cloudflare:workers';
import {demand,type Actor} from './model';
export function commandCenterConfig(){
 const e=env as Cloudflare.Env & {COMMAND_CENTER_PILOT?:string;COMMAND_CENTER_DATASET_ID?:string};
 return {enabled:e.COMMAND_CENTER_PILOT==='isolated',datasetId:e.COMMAND_CENTER_DATASET_ID||''};
}
export function requireCommandCenterActor(a:Actor){
 if(['owner','manager','viewer'].includes(a.role))return;
 demand(a.function!=='all','Owner must assign a specific function first / يحدد المالك وظيفة حسابك أولًا','MEMBERSHIP',403);
 if(a.function==='representative')demand(Array.isArray(a.resourceIds)&&a.resourceIds.length>0,'Owner must link your assigned courier identity / يربط المالك حسابك بالمندوب المكلّف','MEMBERSHIP',403);
 if(a.function==='warehouse')demand(Array.isArray(a.warehouseIds)&&a.warehouseIds.length>0,'Owner must assign your permitted warehouses / يحدد المالك مخازنك المسموحة','MEMBERSHIP',403);
}
export function requireCommandCenter(){
 const c=commandCenterConfig();
 demand(c.enabled&&!!c.datasetId&&c.datasetId!=='pilot-main','Command Center needs an isolated pilot environment / مركز القيادة يحتاج بيئة تجربة معزولة','PILOT_ISOLATION',503);
}

type DatasetIdentity={id:string;created_at:string};
const lineageError='Active dataset is not a verified Command Center recovery / مجموعة البيانات النشطة ليست استعادة موثقة لمركز القيادة';

// A server-side restore/reset intentionally creates a new dataset. Keep the
// configured root fixed, and accept only its recorded recovery descendants.
// Names and UUID prefixes are not evidence. This check performs no writes.
export async function requireCommandCenterDataset(active:DatasetIdentity,database:D1Database){
 requireCommandCenter();
 const root=commandCenterConfig().datasetId,seen=new Set<string>();
 let current=active;
 for(let hops=0;hops<=20;hops++){
  demand(current.id!=='pilot-main'&&!seen.has(current.id),lineageError,'PILOT_ISOLATION',503);
  if(current.id===root)return;
  demand(hops<20,lineageError,'PILOT_ISOLATION',503);
  seen.add(current.id);
  const edges=await database.prepare("SELECT details FROM audit WHERE dataset_id=? AND at=? AND action IN ('restore','reset') LIMIT 2").bind(current.id,current.created_at).all<{details:string}>();
  demand(edges.results.length===1,lineageError,'PILOT_ISOLATION',503);
  let details:unknown;
  try{details=JSON.parse(edges.results[0].details);}catch{details=null;}
  demand(details!==null&&typeof details==='object'&&!Array.isArray(details),lineageError,'PILOT_ISOLATION',503);
  const parentId=(details as {fromDataset?:unknown}).fromDataset;
  demand(typeof parentId==='string'&&!!parentId&&parentId!==current.id,lineageError,'PILOT_ISOLATION',503);
  const parent=await database.prepare('SELECT id,created_at FROM datasets WHERE id=?').bind(parentId).first<DatasetIdentity>();
  demand(parent&&Number.isFinite(Date.parse(parent.created_at))&&Number.isFinite(Date.parse(current.created_at))&&Date.parse(parent.created_at)<=Date.parse(current.created_at),lineageError,'PILOT_ISOLATION',503);
  current=parent;
 }
}
