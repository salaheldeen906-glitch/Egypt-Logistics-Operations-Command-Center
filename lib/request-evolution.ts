import {type Actor,type Command,type Kind,type Row,type State,balance,code,demand,qty,row,text} from './model';
import {round} from './operation-types';
import {executeLoading} from './loading-confirmation';
import {executeActual,actualAvailable,optionalEvidence} from './actual-quantities';
import {eligibleLimit} from './batch-selection';
import {executeReturn,returnAmount} from './task-trace';
import {equalPrice,hasPriceMetadata,normalizeGovernorate,normalizePriceMetadata,recordedGovernorate,recordedPrice} from './delivery-metadata';

type Add=(kind:Kind,value:Record<string,any>)=>Row;
const privileged=(a:Actor)=>['owner','manager'].includes(a.role)||a.function==='all';
const pm=(a:Actor)=>demand(privileged(a)||a.function==='project_manager','احتياجات العملاء وتعديل الطلب لمسؤول المشروع','FORBIDDEN',403);
const ops=(a:Actor)=>demand(privileged(a)||a.function==='operations','اعتماد التغيير لمسؤول العمليات','FORBIDDEN',403);
const dispatch=(a:Actor)=>demand(privileged(a)||a.function==='dispatcher','توزيع التنفيذ لمسؤول الحركة','FORBIDDEN',403);
const validDay=(v:any)=>{const d=text(v);demand(/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d,'أدخل تاريخًا صحيحًا');return d;};
const priority=(v:any)=>{demand(['low','normal','high','urgent'].includes(v),'أولوية غير صحيحة');return v;};
const requestNeeds=(s:State,id:string)=>s.delivery_needs.filter(n=>n.requestId===id&&n.status!=='superseded');
const needSignature=(needs:Record<string,any>[])=>JSON.stringify(needs.map(n=>[n.productId,n.customerId,n.siteId||'',n.addressSnapshot,n.quantity,n.governorate||null,recordedPrice(n).priceMinor,recordedPrice(n).free,recordedPrice(n).currency]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));

/** Demand is product/customer/site quantity; dispatchers cannot silently redefine it. */
export function normalizeDeliveryNeeds(s:State,projectId:string,values:any[]):Record<string,any>[] {
 demand(Array.isArray(values)&&values.length>0&&values.length<=100,'أضف من 1 إلى 100 احتياج تسليم');
 return values.map(v=>{
  demand(v&&typeof v==='object'&&!Array.isArray(v),'احتياج تسليم غير صحيح');
  const p=row(s,'products',text(v.productId)),customer=row(s,'customers',text(v.customerId));demand(p.projectId===projectId,'المنتج يتبع مشروعًا آخر');
  const site=v.siteId?row(s,'customer_sites',text(v.siteId)):undefined;demand(!site||site.customerId===customer.id&&(!site.projectId||site.projectId===projectId),'العنوان المحفوظ لا يتبع العميل أو المشروع');
  const addressSnapshot=text(v.addressSnapshot||v.destination||site?.address,1000);
  const previous=v.id?s.delivery_needs.find(n=>n.id===v.id):undefined;
  const governorate=normalizeGovernorate(v.governorate!==undefined?v.governorate:previous?.governorate??site?.governorate);
  const price=normalizePriceMetadata(hasPriceMetadata(v)?v:previous||{});
  return {existingId:v.id||'',productId:p.id,customerId:customer.id,siteId:site?.id||'',addressSnapshot,quantity:qty(v.quantity),governorate,...price,saveSite:v.saveSite===true,siteName:v.siteName?text(v.siteName):''};
 });
}
export function needsAsLines(needs:Record<string,any>[]){const totals=new Map<string,number>();for(const n of needs)totals.set(n.productId,round((totals.get(n.productId)||0)+n.quantity));return [...totals].map(([productId,quantity])=>{const productNeeds=needs.filter(n=>n.productId===productId),first=productNeeds[0];return {productId,quantity,...(productNeeds.every(n=>equalPrice(n,first))?recordedPrice(first):normalizePriceMetadata({}))};});}
export function saveDeliveryNeeds(s:State,r:Row,a:Actor,values:any[],now:string,add:Add,approved=false){
 pm(a);const needs=normalizeDeliveryNeeds(s,r.projectId,values),lines=s.lines.filter(l=>l.requestId===r.id);
 if(needSignature(needs)===needSignature(requestNeeds(s,r.id))&&!needs.some(n=>n.saveSite&&!n.siteId))return requestNeeds(s,r.id);
 for(const n of needs){const l=lines.find(l=>l.productId===n.productId);demand(l,'احتياج التسليم لا يطابق أصناف الطلب');n.lineId=l.id;}
 // Receipt quotas may leave accepted stock undistributed; outbound demand must cover each line exactly.
 const inbound=['purchase_receipt','receipt_order','courier_receipt','customer_return'].includes(r.requestType);
 for(const l of lines){const q=round(needs.filter(n=>n.lineId===l.id).reduce((sum,n)=>sum+n.quantity,0));demand(inbound?q<=l.quantity:q===l.quantity,inbound?'حصص العملاء تتجاوز كمية بند الاستلام':'يجب أن تساوي احتياجات العملاء كمية كل بند');}
 const old=requestNeeds(s,r.id);demand(!s.tasks.some(t=>t.requestId===r.id&&t.status!=='cancelled'&&(t.needId||t.distributionPlanId)),'خطة التنفيذ مرتبطة بالاحتياجات؛ استخدم طلب تغيير موثق');
 const ids=new Set(needs.map(n=>n.existingId).filter(Boolean));demand(ids.size===needs.filter(n=>n.existingId).length,'احتياج مكرر');
 for(const n of needs)if(n.existingId)demand(s.delivery_needs.some(o=>o.id===n.existingId&&o.requestId===r.id),'الاحتياج لا يتبع الطلب');
 for(const n of old)n.status='superseded';
 for(const n of needs){const {existingId,saveSite,siteName,...v}=n;if(saveSite&&!v.siteId){const existing=s.customer_sites.find(site=>site.customerId===v.customerId&&site.projectId===r.projectId&&site.address===v.addressSnapshot&&site.active!==false);v.siteId=(existing||add('customer_sites',{projectId:r.projectId,customerId:v.customerId,name:siteName||v.addressSnapshot.slice(0,180),address:v.addressSnapshot,governorate:v.governorate,active:true})).id;}add('delivery_needs',{...v,requestId:r.id,approved,status:approved?'approved':'draft',revision:(r.demandRevision||0)+1,addressCapturedAt:now,definedBy:a.userId,...(existingId?{priorNeedId:existingId}:{})});}
 r.demandRevision=(r.demandRevision||0)+1;r.demandPlan=true;if(!inbound){r.customerId=needs[0].customerId;r.destination=[...new Set(needs.map(n=>n.addressSnapshot))].join(' · ').slice(0,1000);const regions=[...new Set(needs.map(n=>n.governorate))];r.governorate=regions.length===1?regions[0]:null;for(const summary of needsAsLines(needs)){const line=lines.find(l=>l.productId===summary.productId);if(line)Object.assign(line,recordedPrice(summary));}}return requestNeeds(s,r.id);
}
export function approveDeliveryNeeds(s:State,r:Row,a:Actor,now:string){ops(a);for(const n of requestNeeds(s,r.id)){n.approved=true;n.status='approved';n.approvedBy=a.userId;n.approvedAt=now;}}
export function deliveryNeedValues(s:State,r:Row,needId:unknown,lineId:string,quantity:number,excludingTaskId=''){
 const needs=requestNeeds(s,r.id);if(!needs.length)return {};
 const n=row(s,'delivery_needs',text(needId));demand(n.requestId===r.id&&n.lineId===lineId&&n.status!=='superseded','الاحتياج لا يطابق الطلب أو المنتج');
 demand(r.status==='draft'||n.approved,'اعتمد احتياجات العملاء قبل توزيع التنفيذ');
 const used=s.tasks.filter(t=>t.needId===n.id&&t.id!==excludingTaskId&&t.status!=='cancelled').reduce((sum,t)=>sum+t.quantity,0);demand(round(used+quantity)<=n.quantity,'كميات المهام تتجاوز حصة العميل والعنوان المعتمدة');
 return {needId:n.id,customerId:n.customerId,siteId:n.siteId||'',destination:n.addressSnapshot,addressSnapshot:n.addressSnapshot,governorate:n.governorate||null,...recordedPrice(n)};
}
export function assertNeedPlan(s:State,r:Row,entries:Record<string,any>[]){
 const needs=requestNeeds(s,r.id);if(!needs.length)return;
 for(const n of needs){const amount=round(entries.filter(e=>e.needId===n.id).reduce((v,e)=>v+e.quantity,0));demand(amount===n.quantity,'وزع حصة كل عميل وعنوان بالكامل دون زيادة أو نقص');}
 for(const e of entries){const n=needs.find(n=>n.id===e.needId);demand(n&&n.lineId===e.lineId&&n.customerId===e.customerId&&n.addressSnapshot===e.destination,'المهمة يجب أن تطابق احتياج التسليم المعتمد');}
}
export function hasConfirmedExecution(s:State,r:Row){const taskIds=new Set(s.tasks.filter(t=>t.requestId===r.id).map(t=>t.id)),linked=(v:Row)=>(v.requestIds||[]).includes(r.id)||(v.taskIds||[]).some((id:string)=>taskIds.has(id))||v.requestId===r.id;return s.movements.some(m=>m.requestId===r.id)||s.deliveries.some(d=>d.requestId===r.id)||s.returns.some(d=>d.requestId===r.id)||s.handoffs.some(h=>h.requestId===r.id)||s.tasks.some(t=>t.requestId===r.id&&!['planned','cancelled'].includes(t.status))||s.stops.some(st=>st.requestId===r.id&&s.routes.find(rt=>rt.id===st.routeId)?.status!=='planned')||s.journey_runs.some(j=>linked(j)&&(j.startedAt||['in_transit','completed'].includes(j.status)))||s.visit_events.some(v=>linked(v)&&v.arrivedAt);}
function detachPlannedJourneys(s:State,ids:Set<string>,a:Actor,now:string,reason:string){for(const j of s.journey_runs.filter(j=>j.status==='planned'&&(j.taskIds||[]).some((id:string)=>ids.has(id)))){const previousTaskIds=[...j.taskIds];j.taskIds=j.taskIds.filter((id:string)=>!ids.has(id));const remaining=s.tasks.filter(t=>j.taskIds.includes(t.id));j.requestIds=[...new Set(remaining.map(t=>t.requestId))];j.projectIds=[...new Set(remaining.map(t=>s.requests.find(r=>r.id===t.requestId)?.projectId).filter(Boolean))];j.replans=[...(j.replans||[]),{at:now,by:a.userId,reason,removedTaskIds:previousTaskIds.filter(id=>ids.has(id))}];if(!j.taskIds.length)Object.assign(j,{status:'cancelled',cancelledAt:now,cancelledBy:a.userId,reason});}}
export function replanJourneys(s:State,r:Row,a:Actor,now:string,reason:string){demand(!hasConfirmedExecution(s,r),'بدأ التنفيذ أو رحلة فعلية؛ لا يمكن استبدال خطة التنفيذ','STATE',409);detachPlannedJourneys(s,new Set(s.tasks.filter(t=>t.requestId===r.id).map(t=>t.id)),a,now,reason);}
const changeFingerprint=(s:State,r:Row)=>JSON.stringify({request:[r.status,r.priority,r.dueDate,r.notes,r.destination,r.warehouseId,r.sourceWarehouseId,r.sourceAddress,r.sourceExecutorId,r.supplierName,r.purchaseReference,r.customerId,r.referenceCode,r.documentDescription,r.documentAction,r.governorate],lines:s.lines.filter(l=>l.requestId===r.id).map(l=>[l.id,l.productId,l.quantity,l.unitPrice,l.priceMinor,l.free,l.currency]),needs:requestNeeds(s,r.id).map(n=>[n.id,n.productId,n.customerId,n.siteId,n.addressSnapshot,n.quantity,n.approved,n.governorate,n.unitPrice,n.priceMinor,n.free,n.currency]),tasks:s.tasks.filter(t=>t.requestId===r.id).map(t=>[t.id,t.status,t.quantity,t.needId,t.lineId,t.destination,t.sourceWarehouseId,t.executorId,t.carrierId,t.routeId,t.governorate,t.unitPrice,t.priceMinor,t.free,t.currency]),reservations:s.reservations.filter(x=>x.requestId===r.id).map(x=>[x.id,x.status,x.taskId,x.quantity,x.warehouseId,x.batchId,x.executorId]),stops:s.stops.filter(x=>x.requestId===r.id).map(x=>[x.id,x.routeId,x.taskId,x.sequence,x.status]),journeys:s.journey_runs.filter(j=>(j.requestIds||[]).includes(r.id)||(j.taskIds||[]).some((id:string)=>s.tasks.some(t=>t.id===id&&t.requestId===r.id))).map(j=>[j.id,j.status,j.startedAt,j.taskIds,j.executorId,j.routeId])});

/** All eight draft types share the same safe editor. It never edits a posted fact. */
export function editDraftRequest(s:State,r:Row,a:Actor,patch:Record<string,any>,now:string,add:Add){
 pm(a);demand(r.status==='draft'&&!hasConfirmedExecution(s,r),'تعديل البنود والخطوات قبل التنفيذ فقط؛ استخدم طلب تغيير أو تصحيح','STATE',409);
 if(patch.requestType!==undefined)demand(patch.requestType===r.requestType,'نوع الطلب ثابت؛ أنشئ طلبًا مستقلًا لتغيير مسار التشغيل');
 if(patch.priority!==undefined)r.priority=priority(patch.priority);if(patch.dueDate!==undefined)r.dueDate=validDay(patch.dueDate);if(patch.notes!==undefined)r.notes=patch.notes?text(patch.notes,1000):'';
 if(patch.governorate!==undefined)r.governorate=normalizeGovernorate(patch.governorate);
 const inbound=r.requestType==='purchase_receipt';
 for(const key of ['supplierName','purchaseReference','sourceAddress','referenceCode','documentDescription','destination','documentAction','returnReason'])if(patch[key]!==undefined){demand(!(key==='destination'&&r.demandPlan&&!patch.needs),'عناوين الطلب من احتياجات التسليم');r[key]=text(patch[key],['notes','documentDescription','returnReason'].includes(key)?1000:180);}
 if(patch.customerId!==undefined){demand(!r.demandPlan||patch.needs,'عميل الطلب من احتياجات التسليم');r.customerId=row(s,'customers',text(patch.customerId)).id;}
 for(const key of ['warehouseId','sourceWarehouseId'])if(patch[key]!==undefined)r[key]=row(s,'warehouses',text(patch[key])).id;
 if(patch.sourceExecutorId!==undefined)r.sourceExecutorId=row(s,'resources',text(patch.sourceExecutorId)).id;
 let newLines=patch.lines;if(patch.needs&&r.requestType==='delivery')newLines=needsAsLines(normalizeDeliveryNeeds(s,r.projectId,patch.needs));
 const needsChanged=patch.needs&&needSignature(normalizeDeliveryNeeds(s,r.projectId,patch.needs))!==needSignature(requestNeeds(s,r.id));
 const plannedTasks=s.tasks.filter(t=>t.requestId===r.id&&t.taskType!=='paperwork');
 if(newLines&&plannedTasks.length)demand(patch.resetPlannedTasks===true,'Remove draft tasks or confirm replanning / تغيير البنود يمس مهام مخططة؛ أكد إعادة التخطيط');
 if(needsChanged&&plannedTasks.length){demand(patch.resetPlannedTasks===true,'تغيير الوجهات يمس مهام مخططة؛ أكد إعادة التخطيط');demand(!s.reservations.some(x=>x.requestId===r.id)&&!s.stops.some(x=>x.requestId===r.id),'حرّر خطة التنفيذ قبل تغيير الاحتياجات');detachPlannedJourneys(s,new Set(plannedTasks.map(t=>t.id)),a,now,'تعديل احتياجات مسودة الطلب');s.tasks=s.tasks.filter(t=>!plannedTasks.some(old=>old.id===t.id));r.allocationPlan=false;}
 if(newLines){demand(r.requestType!=='documents'&&Array.isArray(newLines)&&newLines.length>0&&newLines.length<=100,'أضف بنودًا صحيحة');
  // Planned tasks are retained when product/quantity is unchanged. Otherwise a deliberate reset removes unexecuted plans only.
  const old=s.lines.filter(l=>l.requestId===r.id),seen=new Set();const values=newLines.map((v:any)=>{const p=row(s,'products',text(v.productId));demand(p.projectId===r.projectId&&!seen.has(p.id),'منتج مكرر أو من مشروع آخر');seen.add(p.id);const prior=old.find(l=>l.productId===p.id),priced=['delivery','distribution','warehouse_transfer'].includes(r.requestType);return {productId:p.id,quantity:qty(v.quantity),...(priced?normalizePriceMetadata(hasPriceMetadata(v)?v:prior||{}):{})};});
  const changed=old.length!==values.length||values.some((v:any)=>!old.some(l=>l.productId===v.productId&&l.quantity===v.quantity&&equalPrice(l,v)));
  if(changed){demand(!s.reservations.some(x=>x.requestId===r.id)&&!s.stops.some(x=>x.requestId===r.id),'حرّر خطة التنفيذ قبل استبدال البنود');const tasks=s.tasks.filter(t=>t.requestId===r.id&&t.taskType!=='paperwork');if(tasks.length)demand(patch.resetPlannedTasks===true,'تغيير البنود يمس مهام مخططة؛ أكد إعادة التخطيط');detachPlannedJourneys(s,new Set(tasks.map(t=>t.id)),a,now,'تعديل بنود مسودة الطلب');s.tasks=s.tasks.filter(t=>!tasks.some(old=>old.id===t.id));s.lines=s.lines.filter(l=>l.requestId!==r.id);for(const v of values)add('lines',{requestId:r.id,...v});for(const n of requestNeeds(s,r.id))n.status='superseded';r.allocationPlan=false;}
 }
 if(patch.needs)saveDeliveryNeeds(s,r,a,patch.needs,now,add);
 if(inbound&&r.warehouseId)r.destination=row(s,'warehouses',r.warehouseId).name;
 if(r.requestType==='documents'){demand(['collect','deliver','sign','return'].includes(r.documentAction||s.tasks.find(t=>t.requestId===r.id)?.documentAction),'اختر إجراء المستند');for(const t of s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='paperwork'))Object.assign(t,{documentAction:r.documentAction||t.documentAction,description:r.documentDescription,sourceAddress:r.sourceAddress,destination:r.destination,dueDate:r.dueDate});}
 r.lastEditedAt=now;r.lastEditedBy=a.userId;return {id:r.id};
}

const receipts=(s:State,r:Row)=>s.movements.filter(m=>m.requestId===r.id&&m.delta>0&&['purchase_receipt','collection_receipt','customer_return_in','transfer_in','return'].includes(m.type)&&!m.distributionPlanId);
const stockKey=(v:Record<string,any>)=>[v.productId,v.warehouseId||v.sourceWarehouseId,v.batchId||''].join('|');
const pendingDistributionStock=(s:State,m:Row)=>round(s.tasks.filter(t=>t.distributionPlanId&&t.status!=='cancelled'&&stockKey(t)===stockKey(m)).reduce((sum,t)=>sum+Math.max(0,round(t.quantity-s.reservations.filter(x=>x.taskId===t.id).reduce((q,x)=>q+x.quantity,0))),0));
export function receiptDistributionSources(s:State,r:Row):Array<Row&{accepted:number;allocated:number;available:number}>{return receipts(s,r).map(m=>{const allocated=s.tasks.filter(t=>t.receiptMovementId===m.id&&t.status!=='cancelled').reduce((n,t)=>n+t.quantity,0);return {...m,accepted:m.delta,allocated:round(allocated),available:Math.max(0,round(Math.min(m.delta-allocated,balance(s,m.productId,m.warehouseId,m.batchId||'').available-pendingDistributionStock(s,m))))};});}
const plans=(r:Row):any[]=>r.distributionPlans||(r.distributionPlans=[]);
const planFor=(s:State,c:Command)=>{const r=row(s,'requests',text(c.requestId)),h=c.loadingId?row(s,'handoffs',text(c.loadingId)):undefined,res=c.reservationId?row(s,'reservations',text(c.reservationId)):h?s.reservations.find(x=>x.id===h.reservationId):undefined,t=c.taskId?row(s,'tasks',text(c.taskId)):s.tasks.find(t=>t.id===res?.taskId);const id=c.distributionPlanId||t?.distributionPlanId||res?.distributionPlanId,p=plans(r).find(p=>p.id===id);demand(p,'اختر التوزيع المرتبط بالاستلام');demand(!t||t.requestId===r.id&&t.distributionPlanId===p.id,'المهمة لا تخص التوزيع');demand(!res||res.requestId===r.id&&res.distributionPlanId===p.id,'الحجز لا يخص التوزيع');demand(!h||h.requestId===r.id&&h.reservationId===res?.id,'تأكيد التحميل لا يخص التوزيع');return {r,p,t};};
export function distributionContext(s:State,r:Row,p:any){
 // Existing loading rules run on a request view, never changing the receipt lifecycle.
 const virtual={...r,requestType:'delivery',loadingProtocol:'dual',status:p.status,sourceReceiptId:r.id,distributionPlanId:p.id};
 return {virtual,view:{...s,requests:s.requests.map(x=>x.id===r.id?virtual:x)}};
}
export function executeRequestEvolution(s:State,a:Actor,c:Command,now:string,add:Add):Record<string,any>|null {
 if(['return','plan_return','return_arrive','return_destination','receive_return'].includes(c.type)){
  const inputTask=s.tasks.find(t=>t.id===c.taskId),sourceTask=inputTask?.distributionPlanId?inputTask:s.tasks.find(t=>t.id===inputTask?.sourceTaskId)||s.tasks.find(t=>t.id===s.reservations.find(x=>x.id===(c.reservationId||c.sourceId))?.taskId);
  if(sourceTask?.distributionPlanId){const r=row(s,'requests',sourceTask.requestId),p=plans(r).find(p=>p.id===sourceTask.distributionPlanId);demand(p,'خطة التوزيع غير موجودة');const {view,virtual}=distributionContext(s,r,p);virtual.status=p.status==='completed'?'closed':'delivering';const out=executeReturn(view,a,{...c,requestId:r.id},now,(kind,v)=>add(kind,{...v,distributionPlanId:p.id,receiptMovementId:sourceTask.receiptMovementId}));
   for(const task of s.tasks.filter(t=>t.distributionPlanId===p.id&&t.taskType==='delivery'))if(round(s.deliveries.filter(d=>d.taskId===task.id).reduce((sum,d)=>sum+d.quantity,0)+returnAmount(s,task))===task.quantity){task.status='completed';task.completedAt=now;}
   if(s.tasks.filter(t=>t.distributionPlanId===p.id).every(t=>t.status==='completed')){p.status='completed';p.completedAt=now;}return out;
  }
 }
 if(c.type==='save_customer_site'){
  demand(privileged(a)||['project_manager','operations','dispatcher'].includes(a.function),'حفظ العنوان للمسؤول المخول','FORBIDDEN',403);const customer=row(s,'customers',text(c.customerId));const projectId=c.projectId?row(s,'projects',text(c.projectId)).id:c.requestId?row(s,'requests',text(c.requestId)).projectId:'';demand(projectId||a.role==='owner'||a.projectIds==null&&a.warehouseIds==null&&a.resourceIds==null,'حدد المشروع لحفظ العنوان داخل نطاقه','FORBIDDEN',403);const values={customerId:customer.id,projectId,name:text(c.name),address:text(c.address,1000),...(c.governorate!==undefined?{governorate:normalizeGovernorate(c.governorate)}:{}),active:true};
  const existing=c.id?row(s,'customer_sites',text(c.id)):undefined;demand(!existing||existing.customerId===customer.id&&(!existing.projectId||existing.projectId===projectId),'العنوان يتبع عميلًا أو مشروعًا آخر');if(existing){Object.assign(existing,values,{updatedAt:now,updatedBy:a.userId});return {id:existing.id};}return {id:add('customer_sites',{...values,...(c.code?{code:code(c.code)}:{})}).id};
 }
 if(c.type==='edit_request'){const r=row(s,'requests',text(c.requestId));return editDraftRequest(s,r,a,c,now,add);}
 if(c.type==='save_delivery_needs'){const r=row(s,'requests',text(c.requestId));demand(r.status==='draft'||['purchase_receipt','receipt_order','courier_receipt','customer_return'].includes(r.requestType),'تعديل الاحتياجات بعد الاعتماد يحتاج طلب تغيير');return {id:r.id,needIds:saveDeliveryNeeds(s,r,a,c.needs,now,add).map(n=>n.id)};}
 if(c.type==='approve_delivery_needs'){const r=row(s,'requests',text(c.requestId));demand(requestNeeds(s,r.id).length,'أضف احتياجات العملاء');approveDeliveryNeeds(s,r,a,now);return {id:r.id};}
 if(c.type==='propose_request_change'){
  const r=row(s,'requests',text(c.requestId));pm(a);demand(r.status!=='draft','عدّل المسودة مباشرة');const patch=c.patch;demand(patch&&typeof patch==='object'&&!Array.isArray(patch),'حدد بيانات التعديل');const allowed=['priority','dueDate','notes','destination','needs','lines','sourceAddress','warehouseId','sourceWarehouseId','supplierName','purchaseReference','sourceExecutorId','customerId','referenceCode','documentDescription','documentAction','returnReason','governorate'];demand(Object.keys(patch).length&&Object.keys(patch).every(k=>allowed.includes(k)),'يتضمن التعديل حقولًا غير مسموحة');demand(!hasConfirmedExecution(s,r),'التنفيذ مؤكد؛ احتفظ بالواقعة وسجّل طلب تصحيح مستقل');
  demand(!s.approvals.some(ap=>ap.requestId===r.id&&ap.type==='request_change'&&ap.status==='pending'),'يوجد تعديل منتظر للمراجعة');const ap=add('approvals',{type:'request_change',requestId:r.id,reason:text(c.reason,1000),patch:structuredClone(patch),baseRevision:r.revision||0,baseStatus:r.status,baseFingerprint:changeFingerprint(s,r),status:'pending',requestedBy:a.userId,requestedAt:now});return {id:ap.id};
 }
 if(c.type==='review_request_change'){
  const r=row(s,'requests',text(c.requestId)),ap=row(s,'approvals',text(c.approvalId));ops(a);demand(ap.requestId===r.id&&ap.type==='request_change'&&ap.status==='pending','التعديل لا ينتظر اعتمادًا');demand(['approve','reject'].includes(c.decision),'اختر اعتماد أو رفض');
  if(c.decision==='approve'){demand((r.revision||0)===ap.baseRevision&&r.status===ap.baseStatus&&changeFingerprint(s,r)===ap.baseFingerprint,'تغير الطلب منذ اقتراح التعديل؛ أعد المراجعة','CONFLICT',409);demand(!hasConfirmedExecution(s,r),'بدأ التنفيذ؛ لا يمكن استبدال الواقعة');
   const affectedTasks=new Set(s.tasks.filter(t=>t.requestId===r.id).map(t=>t.id));const old={status:r.status,fields:structuredClone(r),lines:structuredClone(s.lines.filter(l=>l.requestId===r.id)),tasks:structuredClone(s.tasks.filter(t=>t.requestId===r.id)),reservations:structuredClone(s.reservations.filter(x=>x.requestId===r.id)),needs:structuredClone(requestNeeds(s,r.id)),journeys:structuredClone(s.journey_runs.filter(j=>(j.taskIds||[]).some((id:string)=>affectedTasks.has(id))))};
   detachPlannedJourneys(s,affectedTasks,a,now,ap.reason);
   const stopIds=new Set(s.stops.filter(st=>st.requestId===r.id).map(st=>st.id)),routeIds=new Set(s.stops.filter(st=>st.requestId===r.id).map(st=>st.routeId));s.stops=s.stops.filter(st=>!stopIds.has(st.id));s.routes=s.routes.filter(rt=>!routeIds.has(rt.id)||s.stops.some(st=>st.routeId===rt.id));s.assignments=s.assignments.filter(x=>x.requestId!==r.id);s.reservations=s.reservations.filter(x=>x.requestId!==r.id);s.tasks=s.tasks.filter(t=>t.requestId!==r.id||t.taskType==='paperwork');for(const t of s.tasks.filter(t=>t.requestId===r.id)){t.routeId='';t.executorId='';}
   r.status='draft';r.allocationPlan=false;const editor={...a,function:'project_manager'};editDraftRequest(s,r,editor,{...ap.patch,resetPlannedTasks:true},now,add);r.status=r.requestType==='purchase_receipt'?'awaiting_assignment':'approved';approveDeliveryNeeds(s,r,a,now);r.revision=(r.revision||0)+1;ap.before=old;ap.appliedAt=now;
   if(r.requestType==='purchase_receipt')for(const l of s.lines.filter(l=>l.requestId===r.id))add('tasks',{requestId:r.id,taskType:'warehouse_receipt',lineId:l.id,quantity:l.quantity,sourceAddress:r.supplierName,destination:r.destination,warehouseId:r.warehouseId,status:'planned',executorId:'',dueDate:r.dueDate});
  }ap.status=c.decision==='approve'?'approved':'rejected';ap.reviewedBy=a.userId;ap.reviewedAt=now;ap.reviewReason=c.reason?text(c.reason,1000):'';return {id:ap.id};
 }
 if(c.type==='propose_correction'){
  const r=row(s,'requests',text(c.requestId));demand(['deliveries','movements'].includes(c.kind),'اختر واقعة تسليم أو حركة');const fact=row(s,c.kind,text(c.recordId));demand(fact.requestId===r.id,'الواقعة لا تخص الطلب');const patch=c.patch;demand(patch&&Object.keys(patch).length&&Object.keys(patch).every(k=>['recipient','addressSnapshot','reason'].includes(k)),'الكميات لا تعدّل كبيانات وصفية؛ يلزم مرتجع فعلي أو استلام إضافي معتمد');const safe=Object.fromEntries(Object.entries(patch).map(([k,v])=>[k,text(v,1000)]));return {id:add('approvals',{type:'record_correction',requestId:r.id,recordKind:c.kind,recordId:fact.id,patch:safe,reason:text(c.reason,1000),status:'pending',requestedBy:a.userId,requestedAt:now}).id};
 }
 if(c.type==='review_correction'){
  const r=row(s,'requests',text(c.requestId)),ap=row(s,'approvals',text(c.approvalId));ops(a);demand(ap.requestId===r.id&&ap.type==='record_correction'&&ap.status==='pending','التصحيح لا ينتظر مراجعة');demand(['approve','reject'].includes(c.decision),'اختر اعتمادًا أو رفضًا');row(s,ap.recordKind,ap.recordId);ap.status=c.decision==='approve'?'approved':'rejected';ap.reviewedBy=a.userId;ap.reviewedAt=now;ap.reviewReason=c.reason?text(c.reason,1000):'';return {id:ap.id,applied:ap.status==='approved'};
 }
 if(c.type==='create_receipt_distribution'){
  const r=row(s,'requests',text(c.requestId));dispatch(a);demand(['purchase_receipt','receipt_order','courier_receipt','customer_return'].includes(r.requestType),'اختر طلب استلام');demand(Array.isArray(c.rows)&&c.rows.length>0&&c.rows.length<=100,'أضف توزيعات من المقبول فعليًا');
  const sources=receiptDistributionSources(s,r),entries:Record<string,any>[]=[],sourceAmounts=new Map<string,number>(),stockAmounts=new Map<string,number>(),needAmounts=new Map<string,number>();
  for(const v of c.rows){demand(v&&typeof v==='object'&&!Array.isArray(v),'صف توزيع غير صحيح');const source=sources.find(m=>m.id===v.receiptMovementId);demand(source,'الحركة ليست استلامًا مقبولًا لهذا الطلب');const q=qty(v.quantity),n=row(s,'delivery_needs',text(v.needId));demand(n.requestId===r.id&&n.approved&&n.status==='approved'&&n.lineId===source.lineId&&n.productId===source.productId,'اختر حصة عميل معتمدة تطابق الصنف المستلم');
   const sourceUsed=round((sourceAmounts.get(source.id)||0)+q);sourceAmounts.set(source.id,sourceUsed);demand(sourceUsed<=source.available,'التوزيع يتجاوز المقبول المتاح بعد الحجوزات والتخصيصات السابقة');const key=stockKey(source),stockUsed=round((stockAmounts.get(key)||0)+q);stockAmounts.set(key,stockUsed);demand(stockUsed<=round(balance(s,source.productId,source.warehouseId,source.batchId||'').available-pendingDistributionStock(s,source)),'إجمالي التوزيع من الاستلامات يتجاوز الرصيد المتاح لنفس المنتج والدفعة');const needUsed=round((needAmounts.get(n.id)||0)+q);needAmounts.set(n.id,needUsed);demand(round(s.tasks.filter(t=>t.needId===n.id&&t.status!=='cancelled').reduce((sum,t)=>sum+t.quantity,0)+needUsed)<=n.quantity,'التوزيع يتجاوز حصة العميل المعتمدة');
   const executorId=row(s,'resources',text(v.executorId)).id,carrierId=row(s,'carriers',text(v.carrierId)).id;entries.push({requestId:r.id,taskType:'delivery',allocationPlan:true,needId:n.id,lineId:source.lineId,productId:source.productId,receiptMovementId:source.id,sourceWarehouseId:source.warehouseId,sourceAddress:row(s,'warehouses',source.warehouseId).name,batchId:source.batchId||'',customerId:n.customerId,siteId:n.siteId||'',destination:n.addressSnapshot,addressSnapshot:n.addressSnapshot,quantity:q,executorId,carrierId,dueDate:r.dueDate,status:'planned'});
  }
  const p={id:crypto.randomUUID(),code:r.code+'-DIST-'+String(plans(r).length+1).padStart(2,'0'),status:'planned',createdAt:now,createdBy:a.userId,reason:text(c.reason||'توزيع من استلام مقبول',1000)};plans(r).push(p);const taskIds=[];for(const e of entries)taskIds.push(add('tasks',{...e,distributionPlanId:p.id}).id);return {id:p.id,distributionPlanId:p.id,taskIds};
 }
 if(c.type==='receipt_distribution_reserve'){
  dispatch(a);const {r,p}=planFor(s,c);demand(p.status==='planned','التوزيع محجوز بالفعل');const tasks=s.tasks.filter(t=>t.requestId===r.id&&t.distributionPlanId===p.id);demand(tasks.length,'التوزيع بلا مهام');const ids=[];
  for(const t of tasks){const m=row(s,'movements',t.receiptMovementId),l=row(s,'lines',t.lineId),available=balance(s,t.productId,t.sourceWarehouseId,t.batchId||'').available,b=s.batches.find(b=>b.id===t.batchId),eligibility=eligibleLimit(s,{...r,requestType:'delivery'},l,b,available,now);demand(t.quantity<=eligibility.limit&&t.quantity<=m.delta,'الرصيد المقبول أو الدفعة غير متاحين الآن','STOCK',409);const res=add('reservations',{requestId:r.id,taskId:t.id,lineId:t.lineId,productId:t.productId,warehouseId:t.sourceWarehouseId,batchId:t.batchId||'',executorId:t.executorId,quantity:t.quantity,status:'held',selectionMode:'receipt_linked',distributionPlanId:p.id,receiptMovementId:t.receiptMovementId});add('assignments',{requestId:r.id,taskId:t.id,reservationId:res.id,warehouseId:res.warehouseId,executorId:t.executorId,carrierId:t.carrierId,distributionPlanId:p.id});ids.push(res.id);}p.status='ready';return {id:p.id,reservationIds:ids};
 }
 if(c.type==='cancel_receipt_distribution'){
  dispatch(a);const {r,p}=planFor(s,c);demand(['planned','ready'].includes(p.status),'بدأ تنفيذ التوزيع؛ استخدم نقل العهدة أو المرتجع الفعلي');const tasks=s.tasks.filter(t=>t.distributionPlanId===p.id),ids=new Set(tasks.map(t=>t.id)),reservations=s.reservations.filter(x=>x.distributionPlanId===p.id);demand(reservations.every(x=>x.status==='held')&&!s.handoffs.some(h=>ids.has(h.taskId)||reservations.some(x=>x.id===h.reservationId))&&!s.movements.some(m=>ids.has(m.taskId))&&!s.deliveries.some(d=>ids.has(d.taskId))&&!s.journey_runs.some(j=>j.status==='in_transit'&&(j.taskIds||[]).some((id:string)=>ids.has(id))),'يوجد تأكيد أو تنفيذ مسجل؛ لا يمكن إلغاء خطة بدأت');for(const t of tasks){t.status='cancelled';t.cancelledAt=now;}for(const res of reservations)res.status='cancelled';p.status='cancelled';p.cancelledAt=now;p.cancelledBy=a.userId;p.cancelReason=text(c.reason,1000);return {id:p.id};
 }
 if(['receipt_distribution_release','receipt_distribution_collect'].includes(c.type)){
  const {r,p}=planFor(s,c),{virtual,view}=distributionContext(s,r,p);demand(['ready','loaded','in_transit','arrived','delivering'].includes(p.status),'احجز التوزيع أولًا');const type=c.type==='receipt_distribution_release'?'warehouse_release':'courier_collect';const out=executeLoading(view,a,{...c,type},now,add,executeActual);p.status=virtual.status;return out;
 }
 if(c.type==='receipt_distribution_arrive'){
  const {r,p,t}=planFor(s,c);demand(t&&['planned','in_transit'].includes(t.status),'اختر مهمة لم تصل بعد');demand(privileged(a)||a.function==='representative'&&a.resourceIds?.includes(t.executorId),'الوصول من المندوب المكلف','FORBIDDEN',403);demand(s.reservations.some(x=>x.taskId===t.id&&x.status==='issued'),'أكّد تحميل المهمة أولًا');t.status='arrived';t.arrivedAt=now;p.status='delivering';return {id:t.id};
 }
 if(c.type==='receipt_distribution_deliver'){
  const {r,p,t}=planFor(s,c);demand(t&&t.status==='arrived','سجّل وصول هذه المهمة');demand(privileged(a)||a.function==='representative'&&a.resourceIds?.includes(t.executorId),'التسليم من المندوب المكلف','FORBIDDEN',403);const res=row(s,'reservations',text(c.reservationId));demand(res.requestId===r.id&&res.taskId===t.id&&res.distributionPlanId===p.id&&res.status==='issued'&&res.executorId===t.executorId,'الحجز لا يخص المهمة أو المندوب');const q=qty(c.quantity);demand(q<=actualAvailable(s,res),'الكمية تتجاوز العهدة المتاحة');const total=s.deliveries.filter(d=>d.taskId===t.id).reduce((sum,d)=>sum+d.quantity,0);demand(round(total+q)<=t.quantity,'الكمية تتجاوز حصة المهمة');const proof=optionalEvidence(s,c,r,a,now,t);const delivered=add('deliveries',{requestId:r.id,taskId:t.id,lineId:t.lineId,productId:t.productId,reservationId:res.id,distributionPlanId:p.id,receiptMovementId:t.receiptMovementId,quantity:q,recipient:text(c.recipient),documentId:proof?.id||'',customerId:t.customerId,siteId:t.siteId||'',addressSnapshot:t.addressSnapshot,destination:t.addressSnapshot,executorId:t.executorId,batchId:res.batchId||'',visitId:c.visitId?text(c.visitId):crypto.randomUUID(),deliveryEventId:crypto.randomUUID(),destinationKind:'customer'});if(round(total+q)===t.quantity){t.status='completed';t.completedAt=now;}if(s.tasks.filter(t=>t.distributionPlanId===p.id).every(t=>t.status==='completed')){p.status='completed';p.completedAt=now;}return {id:delivered.id,delivered:q};
 }
 return null;
}

/** Overlay approved descriptive corrections without modifying the immutable original fact. */
export function correctedRecord(s:State,kind:Kind,record:Row):Row {
 const changes=s.approvals.filter(ap=>ap.type==='record_correction'&&ap.recordKind===kind&&ap.recordId===record.id&&ap.status==='approved').sort((a,b)=>String(a.reviewedAt).localeCompare(String(b.reviewedAt)));
 const address=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
 return changes.reduce((v,ap)=>{const patch=ap.patch||{},next={...v,...patch,correctionId:ap.id,originalRecordId:record.id};if(Object.prototype.hasOwnProperty.call(patch,'addressSnapshot')&&address(patch.addressSnapshot)!==address(v.addressSnapshot||v.destinationSnapshot||v.destination))next.governorate=Object.prototype.hasOwnProperty.call(patch,'governorate')?recordedGovernorate(patch.governorate):null;return next;},{...record});
}
