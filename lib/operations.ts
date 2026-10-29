import {optionalEvidence,pendingPresentation,actualAvailable} from './actual-quantities';
import {bindEvidence,pendingFor,pendingReturn,returnAmount} from './task-trace';
import {type State,type Actor,type Command,type Kind,type Row,demand,qty,text,code,row,balance} from './model';
import {extended,extendedTypes,inbound,outbound,round,collected,fulfilled,documentActions} from './operation-types';
import {hasPriceMetadata,normalizeGovernorate,normalizePriceMetadata} from './delivery-metadata';
type Add=(kind:Kind,v:Record<string,any>)=>Row;
const day=(v:any)=>{const d=text(v);demand(/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d,'أدخل تاريخًا صحيحًا');return d;};
export const operationPermissions:Record<string,string[]>={project_manager:['op_plan'],operations:['op_authorize','op_close','op_redirect'],dispatcher:['op_plan','op_sequence'],warehouse:['op_reserve','op_issue','op_receive'],representative:['op_collect','op_arrive','op_deliver','op_document']};
export function executeOperation(s:State,a:Actor,c:Command,now:string,add:Add):Record<string,any>|null{
 if(c.type==='create_request'&&extendedTypes.includes(c.requestType)){
  const type=c.requestType,doc=type==='documents',out=['warehouse_transfer','distribution'].includes(type);
  const projectId=row(s,'projects',text(c.projectId)).id;
  demand(['low','normal','high','urgent'].includes(c.priority||'normal'),'أولوية غير صحيحة');
  const sourceWarehouseId=out?row(s,'warehouses',text(c.sourceWarehouseId)).id:'';
  const customerId=type==='customer_return'?row(s,'customers',text(c.customerId)).id:'';
  const sourceExecutorId=type==='courier_receipt'?row(s,'resources',text(c.sourceExecutorId)).id:'';
  const sourceAddress=out?row(s,'warehouses',sourceWarehouseId).name:type==='courier_receipt'?(c.sourceAddress?text(c.sourceAddress):row(s,'resources',sourceExecutorId).name):text(c.sourceAddress);
  const r=add('requests',{requestType:type,code:code(c.code),projectId,sourceWarehouseId,sourceExecutorId,sourceKind:type==='courier_receipt'?'courier':type==='receipt_order'?'supplier':undefined,customerId,sourceAddress,destination:doc?text(c.destination):'تحدد عند توزيع المهام',supplierName:type==='receipt_order'?text(c.supplierName):'',purchaseReference:type==='receipt_order'?text(c.purchaseReference):'',referenceCode:type==='customer_return'?text(c.referenceCode):'',returnReason:type==='customer_return'?text(c.notes,1000):'',documentDescription:doc?text(c.documentDescription,1000):'',dueDate:day(c.dueDate||now.slice(0,10)),priority:c.priority||'normal',notes:c.notes?text(c.notes,1000):'',status:'draft'});
  if(doc){demand(documentActions.some(x=>x[0]===c.documentAction),'اختر الإجراء المستندي');add('tasks',{requestId:r.id,taskType:'paperwork',documentAction:c.documentAction,description:r.documentDescription,sourceAddress:r.sourceAddress,destination:r.destination,dueDate:r.dueDate,status:'planned',quantity:0,executorId:''});}
  else {demand(Array.isArray(c.lines)&&c.lines.length>0&&c.lines.length<=100,'أضف بنود الطلب');const seen=new Set();for(const line of c.lines){const p=row(s,'products',text(line.productId));demand(p.projectId===projectId,'المنتج من مشروع آخر');demand(!seen.has(p.id),'الصنف مكرر؛ اجمع كميته في سطر واحد');seen.add(p.id);add('lines',{requestId:r.id,productId:p.id,quantity:qty(line.quantity)});}}
  return {id:r.id};
 }
 const task=c.taskId?s.tasks.find(t=>t.id===c.taskId):undefined;
 const r=s.requests.find(r=>r.id===(c.requestId||task?.requestId));
 if(!r||!extended(r)){demand(!c.type.startsWith('op_'),'الإجراء يتطلب طلبًا مناسبًا');return null;}
 if(['upload','delete','preview_delete','exception','resolve_exception'].includes(c.type))return null;
 demand(!c.requestId||!task||task.requestId===c.requestId,'المهمة لا تخص الطلب');
 const state=(...statuses:string[])=>demand(statuses.includes(r.status),'الخطوة غير متاحة في حالة الطلب الحالية','STATE',409);
 const tasks=()=>s.tasks.filter(t=>t.requestId===r.id&&t.taskType!=='return'&&!t.distributionPlanId);
 const lines=()=>s.lines.filter(l=>l.requestId===r.id);
 const evidence=()=>optionalEvidence(s,c,r,a,now);
 const activeTask=()=>{demand(task&&task.requestId===r.id&&task.executorId&&task.status!=='completed','اختر مهمة مفتوحة ومسندة');return task;};
 const done=()=>{if(tasks().length&&s.tasks.filter(t=>t.requestId===r.id&&!t.distributionPlanId).every(t=>t.status==='completed'))r.status='ready_to_close';};
 const destination=(v:any)=>{demand(['warehouse','customer'].includes(v.destinationKind),'اختر مخزنًا أو عميلًا');demand(r.requestType!=='warehouse_transfer'||v.destinationKind==='warehouse','طلب التحويل بين المخازن فقط؛ استخدم توزيع للوجهات المختلطة');demand(!inbound(r)||v.destinationKind==='warehouse','أمر الاستلام ينتهي بمخزن');if(v.destinationKind==='warehouse'){const w=row(s,'warehouses',text(v.warehouseId));demand(w.id!==(v.sourceWarehouseId||task?.sourceWarehouseId||r.sourceWarehouseId),'مخزن الوجهة يجب أن يختلف عن المصدر');return {destinationKind:'warehouse',warehouseId:w.id,customerId:'',destination:w.name};}const customer=row(s,'customers',text(v.customerId));return {destinationKind:'customer',customerId:customer.id,warehouseId:'',destination:text(v.destination)};};
 if(c.type==='edit_request'){state('draft');if(c.dueDate)r.dueDate=day(c.dueDate);if(c.notes!==undefined)r.notes=c.notes?text(c.notes,1000):'';demand(!c.lines,'عدّل البنود قبل توزيعها باستخدام طلب جديد عند الحاجة');return {id:r.id};}
 if(c.type==='submit'){state('draft');r.status='review';return {id:r.id};}
 if(c.type==='approve'){state('review');r.status='approved';r.reviewedBy=a.userId;return {id:r.id};}
 if(c.type==='op_plan'){
  state('draft','approved');demand(a.role==='owner'||a.role==='manager'||a.function==='all'||(r.status==='draft'?a.function==='project_manager':a.function==='dispatcher'),'توزيع التنفيذ بعد الاعتماد لمسؤول الحركة','FORBIDDEN',403);
  demand(!task||task.status==='planned','المهمة بدأت بالفعل');
  demand(task||tasks().length<100,'الحد الأقصى 100 مهمة');const executorId=row(s,'resources',text(c.executorId)).id;demand(r.requestType!=='courier_receipt'||executorId!==r.sourceExecutorId,'المندوب المسلم والمستلم يجب أن يختلفا');
  if(r.requestType==='documents'){demand(task,'اختر المهمة');demand(documentActions.some(x=>x[0]===c.documentAction),'اختر الإجراء');Object.assign(task,{executorId,documentAction:c.documentAction,sourceAddress:text(c.sourceAddress),destination:text(c.destination),description:text(c.description,1000)});return {id:task.id};}
  const line=row(s,'lines',text(c.lineId));demand(line.requestId===r.id,'البند لا يخص الطلب');const q=qty(c.quantity);
  const total=tasks().filter(t=>t.lineId===line.id&&t.id!==task?.id).reduce((n,t)=>n+t.quantity,0);demand(round(total+q)<=line.quantity,'توزيع الكمية أكبر من المطلوب');
  const sequence=c.sequence?Number(c.sequence):task?.sequence||tasks().length+1;demand(Number.isInteger(sequence)&&sequence>0&&sequence<=100,'الترتيب من 1 إلى 100');
  const sourceWarehouseId=outbound(r)?row(s,'warehouses',c.sourceWarehouseId||task?.sourceWarehouseId||r.sourceWarehouseId).id:'';
  if(outbound(r)&&c.sourceWarehouseId){r.multiSourcePlan=true;for(const prior of tasks()){prior.allocationPlan=true;prior.sourceWarehouseId=prior.sourceWarehouseId||r.sourceWarehouseId;prior.productId=row(s,'lines',prior.lineId).productId;}}
  const metadata={governorate:normalizeGovernorate(c.governorate!==undefined?c.governorate:task?.governorate??r.governorate),...(outbound(r)?normalizePriceMetadata(hasPriceMetadata(c)?c:task&&hasPriceMetadata(task)?task:line):{})};
  const v={...(outbound(r)?{sourceWarehouseId,sourceAddress:row(s,'warehouses',sourceWarehouseId).name,productId:line.productId,allocationPlan:!!r.multiSourcePlan}:{}),sequence,presentationRequired:c.destinationKind==='warehouse',taskType:'allocation',requestId:r.id,lineId:line.id,quantity:q,executorId,...destination(c),...metadata,dueDate:r.dueDate,status:'planned'};
  if(task)Object.assign(task,v);else return {id:add('tasks',v).id};return {id:task!.id};
 }
 if(c.type==='op_sequence'){state('approved','authorized','reserved','in_transit','collecting');const t=activeTask();const n=Number(c.sequence);demand(Number.isInteger(n)&&n>0&&n<=100,'الترتيب من 1 إلى 100');t.sequence=n;return {id:t.id};}
 if(c.type==='op_authorize'){
  state('approved');demand(tasks().length&&tasks().every(t=>t.executorId),'وزّع المهام وحدد المسؤول أولًا');
  for(const line of lines())demand(round(tasks().filter(t=>t.lineId===line.id).reduce((n,t)=>n+t.quantity,0))===line.quantity,'وزّع كامل كمية كل بند');
  r.authorizationCode='AUTH-'+r.code;r.authorizedBy=a.userId;r.authorizedAt=now;r.status='authorized';return {id:r.id,authorizationCode:r.authorizationCode};
 }
 if(c.type==='op_reserve'){
  demand(outbound(r),'الحجز لطلب صرف مخزني فقط');state('authorized');demand(!r.multiSourcePlan,'اختر الدفعات لكل مهمة ومخزن من جدول الحجز');
  for(const line of lines()){const p=row(s,'products',line.productId);for(const executorId of new Set(tasks().filter(t=>t.lineId===line.id).map(t=>t.executorId))){let need=round(tasks().filter(t=>t.lineId===line.id&&t.executorId===executorId).reduce((n,t)=>n+t.quantity,0)-s.reservations.filter(x=>x.requestId===r.id&&x.lineId===line.id&&x.executorId===executorId).reduce((n,x)=>n+x.quantity,0));
   const keys=[...new Set(s.movements.filter(m=>m.productId===p.id&&m.warehouseId===r.sourceWarehouseId).map(m=>m.batchId||''))];
   keys.sort((x,y)=>String(s.batches.find(b=>b.id===x)?.expiryDate||'9999').localeCompare(String(s.batches.find(b=>b.id===y)?.expiryDate||'9999')));
   for(const batchId of keys){const b=s.batches.find(b=>b.id===batchId);if(p.tracked&&!b)continue;if(p.expiry&&(!b?.expiryDate||(Date.parse(b.expiryDate)-Date.parse(now.slice(0,10)))/86400000<=90))continue;const q=round(Math.min(need,balance(s,p.id,r.sourceWarehouseId,batchId).available));if(q<=0)continue;add('reservations',{requestId:r.id,lineId:line.id,productId:p.id,warehouseId:r.sourceWarehouseId,batchId,quantity:q,executorId,status:'held'});need=round(need-q);if(!need)break;}
   demand(need===0,'الرصيد المؤهل غير كافٍ في مخزن المصدر؛ راجع الكمية والدفعات','STOCK',409);
  }}r.status='reserved';return {id:r.id};
 }
 if(c.type==='op_issue'){
  demand(outbound(r),'الصرف لطلب مخزني فقط');state('reserved');const doc=evidence();
  for(const res of s.reservations.filter(x=>x.requestId===r.id)){demand(res.status==='held','تم صرف هذه الكمية بالفعل');const p=row(s,'products',res.productId),b=s.batches.find(b=>b.id===res.batchId);if(p.expiry)demand(b?.expiryDate&&(Date.parse(b.expiryDate)-Date.parse(now.slice(0,10)))/86400000>90,'الدفعة غير مؤهلة للصرف الآن');demand(balance(s,res.productId,res.warehouseId,res.batchId).onHand>=res.quantity,'الرصيد غير كافٍ');const executorId=res.executorId;add('movements',{type:'issue',requestId:r.id,lineId:res.lineId,reservationId:res.id,productId:res.productId,warehouseId:res.warehouseId,batchId:res.batchId,delta:-res.quantity,executorId,documentId:doc?.id||'',postedAt:now,reason:'صرف لتوزيع معتمد'});res.status='issued';}
  r.status='in_transit';return {id:r.id};
 }
 if(c.type==='op_collect'){
  demand(inbound(r),'أمر استلام مطلوب');state('authorized','collecting','in_transit');const line=row(s,'lines',text(c.lineId));demand(line.requestId===r.id,'البند لا يخص الطلب');const q=qty(c.quantity);const executorId=row(s,'resources',text(c.executorId)).id;demand(r.requestType!=='courier_receipt'||executorId!==r.sourceExecutorId,'المندوب المسلم والمستلم يجب أن يختلفا');const assigned=round(tasks().filter(t=>t.lineId===line.id&&t.executorId===executorId).reduce((n,t)=>n+t.quantity,0)),taken=round(s.handoffs.filter(h=>h.type==='external_collection'&&h.lineId===line.id&&h.executorId===executorId).reduce((n,h)=>n+h.quantity,0));demand(round(taken+q)<=assigned,'الكمية أكبر من نصيب المندوب المتبقي للاستلام');if(c.type==='op_collect'&&r.requestType==='courier_receipt')demand(!s.reservations.some(x=>x.productId===line.productId&&x.status==='issued'&&(x.executorId||s.assignments.find(y=>y.reservationId===x.id)?.executorId)===r.sourceExecutorId&&actualAvailable(s,x)>0),'المصدر عنده عهدة مسجلة لهذا الصنف؛ استخدم نقل العهدة بتأكيد الطرفين');const doc=evidence(),p=row(s,'products',line.productId);const b=c.batchId?row(s,'batches',c.batchId):undefined;demand(!b||b.productId===p.id,'الدفعة لا تخص المنتج');demand(!p.tracked||b,'اختر دفعة المنتج');if(p.expiry)demand(b?.expiryDate&&b.expiryDate>now.slice(0,10),'الدفعة منتهية أو بدون صلاحية');
  const candidates=tasks().filter(t=>t.lineId===line.id&&t.executorId===executorId);demand(!doc?.taskId||candidates.some(t=>t.id===doc.taskId),'الإثبات مرتبط بتوزيعة أخرى');if(doc&&candidates.length===1)bindEvidence(s,doc,candidates[0],'collection',a,now);
  add('handoffs',{taskId:candidates.length===1?candidates[0].id:'',type:'external_collection',requestId:r.id,lineId:line.id,productId:p.id,batchId:b?.id||'',quantity:q,executorId,documentId:doc?.id||'',reason:text(c.reason),recipient:text(c.recipient)});
  r.status=lines().every(l=>collected(s,l.id)===l.quantity)?'in_transit':'collecting';return {id:r.id,collected:q};
 }
 if(c.type==='op_arrive'){state('in_transit','collecting');const t=activeTask();demand(t.taskType==='allocation'&&t.status==='planned','الوجهة مسجلة وصول بالفعل');t.status='arrived';t.arrivedAt=now;return {id:t.id};}
 if(c.type==='op_receive'||c.type==='op_deliver'){
  state('in_transit','collecting');const t=activeTask();demand(t.status==='arrived','سجّل الوصول للوجهة أولًا');demand(t.taskType==='allocation','مهمة توزيع مطلوبة');demand((c.type==='op_receive')===(t.destinationKind==='warehouse'),'اختر الإجراء المناسب لنوع الوجهة');const q=qty(c.quantity);demand(round(fulfilled(s,t)+returnAmount(s,t)+pendingReturn(s,t)+q)<=t.quantity,'الكمية أكبر من نصيب الوجهة المتبقي');const doc=evidence();demand(!doc||!s.deliveries.some(d=>d.requestId===r.id&&d.documentId===doc.id&&d.taskId!==t.id),'ارفع إثباتًا مستقلًا لكل وجهة');if(doc)bindEvidence(s,doc,t,c.type,a,now);const recipient=text(c.recipient),line=row(s,'lines',t.lineId);let need=q;
  if(outbound(r)){
   for(const res of s.reservations.filter(x=>x.requestId===r.id&&x.lineId===line.id&&x.status==='issued'&&x.executorId===t.executorId&&(!t.allocationPlan||x.taskId===t.id)&&(!c.sourceId||x.id===c.sourceId))){const available=Math.min(actualAvailable(s,res),round(res.quantity-s.deliveries.filter(d=>d.reservationId===res.id).reduce((n,d)=>n+d.quantity,0)-s.returns.filter(d=>d.reservationId===res.id&&d.source==='custody').reduce((n,d)=>n+d.quantity,0)-pendingFor(s,'reservationId',res.id)-pendingPresentation(s,'reservationId',res.id)));const take=round(Math.min(need,available));if(take<=0)continue;add('deliveries',{requestId:r.id,taskId:t.id,lineId:line.id,productId:res.productId,reservationId:res.id,quantity:take,recipient,documentId:doc?.id||'',destinationKind:t.destinationKind});if(t.destinationKind==='warehouse')add('movements',{type:'transfer_in',requestId:r.id,taskId:t.id,lineId:line.id,reservationId:res.id,productId:res.productId,warehouseId:t.warehouseId,batchId:res.batchId,delta:take,documentId:doc?.id||'',recipient,reason:'استلام تحويل فعلي',postedAt:now});need=round(need-take);if(!need)break;}
  }else{
   for(const h of s.handoffs.filter(h=>h.type==='external_collection'&&h.requestId===r.id&&h.lineId===line.id&&h.executorId===t.executorId&&(!c.sourceId||h.id===c.sourceId))){const available=round(h.quantity-s.deliveries.filter(d=>d.collectionId===h.id).reduce((n,d)=>n+d.quantity,0)-s.returns.filter(d=>d.collectionId===h.id).reduce((n,d)=>n+d.quantity,0)-pendingFor(s,'collectionId',h.id)-pendingPresentation(s,'collectionId',h.id));const take=round(Math.min(need,available));if(take<=0)continue;const product=row(s,'products',line.productId),batch=s.batches.find(b=>b.id===h.batchId);if(product.expiry)demand(batch?.expiryDate&&batch.expiryDate>now.slice(0,10),'صلاحية الدفعة غير صالحة عند الاستلام');add('deliveries',{requestId:r.id,taskId:t.id,lineId:line.id,productId:line.productId,collectionId:h.id,quantity:take,recipient,documentId:doc?.id||'',destinationKind:'warehouse'});add('movements',{type:r.requestType==='customer_return'?'customer_return_in':'collection_receipt',requestId:r.id,taskId:t.id,lineId:line.id,collectionId:h.id,productId:line.productId,warehouseId:t.warehouseId,batchId:h.batchId,delta:take,documentId:doc?.id||'',recipient,reason:'استلام مخزني بعد استلام المندوب',postedAt:now});need=round(need-take);if(!need)break;}
  }
  demand(need===0,'لا توجد عهدة مستلمة كافية لدى المندوب');if(round(fulfilled(s,t)+returnAmount(s,t))===t.quantity){t.status='completed';t.completedAt=now;t.completedBy=a.userId;}done();return {id:t.id,accepted:q};
 }
 if(c.type==='op_document'){state('authorized');const t=activeTask();demand(t.taskType==='paperwork','مهمة مستندية مطلوبة');const doc=evidence();if(doc)bindEvidence(s,doc,t,'document_result',a,now);t.documentId=doc?.id||'';t.recipient=text(c.recipient);t.completionNote=text(c.reason,1000);t.status='completed';t.completedAt=now;t.completedBy=a.userId;done();return {id:t.id};}
 if(c.type==='op_redirect'){
  demand(outbound(r),'إعادة التوزيع لطلب خروج مخزني');state('authorized','reserved','in_transit');const t=activeTask();const q=qty(c.quantity);demand(q<round(t.quantity-fulfilled(s,t)-returnAmount(s,t)-pendingReturn(s,t)),'اترك جزءًا للوجهة الأصلية، وقسّم فقط كمية لم تُسلّم');const reason=text(c.reason,1000),target=destination(c);demand(target.destination!==t.destination||target.warehouseId!==t.warehouseId||target.customerId!==t.customerId,'اختر وجهة مختلفة');
  const metadata={governorate:normalizeGovernorate(c.governorate),...normalizePriceMetadata(hasPriceMetadata(c)?c:row(s,'lines',t.lineId))};
  t.quantity=round(t.quantity-q);const child=add('tasks',{allocationPlan:t.allocationPlan,sourceWarehouseId:t.sourceWarehouseId,sourceAddress:t.sourceAddress,productId:t.productId,taskType:'allocation',requestId:r.id,sourceTaskId:t.id,lineId:t.lineId,quantity:q,executorId:t.executorId,presentationRequired:target.destinationKind==='warehouse',...target,...metadata,dueDate:t.dueDate,status:'planned',reason,approvedBy:a.userId});if(t.allocationPlan&&s.reservations.some(x=>x.taskId===t.id)){let remaining=q;for(const res of s.reservations.filter(x=>x.taskId===t.id)){const take=round(Math.min(remaining,res.status==='issued'?actualAvailable(s,res):res.quantity));if(take<=0)continue;res.quantity=round(res.quantity-take);const {id,code,...copy}=res;const next=add('reservations',{...copy,quantity:take,taskId:child.id,originReservationId:res.originReservationId||res.id});const assignment=s.assignments.find(x=>x.reservationId===res.id);if(assignment){const {id,code,...aCopy}=assignment;add('assignments',{...aCopy,reservationId:next.id});}remaining=round(remaining-take);if(!remaining)break;}demand(remaining===0,'الكمية لا تتاح لإعادة التوجيه؛ يوجد تسليم أو رجوع أو نقل منتظر');}
  r.changes=[...(r.changes||[]),{at:now,actor:a.name,action:'split_destination',quantity:q,from:t.destination,to:child.destination,reason}];return {id:child.id};
 }
 if(c.type==='op_close'){state('ready_to_close');demand(tasks().length&&s.tasks.filter(t=>t.requestId===r.id&&!t.distributionPlanId).every(t=>t.status==='completed'),'أكمل كل المهام أولًا');demand(!s.exceptions.some(e=>e.requestId===r.id&&!e.resolved),'عالج الاستثناءات المفتوحة');r.status='closed';r.closedAt=now;return {id:r.id};}
 demand(false,'هذا الطلب يستخدم خطواته المبسطة الظاهرة في بطاقة الطلب');
 return null;
}
