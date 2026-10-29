import {type State,type Actor,type Command,type Kind,type Row,demand,text,row,code} from './model';
import {normalizeGovernorate,recordedGovernorate} from './delivery-metadata';

type Add=(kind:Kind,value:Record<string,any>)=>Row;
export const journeyCommands=['plan_journey','start_journey','end_journey','cancel_journey','arrive_visit','leave_visit'];
const rows=(s:State,k:string):Row[]=>((s as any)[k]||[]);
const unique=(v:any[])=>[...new Set(v.filter(Boolean))] as string[];
const normalize=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const cairoDayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'});
export function journeyDay(value:any){const str=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(str))return str;const d=new Date(str);return Number.isFinite(d.getTime())?cairoDayFormat.format(d):'';}
const taskRequest=(s:State,t:Row)=>row(s,'requests',t.requestId);
export const journeyTasks=(s:State,j:Row)=>s.tasks.filter(t=>(j.taskIds||[]).includes(t.id));

/** A physical site key never contains a product, batch or order number. */
export function journeyPlace(s:State,t:Row,role:'source'|'destination'='destination'){
 const r=taskRequest(s,t),res=s.reservations.find(x=>x.id===t.reservationId||x.taskId===t.id);
 let placeKind='other',customerId='',warehouseId='',siteId='',addressSnapshot='';
 if(role==='source'){
  warehouseId=t.taskType==='return'?'':t.sourceWarehouseId||r.sourceWarehouseId||res?.warehouseId||'';
  if(warehouseId)placeKind='warehouse';
  else if(t.taskType==='return'||r.requestType==='customer_return'){placeKind='customer';const original=s.tasks.find(x=>x.id===t.sourceTaskId);customerId=original?.customerId||r.customerId||'';siteId=original?.customerSiteId||original?.siteId||r.customerSiteId||'';}
  else if(r.requestType==='courier_receipt')placeKind='courier';
  else if(['receipt_order','purchase_receipt'].includes(r.requestType))placeKind='supplier';
  addressSnapshot=t.sourceAddressSnapshot||t.sourceAddress||r.sourceAddressSnapshot||r.sourceAddress||r.supplierName||'';
 }else{
  warehouseId=t.destinationKind==='warehouse'||t.taskType==='return'||r.requestType==='purchase_receipt'&&!t.distributionPlanId?t.warehouseId||r.warehouseId||'':'';
  customerId=warehouseId?'':t.customerId||r.customerId||'';
  siteId=t.customerSiteId||t.siteId||r.customerSiteId||'';
  placeKind=warehouseId?'warehouse':customerId?'customer':t.destinationKind||'other';
  addressSnapshot=t.destinationSnapshot||t.addressSnapshot||t.destination||r.destinationSnapshot||r.destination||'';
 }
 const w=s.warehouses.find(w=>w.id===warehouseId),site=rows(s,'customer_sites').find(x=>x.id===siteId);
 addressSnapshot=String(addressSnapshot||site?.address||w?.address||w?.name||'').trim();
 const placeKey=warehouseId?`warehouse:${warehouseId}`:siteId?`site:${siteId}`:`${placeKind}:${customerId}:${normalize(addressSnapshot)}`;
 return {placeKind,placeRole:role,customerId,warehouseId,siteId,addressSnapshot,placeKey};
}

function requireCourier(a:Actor,executorId:string){
 demand(a.active&&a.role!=='viewer','حساب نشط بصلاحية التنفيذ مطلوب','FORBIDDEN',403);
 if(a.function==='representative')demand(Array.isArray(a.resourceIds)&&a.resourceIds.includes(executorId),'الرحلة لا تخص المندوب المرتبط بحسابك','FORBIDDEN',403);
 else demand(['owner','manager'].includes(a.role)||a.function==='dispatcher'||a.function==='all','إدارة الحركة أو المندوب المرتبط فقط','FORBIDDEN',403);
}
function taskSet(s:State,j:Row,ids:any){
 demand(Array.isArray(ids)&&ids.length>0&&ids.length<=100,'اختر من 1 إلى 100 مهمة');
 const selected=unique(ids).map(id=>row(s,'tasks',text(id)));
 demand(selected.every(t=>(j.taskIds||[]).includes(t.id)&&t.executorId===j.executorId),'المهمة ليست ضمن مشاركة هذا المندوب','FORBIDDEN',403);
 return selected;
}
function refreshSharedRoute(s:State,j:Row){
 if(!j.routeId)return;const rt=s.routes.find(r=>r.id===j.routeId);if(!rt)return;
 const participants=rows(s,'journey_runs').filter(x=>x.routeId===rt.id),allTasks=s.tasks.filter(t=>t.routeId===rt.id&&!['completed','cancelled'].includes(t.status));
 // An unfinished participant or an unrouted participant's task keeps a shared plan open.
 if(participants.some(x=>x.status==='in_transit'))rt.status='in_transit';
 else if(participants.length&&participants.every(x=>['completed','cancelled'].includes(x.status))&&!allTasks.length)rt.status='completed';
}
function stopTracking(s:State,id:string,now:string,reason:string){
 for(const session of rows(s,'tracking_sessions').filter(x=>x.journeyId===id&&x.status==='active'))Object.assign(session,{status:'stopped',stoppedAt:now,stopReason:reason});
}
function canStart(s:State,t:Row){
 const r=taskRequest(s,t),plan=t.distributionPlanId?(r.distributionPlans||[]).find((p:any)=>p.id===t.distributionPlanId):undefined;
 demand((t.distributionPlanId?plan&&['ready','loaded','in_transit','arrived','delivering'].includes(plan.status):!['draft','review','closed'].includes(r.status))&&!['completed','cancelled'].includes(t.status),'المهمة غير جاهزة لبدء الرحلة','STATE',409);
 demand(!['allocation','paperwork'].includes(t.taskType)||!['approved','awaiting_assignment'].includes(r.status),'اعتمد خطة التنفيذ وحدد المسؤولين قبل المغادرة','STATE',409);
 demand(!s.handoffs.some(h=>h.type==='loading_confirmation'&&h.status!=='posted'&&(h.taskId===t.id||!h.taskId&&h.requestId===t.requestId&&h.executorId===t.executorId&&h.lineId===t.lineId)),'يوجد تأكيد تحميل منتظر أو مختلف لهذه المهمة؛ راجعه قبل المغادرة','STATE',409);
 if(t.taskType==='delivery'){
  demand(!!t.routeId||t.distributionPlanId,'جهّز مسار التسليم قبل بدء مشاركة المندوب','STATE',409);
  const issued=s.reservations.filter(x=>x.requestId===t.requestId&&x.status==='issued'&&(!t.lineId||x.lineId===t.lineId)&&(!t.allocationPlan||x.taskId===t.id)&&(x.executorId||s.assignments.find(y=>y.reservationId===x.id)?.executorId)===t.executorId);
  demand(issued.some(x=>x.quantity>0),'تأكيد الاستلام الفعلي مطلوب قبل مغادرة التسليم','STATE',409);
  demand(t.distributionPlanId||s.tasks.filter(x=>x.requestId===t.requestId&&['pickup','documents'].includes(x.taskType)).every(x=>x.status==='completed'),'أكمل استلام ومستندات الطلب قبل المغادرة','STATE',409);
 }
}

export function executeJourney(s:State,a:Actor,c:Command,now:string,add:Add):Record<string,any>|null{
 if(!journeyCommands.includes(c.type))return null;
 (s as any).journey_runs ||= [];(s as any).visit_events ||= [];
 if(c.type==='plan_journey'){
  demand(['owner','manager'].includes(a.role)||['dispatcher','all'].includes(a.function),'خطة الرحلة من مسؤول الحركة','FORBIDDEN',403);
  const executor=row(s,'resources',text(c.executorId));requireCourier(a,executor.id);
  demand(Array.isArray(c.taskIds)&&c.taskIds.length>0&&c.taskIds.length<=100,'اختر مهام الرحلة');
  const tasks=unique(c.taskIds).map(id=>row(s,'tasks',text(id)));
  demand(tasks.every(t=>t.executorId===executor.id&&!['completed','cancelled'].includes(t.status)),'اختر مهامًا مفتوحة مسندة إلى نفس المندوب');
  demand(tasks.every(t=>t.distributionPlanId||!['draft','review','closed'].includes(taskRequest(s,t).status)),'اعتمد الطلبات قبل تخطيط رحلة التنفيذ','STATE',409);
  demand(!rows(s,'journey_runs').some(j=>['planned','in_transit'].includes(j.status)&&(j.taskIds||[]).some((id:string)=>tasks.some(t=>t.id===id))),'المهمة في مشاركة رحلة مفتوحة بالفعل','STATE',409);
  const route=c.routeId?row(s,'routes',text(c.routeId)):undefined;
  demand(!route||tasks.every(t=>!t.routeId||t.routeId===route.id),'المهمة مرتبطة بخطة رحلة أخرى');
  const date=c.date||journeyDay(now);demand(/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,'تاريخ رحلة صحيح مطلوب');
  const j=add('journey_runs' as Kind,{code:code(c.code),name:c.name?text(c.name):code(c.code),date,routeId:route?.id||'',executorId:executor.id,taskIds:tasks.map(t=>t.id),requestIds:unique(tasks.map(t=>t.requestId)),projectIds:unique(tasks.map(t=>taskRequest(s,t).projectId)),status:'planned',source:'explicit'});
  return {id:j.id,journeyId:j.id};
 }
 const v=c.type==='leave_visit'?rows(s,'visit_events').find(v=>v.id===c.visitId):undefined;
 const j=rows(s,'journey_runs').find(j=>j.id===(c.journeyId||v?.journeyId));
 demand(j,'مشاركة الرحلة غير موجودة','NOT_FOUND',404);requireCourier(a,j.executorId);
 if(c.type==='start_journey'){
  demand(j.status==='planned','بدأت المشاركة أو انتهت بالفعل','STATE',409);
  const plannedIds=unique(j.taskIds||[]),resolved=journeyTasks(s,j);
  demand(plannedIds.length>0&&resolved.length===plannedIds.length&&resolved.every(t=>(j.requestIds||[]).includes(t.requestId)),'تغيرت مهام أو طلبات خطة الرحلة؛ راجعها مع مسؤول الحركة قبل المغادرة','CONFLICT',409);
  demand(!rows(s,'journey_runs').some(x=>x.id!==j.id&&x.executorId===j.executorId&&x.status==='in_transit'),'أنهِ المشوار الحالي قبل بدء مشوار جديد','STATE',409);
  for(const t of resolved){
   demand(t.executorId===j.executorId,'تغير إسناد المهمة؛ راجع خطة الرحلة قبل المغادرة','CONFLICT',409);
   canStart(s,t);
   if(t.taskType==='delivery'){
    if(['planned','assigned','ready'].includes(t.status))t.status='in_transit';
    const r=taskRequest(s,t);if(!t.distributionPlanId&&['loaded','ready'].includes(r.status))r.status='in_transit';
   }
  }
  Object.assign(j,{status:'in_transit',startedAt:now,startedBy:a.userId});refreshSharedRoute(s,j);return {id:j.id,journeyId:j.id};
 }
 if(['end_journey','cancel_journey'].includes(c.type)){
  demand(c.type==='end_journey'?j.status==='in_transit':['planned','in_transit'].includes(j.status),'هذه المشاركة انتهت بالفعل','STATE',409);
  demand(!rows(s,'visit_events').some(v=>v.journeyId===j.id&&!v.departedAt&&!v.closedByNextArrival),'سجّل مغادرة الزيارة المفتوحة أولًا','STATE',409);
  const unfinished=journeyTasks(s,j).some(t=>t.status!=='completed');
  const reason=c.type==='cancel_journey'||unfinished?text(c.reason,1000):(c.reason?text(c.reason,1000):'');
  Object.assign(j,{status:c.type==='end_journey'?'completed':'cancelled',...(c.type==='end_journey'?{endedAt:now,endedBy:a.userId}:{cancelledAt:now,cancelledBy:a.userId}),reason,unfinishedTasks:unfinished});
  stopTracking(s,j.id,now,c.type==='end_journey'?'journey_completed':'journey_cancelled');refreshSharedRoute(s,j);return {id:j.id,journeyId:j.id};
 }
 demand(j.status==='in_transit','ابدأ مشاركة الرحلة أولًا','STATE',409);
 if(c.type==='leave_visit'){
  demand(v&&!v.departedAt&&!v.closedByNextArrival,'الزيارة غودرت بالفعل','STATE',409);
  demand(['completed','partial','failed'].includes(c.outcome),'اختر نتيجة الزيارة');
  Object.assign(v,{departedAt:now,departedBy:a.userId,outcome:c.outcome,reason:c.outcome==='failed'||c.outcome==='partial'?text(c.reason,1000):(c.reason?text(c.reason,1000):'')});
  return {id:v.id,visitId:v.id,journeyId:j.id};
 }
 const tasks=taskSet(s,j,c.taskIds),placeRole=c.placeRole==='source'?'source':'destination',places=tasks.map(t=>journeyPlace(s,t,placeRole)),place=places[0];
 demand(places.every(p=>p.placeKey===place.placeKey),'الزيارة الواحدة لمكان واحد؛ افصل العناوين المختلفة');
 demand(!c.customerId||c.customerId===place.customerId,'العميل لا يخص هذه المحطة');demand(!c.warehouseId||c.warehouseId===place.warehouseId,'المخزن لا يخص هذه المحطة');demand(!c.siteId||c.siteId===place.siteId,'فرع العميل لا يخص هذه المحطة');
 if(c.placeKind)demand(c.placeKind===place.placeKind,'نوع المكان لا يطابق المهمة');
 const address=c.address?text(c.address,1000):place.addressSnapshot;demand(address,'عنوان المكان مطلوب');
 if(normalize(address)!==normalize(place.addressSnapshot))text(c.reason,1000);
 const geography=c.governorate!==undefined?{governorate:normalizeGovernorate(c.governorate)}:{};
 if(c.visitId){const prior=rows(s,'visit_events').find(v=>v.id===c.visitId);demand(!prior,'رقم الزيارة مستخدم بالفعل؛ الزيارة التالية لها رقم جديد','DUPLICATE',409);}
 const openVisits=rows(s,'visit_events').filter(v=>v.executorId===j.executorId&&!v.departedAt&&!v.closedByNextArrival);
 demand(!openVisits.some(v=>v.journeyId||v.source==='explicit'),'سجّل مغادرة الزيارة الحالية قبل الوصول لمكان جديد','STATE',409);
 for(const v of openVisits)v.closedByNextArrival=true;
 const physicalPlaceKey=normalize(address)===normalize(place.addressSnapshot)?place.placeKey:place.placeKey+':actual:'+normalize(address);
 const visit=add('visit_events' as Kind,{...(c.visitId?{id:text(c.visitId)}:{}),journeyId:j.id,routeId:j.routeId||'',executorId:j.executorId,taskIds:tasks.map(t=>t.id),requestIds:unique(tasks.map(t=>t.requestId)),projectIds:unique(tasks.map(t=>taskRequest(s,t).projectId)),...place,plannedPlaceKey:place.placeKey,placeKey:physicalPlaceKey,addressSnapshot:address,...geography,arrivedAt:now,arrivedBy:a.userId,outcome:'arrived',reason:c.reason?text(c.reason,1000):'',source:'explicit'});
 if(placeRole==='destination')for(const t of tasks){
  if(t.taskType==='delivery'&&['in_transit','arrived'].includes(t.status)){t.status='arrived';t.arrivedAt=now;const r=taskRequest(s,t);if(!t.distributionPlanId&&!['delivering','delivered','closed'].includes(r.status))r.status='arrived';}
  else if(t.taskType==='allocation'&&t.status==='planned'){t.status='arrived';t.arrivedAt=now;}
 }
 return {id:visit.id,visitId:visit.id,journeyId:j.id};
}

/** Called only after a successful operational action, after its delivery rows are enriched. */
export function afterJourneyAction(s:State,a:Actor,c:Command,now:string,add:Add,result?:Record<string,any>,original?:State){
 if(journeyCommands.includes(c.type))return;
 const arrivals=['arrive','op_arrive','return_arrive','op_present','receipt_distribution_arrive','op_document'];
 const sourceActions=['op_collect','pickup_actual','courier_collect','receipt_distribution_collect'];
 const chosenTask=s.tasks.find(t=>t.id===c.taskId),stop=s.stops.find(st=>st.id===c.stopId);
 const loading=s.handoffs.find(h=>h.id===c.loadingId),reservation=s.reservations.find(r=>r.id===(result?.issuedReservationId||c.reservationId||loading?.issuedReservationId||loading?.reservationId));
 const sourceRole=sourceActions.includes(c.type),sourceConfirmed=sourceRole&&(c.type==='op_collect'||c.type==='pickup_actual'||result?.posted===true);
 const tasks=chosenTask?[chosenTask]:stop?stop.taskId?s.tasks.filter(t=>t.id===stop.taskId):s.tasks.filter(t=>t.requestId===stop.requestId&&t.autoGenerated):sourceConfirmed?s.tasks.filter(t=>t.id===reservation?.taskId||t.requestId===(c.requestId||reservation?.requestId)&&t.executorId===(c.executorId||reservation?.executorId||loading?.executorId)&&t.lineId===(c.lineId||reservation?.lineId)):[];
 if((arrivals.includes(c.type)||sourceConfirmed)&&tasks.length){
  (s as any).visit_events ||= [];
  const groups=new Map<string,Row[]>();for(const t of tasks){if(!t.executorId)continue;const p=journeyPlace(s,t,sourceConfirmed?'source':'destination');const key=t.executorId+'|'+p.placeKey;groups.set(key,[...(groups.get(key)||[]),t]);}
  for(const group of groups.values()){
   const t=group[0],place=journeyPlace(s,t,sourceConfirmed?'source':'destination'),j=rows(s,'journey_runs').find(j=>j.executorId===t.executorId&&j.status==='in_transit'&&group.every(t=>(j.taskIds||[]).includes(t.id)));
   const active=rows(s,'visit_events').find(v=>v.executorId===t.executorId&&!v.departedAt&&!v.closedByNextArrival);
   if(active&&(active.plannedPlaceKey||active.placeKey)===place.placeKey&&(!j||active.journeyId===j.id)){
    active.taskIds=unique([...(active.taskIds||[]),...group.map(t=>t.id)]);active.requestIds=unique([...(active.requestIds||[]),...group.map(t=>t.requestId)]);active.projectIds=unique([...(active.projectIds||[]),...group.map(t=>taskRequest(s,t).projectId)]);
   }else{
    if(active&&active.source==='explicit')demand(false,'غادر الزيارة الحالية قبل تسجيل الوصول التالي','STATE',409);
    if(active)active.closedByNextArrival=true; // No invented departure timestamp.
    add('visit_events' as Kind,{journeyId:j?.id||'',routeId:j?.routeId||t.routeId||stop?.routeId||'',executorId:t.executorId,taskIds:group.map(t=>t.id),requestIds:unique(group.map(t=>t.requestId)),projectIds:unique(group.map(t=>taskRequest(s,t).projectId)),...place,arrivedAt:now,arrivedBy:a.userId,outcome:'arrived',source:'operational'});
   }
  }
 }
 // Link newly recorded execution rows to the actual visit; shared orders never link another courier's visit.
 for(const k of ['deliveries','handoffs','returns','pods','exceptions'])for(const e of rows(s,k).filter(e=>e.createdAt===now&&e.createdBy===a.userId&&(!original||!rows(original,k).some(old=>old.id===e.id)))){
  // A source courier may remain linked for custody provenance. A carrier's
  // delivery or shipment record does not establish that courier's visit.
  if(e.performerType==='carrier'||e.performerType==='external_carrier'||['external_shipment','external_shipment_line','external_event','external_document','external_cost','external_invoice'].includes(e.type))continue;
  if(e.journeyId)continue;
  let t=s.tasks.find(t=>t.id===e.taskId);const res=s.reservations.find(x=>x.id===e.reservationId),executorId=e.executorId||t?.executorId||res?.executorId||s.assignments.find(x=>x.reservationId===res?.id)?.executorId;
  if(!executorId)continue;
  const role=e.type==='external_collection'||e.type==='return_plan'&&e.source==='delivered'?'source':'destination',place=t?journeyPlace(s,t,role):undefined;
  const candidates=t?[t]:s.tasks.filter(t=>t.requestId===e.requestId&&t.executorId===executorId&&(!e.lineId||t.lineId===e.lineId));
  const sourcePlaces=unique(candidates.map(t=>journeyPlace(s,t,role).placeKey));
  const expectedPlace=place||(sourcePlaces.length===1?journeyPlace(s,candidates[0],role):undefined);
  const visit=expectedPlace&&rows(s,'visit_events').find(v=>v.executorId===executorId&&!v.departedAt&&!v.closedByNextArrival&&candidates.some(t=>(v.taskIds||[]).includes(t.id))&&(v.plannedPlaceKey||v.placeKey)===expectedPlace.placeKey);
  if(visit){e.visitId=visit.id;e.actualVisitId=visit.id;e.journeyId=visit.journeyId||'';e.executorId=executorId;e.plannedAddressSnapshot=e.addressSnapshot||e.destinationSnapshot||t?.addressSnapshot||t?.destination||'';if(Object.prototype.hasOwnProperty.call(visit,'governorate'))e.governorate=recordedGovernorate(visit.governorate);else if(normalize(visit.addressSnapshot)!==normalize(e.plannedAddressSnapshot))e.governorate=null;e.addressSnapshot=visit.addressSnapshot;e.destinationSnapshot=visit.addressSnapshot;e.placeKey=visit.placeKey;}
 }
 void result;
}
