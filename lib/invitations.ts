import {demand, type State} from './model';

export type InvitationPolicy = {email:string;role:'manager'|'contributor'|'viewer';function:string;projectIds:string[];warehouseIds:string[]|null;resourceIds:string[]|null;datasetId:string;days:number};
export function invitationPolicy(input:any,s:State,datasetId:string):InvitationPolicy {
 const email=String(input.email||'').trim().toLowerCase();
 demand(email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter the recipient email / اكتب بريد الشخص المدعو');
 const role=input.role||'viewer',fn=input.function||'project_manager';
 demand(['manager','contributor','viewer'].includes(role),'Invalid invitation role / دور دعوة غير صحيح');
 demand(['project_manager','operations','warehouse','dispatcher','representative'].includes(fn),'Choose a specific function / اختر وظيفة محددة');
 const scope=(key:string,kind:'projects'|'warehouses'|'resources',nullable=false)=>{
  const ids=input[key];if(nullable&&ids===null)return null;
  demand(Array.isArray(ids)&&ids.length<=500&&new Set(ids).size===ids.length&&ids.every((id:unknown)=>typeof id==='string'&&s[kind].some(r=>r.id===id)),`Invalid ${key} / نطاق غير صحيح`);
  return ids as string[];
 };
 const projectIds=scope('projectIds','projects')!,warehouseIds=scope('warehouseIds','warehouses',true),resourceIds=scope('resourceIds','resources',true);
 demand(projectIds.length>0,'Select permitted projects / اختر المشاريع المسموحة');
 if(role==='contributor'&&fn==='warehouse')demand(warehouseIds?.length,'Select permitted warehouses / اختر المخازن المسموحة');
 if(role==='contributor'&&fn==='representative')demand(resourceIds?.length,'Link the invited courier / اربط المندوب المدعو');
 const days=input.days??7;demand(Number.isInteger(days)&&days>=1&&days<=7,'Invitation validity is 1–7 days / صلاحية الدعوة من يوم إلى 7 أيام');
 return {email,role,function:fn,projectIds,warehouseIds,resourceIds,datasetId,days};
}
