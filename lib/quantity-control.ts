import {type Actor,type Command,type Kind,type Row,type State,balance,demand,qty,row,text} from './model';
import {assertScope} from './access';
import {eligibleLimit} from './batch-selection';
import {round} from './operation-types';
import {distributionContext} from './request-evolution';

type Add=(kind:Kind,value:Record<string,any>)=>Row;
type Pickup=(s:State,a:Actor,c:Command,now:string,add:Add)=>Record<string,any>|null;
const pending=(status:string)=>!['resolved','rejected'].includes(status);
const privileged=(a:Actor)=>['owner','manager'].includes(a.role);
const approvedOpen=(r:Row)=>['approved','reserved','assigned','documents_ready','ready','loaded','in_transit','arrived','delivering','authorized','collecting','awaiting_receipt','partially_received','awaiting_assignment'].includes(r.status);
export const canReviewQuantity=(a:Actor)=>a.active&&a.role!=='viewer'&&(privileged(a)||['project_manager','dispatcher'].includes(a.function));
export const canProposeQuantity=(a:Actor)=>a.active&&a.role!=='viewer'&&(privileged(a)||['project_manager','dispatcher','warehouse','representative','operations'].includes(a.function));
const reviewer=(a:Actor)=>demand(canReviewQuantity(a),'اعتماد الكمية ومعالجة الفرق لمدير المشروع أو مدير الحركة صاحب الصلاحية','FORBIDDEN',403);
const proposer=(a:Actor)=>demand(canProposeQuantity(a),'وظيفتك لا تسمح بطلب مراجعة الكمية','FORBIDDEN',403);
export function declaredQuantity(value:unknown){
 demand(value!==''&&value!==null&&value!==undefined,'أدخل الكمية الفعلية بنفسك');
 demand(typeof value==='number'||typeof value==='string','أدخل كمية رقمية صحيحة');
 const n=Number(value),scaled=n*1000;
 demand(Number.isFinite(n)&&n>=0&&n<=1000000&&Math.abs(scaled-Math.round(scaled))<=Number.EPSILON*Math.max(1,Math.abs(scaled))*4,'الكمية الفعلية صفر أو أكثر، وحتى 3 منازل عشرية');
 return n;
}
function evidence(s:State,c:Command,r:Row,taskId=''){
 if(!c.documentId)return '';
 const d=row(s,'documents',text(c.documentId));
 demand(d.requestId===r.id&&(!d.taskId||d.taskId===taskId),'الإثبات لا يخص الطلب أو المهمة');
 return d.id;
}
function linkedScope(s:State,a:Actor,record:Row){
 assertScope(s,a,{type:'quantity_review_scope',requestId:record.requestId,lineId:record.lineId,loadingId:record.loadingId,reservationId:record.reservationId,taskId:record.taskId,needId:record.needId,warehouseId:record.warehouseId,batchId:record.batchId,productId:record.productId,projectId:record.projectId});
}
function sourceLinks(s:State,h:Row){
 const r=row(s,'requests',h.requestId);
 const task=s.tasks.find(t=>t.id===h.taskId);
 return {requestId:r.id,projectId:r.projectId,loadingId:h.id,reservationId:h.reservationId,lineId:h.lineId,taskId:h.taskId||'',distributionPlanId:task?.distributionPlanId||'',receiptMovementId:task?.receiptMovementId||'',warehouseId:h.warehouseId,productId:h.productId,batchId:h.batchId||'',executorId:h.executorId};
}
/** An exception is a work item. Its immutable events and original signatures are separate from any stock movement. */
export function createLoadingDifference(s:State,h:Row,a:Actor,now:string,add:Add,reason:string,documentId='',category='quantity_difference',observedQuantity?:number){
 let ex=s.exceptions.find(e=>e.type==='loading_difference'&&e.loadingId===h.id&&pending(e.status));
 const afterPosting=h.status==='posted',courierQuantity=h.courierQuantity??null,observed=observedQuantity??courierQuantity;
 const originalMovement=s.movements.find(m=>m.id===h.movementId),baselineQuantity=afterPosting?(h.acceptedQuantity??(originalMovement?-originalMovement.delta:courierQuantity??h.warehouseQuantity)):h.warehouseQuantity;
 const difference=observed==null?round(h.warehouseQuantity-h.plannedQuantity):round(baselineQuantity-observed);
 if(!ex)ex=add('exceptions',{type:'loading_difference',...sourceLinks(s,h),plannedQuantity:h.plannedQuantity,warehouseQuantity:h.warehouseQuantity,courierQuantity,baselineQuantity,observedQuantity:observed,difference,direction:difference>0?'shortage':difference<0?'excess':'same_count',category,reason,documentId,discoveredBy:a.userId,discoveredByName:a.name,discoveredAt:now,responsibleFunctions:['project_manager','dispatcher'],status:'new',resolved:false,afterPosting,originalMovementId:h.movementId||''});
 else if(ex.courierQuantity==null&&courierQuantity!=null)Object.assign(ex,{courierQuantity,observedQuantity:observed,difference,direction:difference>0?'shortage':difference<0?'excess':'same_count'});
 const event=add('handoffs',{type:'loading_difference_event',...sourceLinks(s,h),exceptionId:ex.id,event:'reported',category,warehouseQuantity:h.warehouseQuantity,courierQuantity,baselineQuantity,observedQuantity:observed,difference,reason,documentId,performedBy:a.userId,performedByName:a.name,performedAt:now});
 ex.lastEventId=event.id;
 return ex;
}
function increaseTarget(s:State,r:Row,line:Row,c:Record<string,any>){
 const res=c.reservationId?row(s,'reservations',text(c.reservationId)):undefined;
 const task=c.taskId?row(s,'tasks',text(c.taskId)):res?s.tasks.find(t=>t.id===res.taskId)||s.tasks.find(t=>t.autoGenerated&&t.reservationId===res.id):undefined;
 const needs=s.delivery_needs.filter(n=>n.requestId===r.id&&n.lineId===line.id&&n.status!=='superseded');
 const needId=c.needId||task?.needId||(needs.length===1?needs[0].id:'');
 const need=needId?row(s,'delivery_needs',text(needId)):undefined;
 demand(!res||res.requestId===r.id&&res.lineId===line.id,'الحجز لا يتبع بند الطلب');
 demand(!task||task.requestId===r.id&&task.lineId===line.id,'المهمة لا تتبع بند الطلب');
 demand(!res||!task||!res.taskId||res.taskId===task.id,'الحجز لا يتبع المهمة');
 demand(!need||need.requestId===r.id&&need.lineId===line.id&&need.status!=='superseded','وجهة الزيادة لا تتبع البند الحالي');
 demand(needs.length<=1||need,'حدد العميل والوجهة التي تخصها الزيادة');
 demand(!r.allocationPlan||task,'حدد مهمة التوزيع التي ستضاف إليها الزيادة');
 demand(!task?.needId||task.needId===need?.id,'الوجهة لا تتبع المهمة');
 demand(!task||task.status!=='completed'&&task.status!=='cancelled','لا تزاد مهمة مكتملة؛ أنشئ توزيعًا جديدًا مرتبطًا بالاعتماد');
 demand(!res||res.status==='held','لا تعدّل كمية سبق صرفها؛ اختر حجزًا متبقيًا أو توزيعًا جديدًا');
 return {res,task,need};
}
function distributionPlan(r:Row,task:Row|undefined){
 if(!task?.distributionPlanId)return undefined;
 const plan=(r.distributionPlans||[]).find((p:any)=>p.id===task.distributionPlanId);demand(plan,'خطة التوزيع المرتبطة بالاستلام غير موجودة');
 return plan;
}
function assertDistributionIncrease(s:State,r:Row,line:Row,task:Row,need:Row|undefined,res:Row|undefined,increase:number,checkLimits=true){
 const plan=distributionPlan(r,task);demand(plan&&['planned','ready','loaded','in_transit','arrived','delivering'].includes(plan.status),'خطة التوزيع ليست مفتوحة');
 demand(need?.approved&&need.status==='approved','حصة التوزيع تحتاج عميلًا ووجهة معتمدين');
 demand(plan.status==='planned'||res?.status==='held','حدد الحجز المتبقي الذي تخصه زيادة التوزيع');
 const source=row(s,'movements',text(task.receiptMovementId));
 demand(source.requestId===r.id&&source.productId===line.productId&&source.delta>0&&source.warehouseId===task.sourceWarehouseId&&(source.batchId||'')===(task.batchId||''),'مصدر الاستلام لا يطابق مهمة التوزيع');
 if(!checkLimits)return plan;
 const sourceAllocated=s.tasks.filter(t=>t.receiptMovementId===source.id&&t.status!=='cancelled').reduce((n,t)=>n+t.quantity,0);
 demand(round(sourceAllocated+increase)<=source.delta,'زيادة التوزيع تتجاوز كمية الاستلام المقبولة؛ لا تغيّر أصل الاستلام','STOCK',409);
 const needIncrease=distributionNeedIncrease(s,need!,increase);
 const quotas=s.delivery_needs.filter(n=>n.requestId===r.id&&n.lineId===line.id&&n.status!=='superseded').reduce((n,x)=>n+x.quantity,0);
 demand(round(quotas+needIncrease)<=line.quantity,'حصص العملاء بعد الزيادة تتجاوز كمية الاستلام المعتمدة');
 return plan;
}
function distributionNeedIncrease(s:State,need:Row,increase:number){
 const allocated=s.tasks.filter(t=>t.needId===need.id&&t.status!=='cancelled').reduce((n,t)=>n+t.quantity,0);
 return Math.max(0,round(allocated+increase-need.quantity));
}
export function executeQuantityControl(s:State,a:Actor,c:Command,now:string,add:Add,pickup:Pickup):Record<string,any>|null{
 if(!['propose_quantity_increase','review_quantity_increase','report_loading_difference','review_loading_difference'].includes(c.type))return null;
 if(c.type==='propose_quantity_increase'){
  proposer(a);const r=row(s,'requests',text(c.requestId)),line=row(s,'lines',text(c.lineId));
  demand(line.requestId===r.id,'البند لا يتبع الطلب');const {res,task,need}=increaseTarget(s,r,line,c),plan=distributionPlan(r,task);
  demand(plan?['planned','ready','loaded','in_transit','arrived','delivering'].includes(plan.status):approvedOpen(r),'الزيادة على طلب معتمد مفتوح فقط');
  const newQuantity=qty(c.newQuantity??c.quantity),originalQuantity=plan?task!.quantity:line.quantity,increase=round(newQuantity-originalQuantity),reason=text(c.reason,1000);
  demand(increase>0,'الكمية الجديدة يجب أن تزيد عن الكمية المعتمدة');
  demand(!s.approvals.some(ap=>ap.type==='quantity_increase'&&ap.requestId===r.id&&ap.lineId===line.id&&ap.status==='pending'),'يوجد طلب زيادة ينتظر المراجعة لهذا البند','STATE',409);
  if(plan)assertDistributionIncrease(s,r,line,task!,need,res,increase,false);
  const documentId=evidence(s,c,r,task?.id);
  if(c.priorApprovalId){const prior=row(s,'approvals',text(c.priorApprovalId));demand(prior.type==='quantity_increase'&&prior.requestId===r.id&&prior.lineId===line.id&&prior.status==='rejected','إعادة المراجعة ترتبط بطلب زيادة مرفوض لنفس البند');linkedScope(s,a,prior);}
  const ap=add('approvals',{type:'quantity_increase',quantityScope:plan?'distribution_task':'request_line',distributionPlanId:plan?.id||'',receiptMovementId:task?.receiptMovementId||'',parentLineQuantity:line.quantity,requestId:r.id,projectId:r.projectId,lineId:line.id,productId:line.productId,needId:need?.id||'',taskId:task?.id||'',reservationId:res?.id||'',warehouseId:res?.warehouseId||task?.sourceWarehouseId||'',batchId:res?.batchId||'',originalQuantity,newQuantity,increase,needIncrease:plan?distributionNeedIncrease(s,need!,increase):increase,originalNeedQuantity:need?.quantity??null,originalTaskQuantity:task?.quantity??null,originalReservationQuantity:res?.quantity??null,reason,documentId,priorApprovalId:c.priorApprovalId||'',requestedBy:a.userId,requestedByName:a.name,requestedAt:now,responsibleFunctions:['project_manager','dispatcher'],status:'pending'});
  linkedScope(s,a,ap);
  add('handoffs',{type:'quantity_increase_event',requestId:r.id,projectId:r.projectId,lineId:line.id,productId:line.productId,approvalId:ap.id,event:'requested',originalQuantity,newQuantity,increase,reason,documentId,performedBy:a.userId,performedByName:a.name,performedAt:now});
  return {id:ap.id,approvalId:ap.id,status:ap.status};
 }
 if(c.type==='review_quantity_increase'){
  reviewer(a);const ap=row(s,'approvals',text(c.approvalId)),r=row(s,'requests',text(c.requestId));
  demand(ap.type==='quantity_increase'&&ap.requestId===r.id,'اعتماد الزيادة لا يتبع الطلب');linkedScope(s,a,ap);
  demand(ap.status==='pending','تمت مراجعة طلب الزيادة بالفعل','STATE',409);demand(ap.requestedBy!==a.userId,'لا يمكنك اعتماد أو رفض طلب الزيادة الذي أنشأته بنفسك','FORBIDDEN',403);
  const decision=c.decision==='approved'?'approve':c.decision==='rejected'?'reject':c.decision;demand(['approve','reject'].includes(decision),'اختر اعتماد أو رفض');
  const reason=text(c.reason,1000),documentId=evidence(s,c,r,ap.taskId),line=row(s,'lines',ap.lineId);
  if(decision==='approve'){
   const {res,task,need}=increaseTarget(s,r,line,ap);
   const plan=distributionPlan(r,task);
   demand(ap.quantityScope==='distribution_task'?!!plan:approvedOpen(r),'الطلب ليس معتمدًا ومفتوحًا');
   demand(ap.quantityScope==='distribution_task'?task?.quantity===ap.originalQuantity&&line.quantity===ap.parentLineQuantity:line.quantity===ap.originalQuantity,'تغيرت الكمية المعتمدة؛ أعد تقديم طلب الزيادة','CONFLICT',409);
   if(ap.quantityScope==='distribution_task')assertDistributionIncrease(s,r,line,task!,need,res,ap.increase);
   if(ap.quantityScope==='distribution_task')demand(distributionNeedIncrease(s,need!,ap.increase)===ap.needIncrease,'تغير تخصيص حصة العميل؛ أعد تقديم الزيادة','CONFLICT',409);
   demand(!need||need.quantity===ap.originalNeedQuantity,'تغيرت حصة الوجهة؛ أعد المراجعة','CONFLICT',409);
   demand(!task||task.quantity===ap.originalTaskQuantity,'تغيرت كمية المهمة؛ أعد المراجعة','CONFLICT',409);
   demand(!res||res.quantity===ap.originalReservationQuantity,'تغير الحجز؛ أعد تقديم الزيادة','CONFLICT',409);
   if(res){const available=balance(s,line.productId,res.warehouseId,res.batchId).available,batch=s.batches.find(b=>b.id===res.batchId),eligible=eligibleLimit(s,r,line,batch,available,now);demand(ap.increase<=eligible.limit,'الرصيد المؤهل لا يكفي لحجز الزيادة؛ استكمل من مخزن آخر بخطة موثقة','STOCK',409);res.quantity=round(res.quantity+ap.increase);res.quantityApprovalId=ap.id;}
   if(ap.quantityScope!=='distribution_task'){line.requestedQuantity??=line.quantity;line.approvedQuantity=ap.newQuantity;line.quantity=ap.newQuantity;line.lastQuantityApprovalId=ap.id;}
   if(need){need.originalQuantity??=need.quantity;need.quantity=round(need.quantity+(ap.needIncrease??ap.increase));need.lastQuantityApprovalId=ap.id;}
   if(task){task.originalQuantity??=task.quantity;task.quantity=round(task.quantity+ap.increase);task.lastQuantityApprovalId=ap.id;}
  }
  Object.assign(ap,{status:decision==='approve'?'approved':'rejected',reviewedBy:a.userId,reviewedByName:a.name,reviewedAt:now,reviewReason:reason,reviewDocumentId:documentId,...(decision==='approve'?{approvedBy:a.userId,approvedByName:a.name,approvedAt:now}:{})});
  add('handoffs',{type:'quantity_increase_event',requestId:r.id,projectId:r.projectId,lineId:line.id,productId:line.productId,approvalId:ap.id,event:ap.status,originalQuantity:ap.originalQuantity,newQuantity:ap.newQuantity,increase:ap.increase,reason,documentId,performedBy:a.userId,performedByName:a.name,performedAt:now});
  return {id:ap.id,approvalId:ap.id,status:ap.status,quantityScope:ap.quantityScope,approvedQuantity:ap.status==='approved'?ap.newQuantity:ap.originalQuantity,stockPosted:false};
 }
 const h=row(s,'handoffs',text(c.loadingId)),r=row(s,'requests',text(c.requestId));
 demand(h.type==='loading_confirmation'&&h.requestId===r.id,'تأكيد التحميل لا يتبع الطلب');linkedScope(s,a,{...h,loadingId:h.id,projectId:r.projectId});
 const reason=text(c.reason,1000),documentId=evidence(s,c,r,h.taskId);
 if(c.type==='report_loading_difference'){
  proposer(a);demand(!s.exceptions.some(e=>e.type==='loading_difference'&&e.loadingId===h.id&&pending(e.status)),'يوجد فرق مفتوح لهذا التحميل؛ أضف ملاحظة أثناء مراجعته','STATE',409);
  const q=declaredQuantity(c.quantity),category=c.category||'quantity_difference';demand(['quantity_difference','shortage','damage','loss','count_error','batch_difference','later_delivery'].includes(category),'نوع فرق غير صحيح');
  const ex=createLoadingDifference(s,h,a,now,add,reason,documentId,category,q);return {id:ex.id,exceptionId:ex.id,status:ex.status,stockPosted:false};
 }
 reviewer(a);const ex=s.exceptions.find(e=>e.type==='loading_difference'&&e.loadingId===h.id&&pending(e.status));demand(ex,'لا يوجد فرق مفتوح لهذا التحميل','STATE',409);
 const decision=c.decision==='rejected'?'reject':c.decision==='resolved'?'resolve':c.decision;
 demand(['start_review','await_decision','reject','resolve','record_evidence'].includes(decision),'اختر إجراء مراجعة صحيحًا');
 const priorStatus=ex.status;let movementId='',acceptedQuantity:number|undefined;
 if(decision==='start_review'){demand(ex.status==='new','بدأت المراجعة بالفعل','STATE',409);ex.status='under_review';}
 if(decision==='await_decision'){demand(['new','under_review'].includes(ex.status),'الفرق ينتظر القرار بالفعل','STATE',409);ex.status='awaiting_decision';}
 if(decision==='reject'){ex.status='rejected';ex.resolved=false;ex.rejectedBy=a.userId;ex.rejectedAt=now;}
 if(decision==='resolve'){
  demand(!ex.acceptedDecisionId,'قرار الكمية مسجل بالفعل؛ أي تسوية مخزنية تحتاج إجراءً مستقلًا معتمدًا','STATE',409);
  demand(a.userId!==h.warehouseUserId&&a.userId!==h.courierUserId,'قرار حسم الفرق يحتاج مديرًا مستقلًا عن تأكيدي التسليم والاستلام','FORBIDDEN',403);
  acceptedQuantity=declaredQuantity(c.acceptedQuantity);demand(ex.courierQuantity!=null,'ينتظر تسجيل تأكيد المندوب الفعلي أولًا');
  demand(acceptedQuantity<=(ex.observedQuantity??ex.courierQuantity),'لا يمكن اعتماد عهدة أكبر مما أكد المندوب استلامه؛ سجل استلامًا لاحقًا مستقلًا');
  const resolutionCategory=c.category||ex.category;demand(['quantity_difference','excess','shortage','damage','loss','count_error','batch_difference','later_delivery'].includes(resolutionCategory),'نوع معالجة غير صحيح');
  const stockAdjustmentRequired=ex.afterPosting&&acceptedQuantity!==ex.baselineQuantity||['damage','loss','batch_difference'].includes(resolutionCategory);
  if(h.status!=='posted'&&resolutionCategory!=='batch_difference'){
   const res=row(s,'reservations',h.reservationId);demand(res.status==='held','الحجز ليس متاحًا للصرف','STATE',409);demand(acceptedQuantity<=res.quantity,'الكمية تتجاوز الحجز المعتمد؛ اعتمد الزيادة واحجز رصيدها أولًا');
   if(acceptedQuantity>0){qty(acceptedQuantity);demand(acceptedQuantity<=round(balance(s,res.productId,res.warehouseId,res.batchId).available+res.quantity),'تغير الرصيد المتاح بعد الحجوزات؛ لا يكفي للصرف','STOCK',409);
    const task=s.tasks.find(t=>t.id===h.taskId),plan=distributionPlan(r,task),context=plan?distributionContext(s,r,plan):undefined;
    const result=pickup(context?.view||s,a,{type:'pickup_actual',requestId:r.id,reservationId:res.id,quantity:acceptedQuantity,...(documentId?{documentId}:{})},now,add);demand(result?.id,'تعذر ترحيل قرار الاستلام الفعلي');
    if(plan&&context)plan.status=context.virtual.status;
    const movement=s.movements.find(m=>m.type==='issue'&&m.reservationId===result.id&&m.createdBy===a.userId&&m.postedAt===now);demand(movement,'حركة الصرف غير مرتبطة بقرار معالجة الفرق');
    movementId=movement.id;Object.assign(movement,{loadingId:h.id,resolutionId:ex.id,quantityApprovalId:res.quantityApprovalId||'',warehouseUserId:h.warehouseUserId,warehouseUserName:h.warehouseUserName||'',warehousePerformedBy:h.warehouseUserId,warehousePerformedByName:h.warehouseUserName||'',courierUserId:h.courierUserId,courierUserName:h.courierUserName||'',resolvedBy:a.userId,resolvedByName:a.name});
    Object.assign(h,{issuedReservationId:result.id,movementId,taskId:movement.taskId||h.taskId});
   }
   Object.assign(h,{status:'posted',resolutionId:ex.id,acceptedQuantity,postedAt:now,postedBy:a.userId,postedByName:a.name});
  }
  Object.assign(ex,{status:stockAdjustmentRequired?'awaiting_decision':'resolved',resolved:!stockAdjustmentRequired,decisionBy:a.userId,decisionByName:a.name,decisionAt:now,...(!stockAdjustmentRequired?{resolvedBy:a.userId,resolvedByName:a.name,resolvedAt:now}:{}),acceptedQuantity,movementId:movementId||h.movementId||'',stockAdjustmentRequired,underSettlementQuantity:round(Math.abs(ex.baselineQuantity-acceptedQuantity)),stockEffect:movementId?'explicit_issue':'none',resolutionCategory,resolutionReason:reason});
 }
 const event=add('handoffs',{type:'loading_difference_event',...sourceLinks(s,h),exceptionId:ex.id,event:decision,priorStatus,status:ex.status,acceptedQuantity:acceptedQuantity??null,movementId,reason,documentId,performedBy:a.userId,performedByName:a.name,performedAt:now});
 if(decision==='resolve')ex.acceptedDecisionId=event.id;
 Object.assign(ex,{lastEventId:event.id,lastReviewedBy:a.userId,lastReviewedByName:a.name,lastReviewedAt:now});
 return {id:ex.id,exceptionId:ex.id,status:ex.status,acceptedQuantity:acceptedQuantity??null,movementId,stockPosted:!!movementId,stockAdjustmentRequired:!!ex.stockAdjustmentRequired};
}
