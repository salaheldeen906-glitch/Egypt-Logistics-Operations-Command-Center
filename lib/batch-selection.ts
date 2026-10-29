import {plannedReservationOptions,reservePlan} from './allocation-plan';
import {type State,type Row,type Command,type Kind,balance,demand,qty,row,text} from './model';
import {outbound,round} from './operation-types';
import {taskDelivered,returnAmount,pendingReturn} from './task-trace';
import {actualSources,actualAvailable} from './actual-quantities';
export type BatchOption={key:string;product:string;warehouse:string;batch:string;expiry:string;available:number;limit:number;group:string;remaining:number;executor:string;reason:string;values:Record<string,any>};
const total=(rows:Row[])=>round(rows.reduce((n,x)=>n+x.quantity,0));
export function batchCaption(s:State,batchId:string){const b=s.batches.find(x=>x.id===batchId);return b?b.code+' · '+(b.expiryDate||'بدون تاريخ صلاحية / No expiry'):'بدون دفعة / No batch';}
function groupNeed(s:State,r:Row,l:Row,executorId=''){const wanted=outbound(r)?total(s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='allocation'&&t.lineId===l.id&&t.executorId===executorId)):l.quantity;return round(wanted-total(s.reservations.filter(x=>x.requestId===r.id&&x.lineId===l.id&&(!outbound(r)||x.executorId===executorId))));}
export function eligibleLimit(s:State,r:Row,l:Row,b:Row|undefined,available:number,now:string){
 const p=row(s,'products',l.productId);if(p.tracked&&!b)return {limit:0,reason:'دفعة مطلوبة / Batch required'};
 if(b&&b.productId!==p.id)return {limit:0,reason:'دفعة صنف آخر / Wrong product'};
 if(p.expiry){const days=(Date.parse(b?.expiryDate)-Date.parse(now.slice(0,10)))/86400000;if(!Number.isFinite(days)||days<=0)return {limit:0,reason:'منتهية أو صلاحية غير مسجلة / Expired or missing expiry'};if(days<=90){
  // Retain the established near-expiry policy; extended transfers do not bypass it.
  const approved=outbound(r)?0:Math.max(0,...s.approvals.filter(x=>(!x.type||x.type==='near_expiry')&&x.requestId===r.id&&x.lineId===l.id&&x.batchId===b?.id&&x.status==='approved'&&x.approvedBy).map(x=>x.quantity));
  const used=total(s.reservations.filter(x=>x.requestId===r.id&&x.lineId===l.id&&x.batchId===b?.id));const limit=Math.max(0,Math.min(available,round(approved-used)));return {limit,reason:limit>0?'قريبة الانتهاء — كمية معتمدة / Approved near-expiry quantity':'خلال 90 يومًا — غير معتمدة / Within 90 days; not authorized'};
 }}return {limit:Math.max(0,available),reason:''};
}
export function reservationOptions(s:State,r:Row,now=new Date().toISOString()):BatchOption[]{
 if(r.allocationPlan||r.multiSourcePlan)return plannedReservationOptions(s,r,now);
 const options:BatchOption[]=[];
 for(const l of s.lines.filter(x=>x.requestId===r.id)){
  const p=row(s,'products',l.productId),executors=outbound(r)?[...new Set(s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='allocation'&&t.lineId===l.id).map(t=>t.executorId))]:[''];
  for(const executorId of executors){const remaining=groupNeed(s,r,l,executorId);if(remaining<=0)continue;
   const keys=[...new Set(s.movements.filter(m=>m.productId===p.id&&(!outbound(r)||m.warehouseId===r.sourceWarehouseId)).map(m=>m.warehouseId+'|'+(m.batchId||'')))];
   for(const key of keys){const [warehouseId,batchId]=key.split('|'),b=s.batches.find(x=>x.id===batchId),available=balance(s,p.id,warehouseId,batchId).available;if(available<=0)continue;const eligible=eligibleLimit(s,r,l,b,available,now);options.push({key:l.id+'|'+executorId+'|'+key,product:p.code+' · '+p.name,warehouse:s.warehouses.find(w=>w.id===warehouseId)?.name||'',batch:b?.code||'بدون دفعة / No batch',expiry:b?.expiryDate||'—',available,limit:Math.min(remaining,eligible.limit),group:l.id+'|'+executorId,remaining,executor:s.resources.find(x=>x.id===executorId)?.name||'',reason:eligible.reason,values:{lineId:l.id,warehouseId,batchId,...(executorId?{executorId}:{})}});}
  }
 }return options.sort((a,b)=>a.product.localeCompare(b.product)||a.group.localeCompare(b.group)||a.expiry.localeCompare(b.expiry));
}
export function reserveSelected(s:State,c:Command,now:string,add:(k:Kind,v:Record<string,any>)=>Row){
 if(!['reserve','op_reserve'].includes(c.type)||c.batchRows===undefined)return null;
 const r=row(s,'requests',text(c.requestId));demand(c.type==='op_reserve'?outbound(r)&&r.status==='authorized':(!r.requestType||r.requestType==='delivery')&&r.status==='approved','اختيار الدفعات بعد الاعتماد فقط / Select batches after approval');
 demand(Array.isArray(c.batchRows)&&c.batchRows.length>0&&c.batchRows.length<=100,'اختر دفعة واحدة على الأقل / Select one or more batches');
 if(r.allocationPlan||r.multiSourcePlan)return reservePlan(s,c,now,add);
 const seen=new Set();const ids=[];
 for(const v of c.batchRows){const q=qty(v.quantity),line=row(s,'lines',text(v.lineId));demand(line.requestId===r.id,'البند لا يخص الطلب');const warehouse=row(s,'warehouses',text(v.warehouseId));demand(!outbound(r)||warehouse.id===r.sourceWarehouseId,'اختر مخزن المصدر المعتمد');const executorId=outbound(r)?text(v.executorId):'';
  const key=line.id+'|'+executorId+'|'+warehouse.id+'|'+(v.batchId||'');demand(!seen.has(key),'الدفعة مكررة؛ اجمع الكمية في صف واحد');seen.add(key);
  const b=v.batchId?row(s,'batches',text(v.batchId)):undefined;const available=balance(s,line.productId,warehouse.id,b?.id||'').available,limit=eligibleLimit(s,r,line,b,available,now);
  demand(q<=groupNeed(s,r,line,executorId),'الكمية تتجاوز المتبقي لهذا الصنف أو المندوب');demand(q<=limit.limit,'الدفعة غير مؤهلة أو الرصيد غير كافٍ / '+limit.reason,'STOCK',409);
  ids.push(add('reservations',{requestId:r.id,lineId:line.id,productId:line.productId,warehouseId:warehouse.id,batchId:b?.id||'',quantity:q,status:'held',...(executorId?{executorId}:{}),selectionMode:'manual'}).id);
 }
 const complete=s.lines.filter(l=>l.requestId===r.id).every(l=>{const es=outbound(r)?[...new Set(s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='allocation'&&t.lineId===l.id).map(t=>t.executorId))]:[''];return es.every(e=>groupNeed(s,r,l,e)===0);});if(complete)r.status='reserved';return {id:r.id,reservationIds:ids,complete};
}
const rowKeys:Record<string,string[]>={pickup_actual:['reservationId'],deliver:['reservationId','taskId'],op_collect:['batchId'],receive_purchase:['batchId'],op_present:['sourceId'],op_deliver:['sourceId'],op_receive:['sourceId'],plan_return:['sourceId']};
export function expandBatchRows(c:Command):Command[]|null{
 if(c.batchRows===undefined||['reserve','op_reserve'].includes(c.type))return null;
 demand(rowKeys[c.type],'اختيار الدفعات غير متاح لهذا الإجراء');demand(Array.isArray(c.batchRows)&&c.batchRows.length>0&&c.batchRows.length<=100,'حدد كمية في صف دفعة واحد على الأقل');
 const {batchRows,...base}=c,seen=new Set();return batchRows.map((v:any)=>{const fields=Object.fromEntries(rowKeys[c.type].filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));const key=JSON.stringify(fields);demand(!seen.has(key),'الدفعة مكررة في نفس الحفظ');seen.add(key);return {...base,...fields,quantity:qty(v.quantity)};});
}
export function stageBatchOptions(s:State,r:Row,c:Command,max=Infinity,now=new Date().toISOString()):BatchOption[]{
 if(['reserve','op_reserve'].includes(c.type))return reservationOptions(s,r,now);
 const task=s.tasks.find(t=>t.id===c.taskId),line=s.lines.find(l=>l.id===c.lineId);let candidates:{x:Row;available:number;values:Record<string,any>}[]=[];
 if(c.type==='pickup_actual')candidates=s.reservations.filter(x=>x.requestId===r.id&&x.status==='held').map(x=>({x,available:x.quantity,values:{reservationId:x.id}}));
 if(c.type==='deliver'){
  const targets=task?.autoGenerated?s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='delivery'&&t.autoGenerated&&t.status==='arrived'&&t.lineId===task.lineId&&t.executorId===task.executorId):task?[task]:[];if(targets.length)for(const target of targets){const remaining=round(target.quantity-taskDelivered(s,target)-returnAmount(s,target)-pendingReturn(s,target));for(const x of actualSources(s,r,target))candidates.push({x:{...x,guideRemaining:remaining,guideGroup:target.id},available:Math.min(actualAvailable(s,x),remaining),values:{reservationId:x.id,taskId:target.id}});}else if(!task)candidates=s.reservations.filter(x=>x.requestId===r.id&&x.status==='issued').map(x=>({x,available:actualAvailable(s,x),values:{reservationId:x.id}}));
 }
 if(['op_present','op_deliver','plan_return'].includes(c.type)&&task){candidates=actualSources(s,r,task).map(x=>{let available=actualAvailable(s,x);if(c.type==='plan_return'&&c.source==='delivered'){const key=x.type==='external_collection'?'collectionId':'reservationId';available=round(total(s.deliveries.filter(d=>d.taskId===task.id&&d[key]===x.id))-total(s.handoffs.filter(h=>h.type==='return_plan'&&h.source==='delivered'&&h.sourceTaskId===task.id&&h[key]===x.id)));}return {x,available,values:{sourceId:x.id}};});}
 if(c.type==='op_receive'&&task?.presentationRequired)candidates=s.handoffs.filter(h=>h.type==='warehouse_present'&&h.taskId===task.id).map(x=>({x,available:round(x.quantity-(x.rejectedQuantity||0)-total(s.deliveries.filter(d=>d.presentationId===x.id))),values:{sourceId:x.id}}));
 if(['op_collect','receive_purchase'].includes(c.type)&&line){const p=row(s,'products',line.productId);const batches=p.tracked?s.batches.filter(b=>b.productId===p.id):[{id:'',code:'',productId:p.id} as Row];candidates=batches.map(b=>({x:{...b,id:b.id,batchId:b.id,productId:p.id,expiryDate:b.expiryDate},available:max,values:{batchId:b.id}})).filter(v=>!p.expiry||Date.parse(v.x.expiryDate)>Date.parse(now.slice(0,10)));}
 return candidates.filter(v=>v.available>0).map(({x,available,values})=>{const p=s.products.find(p=>p.id===x.productId),b=s.batches.find(b=>b.id===x.batchId),ex=x.executorId||s.assignments.find(a=>a.reservationId===x.id)?.executorId;return {key:x.id||'no-batch',product:p?p.code+' · '+p.name:'',warehouse:s.warehouses.find(w=>w.id===x.warehouseId)?.name||r.sourceAddress||r.supplierName||'',batch:b?.code||'بدون دفعة / No batch',expiry:b?.expiryDate||'—',available,limit:Math.min(available,['pickup_actual','deliver'].includes(c.type)?Infinity:max),group:c.type==='pickup_actual'?x.id:x.guideGroup||'stage',remaining:c.type==='pickup_actual'?available:x.guideRemaining??max,executor:s.resources.find(t=>t.id===ex)?.name||'',reason:'',values};});
}
