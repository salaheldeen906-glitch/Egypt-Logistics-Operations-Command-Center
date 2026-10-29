import {type State,type Row,type Actor,type Command,type Kind,demand,row,text,code,qty,balance} from './model';
import {normalizeGovernorate} from './delivery-metadata';

type Add=(kind:Kind,value:Record<string,any>)=>Row;
const round=(n:number)=>Math.round(n*1000)/1000;
const sum=(rows:Row[],key='quantity')=>round(rows.reduce((n,r)=>n+Number(r[key]||0),0));
const optional=(value:unknown,max=300)=>value==null||value===''?'':text(value,max);
export const externalTransportCommands=['external_shipment_save','external_shipment_cancel','external_warehouse_release','external_handover','external_deliver','external_return','external_return_accept','external_document','external_cost','external_invoice'] as const;
export function externalCommandAllowed(a:Actor,type:string){
 if(!a.active||a.role==='viewer'||!externalTransportCommands.includes(type as any))return false;
 if(['external_warehouse_release','external_return_accept'].includes(type))return a.function==='warehouse';
 if(a.role==='owner'||a.role==='manager'||['all','dispatcher','operations'].includes(a.function))return true;
 return a.function==='representative'&&['external_handover','external_document'].includes(type);
}
const currency=(value:unknown)=>{const v=optional(value||'EGP',3).toUpperCase();demand(/^[A-Z]{3}$/.test(v),'حدد رمز العملة من ثلاثة أحرف');return v;};
const packages=(value:unknown)=>{if(value==null||value==='')return null;const q=qty(value);demand(Number.isInteger(q),'عدد الطرود عدد صحيح؛ كمية الصنف ووحدته حقل مستقل');return q;};
function money(value:unknown,required=false):number|null{
 if(value==null||value===''){demand(!required,'القيمة النقدية مطلوبة');return null;}
 const v=String(value).trim();demand(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(v),'القيمة يجب أن تكون صفرًا أو موجبة وحتى منزلتين عشريتين');
 const [whole,part='']=v.split('.');const n=Number(whole)*100+Number(part.padEnd(2,'0'));demand(Number.isSafeInteger(n),'القيمة النقدية أكبر من الحد');return n;
}
function date(value:unknown,required=false){const v=optional(value,40);if(!v){demand(!required,'التاريخ مطلوب');return '';}
 demand(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v)&&!isNaN(Date.parse(v)),'تاريخ غير صحيح؛ وقت التنفيذ يحتاج منطقة زمنية');
 if(v.length===10)demand(new Date(v).toISOString().slice(0,10)===v,'تاريخ غير صحيح');return v;}
const contextKeys=['requestIds','taskIds','projectIds','warehouseIds','executorIds'] as const;
function context(lines:Row[]){return Object.fromEntries(contextKeys.map((key,i)=>[key,[...new Set(lines.map(l=>l[['requestId','taskId','projectId','warehouseId','executorId'][i]]).filter(Boolean))]]));}
function shipment(s:State,id:unknown){const h=row(s,'handoffs',text(id));demand(h.type==='external_shipment','اختر شحنة نقل خارجي');return h;}
function shipmentLine(s:State,h:Row,id:unknown){const l=row(s,'handoffs',text(id));demand(l.type==='external_shipment_line'&&l.shipmentId===h.id,'البند لا يخص الشحنة');return l;}
export function externalLineMetrics(s:State,l:Row){
 const delivered=sum(s.deliveries.filter(d=>d.shipmentLineId===l.id));
 const returnedCustody=sum(s.returns.filter(r=>r.shipmentLineId===l.id&&r.source==='custody'));
 const returnedCustomer=sum(s.returns.filter(r=>r.shipmentLineId===l.id&&r.source==='delivered'));
 const presented=s.handoffs.filter(h=>h.type==='external_event'&&h.eventType==='return_presented'&&h.shipmentLineId===l.id);
 const pendingReturn=round(sum(presented)-sum(s.returns.filter(r=>r.shipmentLineId===l.id)));
 const collectedCustomer=sum(presented.filter(h=>h.source==='delivered'));
 const handed=Number(l.handedQuantity||0),planned=Number(l.quantity||0);
 return {planned,handed,delivered,returnedCustody,returnedCustomer,pendingReturn,custody:round(handed-delivered-returnedCustody+collectedCustomer-returnedCustomer),unhanded:round(planned-handed)};
}
/** Ownership committed to external shipments. Deliveries/accepted custody returns already reduce the underlying reservation. */
export function externalUnavailable(s:State,reservationId:string,exceptShipmentId=''){
 return round(s.handoffs.filter(l=>l.type==='external_shipment_line'&&l.reservationId===reservationId&&l.shipmentId!==exceptShipmentId).reduce((n,l)=>{
  const h=s.handoffs.find(h=>h.id===l.shipmentId&&h.type==='external_shipment');if(!h||h.mode==='historical'||h.status==='cancelled')return n;
  const m=externalLineMetrics(s,l);return n+Math.max(0,m.planned-m.delivered-m.returnedCustody);
 },0));
}
function availableForShipment(s:State,res:Row,exceptShipmentId=''){
 const returned=sum(s.returns.filter(r=>r.reservationId===res.id&&r.source==='custody'));
 const pendingReturns=s.handoffs.filter(h=>h.type==='return_plan'&&h.source!=='delivered'&&h.reservationId===res.id).reduce((n,h)=>n+h.quantity-sum(s.returns.filter(r=>r.returnPlanId===h.id)),0);
 const presentation=s.handoffs.filter(h=>h.type==='warehouse_present'&&h.reservationId===res.id).reduce((n,h)=>n+h.quantity-(h.rejectedQuantity||0)-sum(s.deliveries.filter(d=>d.presentationId===h.id)),0);
 const transfer=sum(s.handoffs.filter(h=>h.type==='custody_transfer'&&h.status==='awaiting_receiver'&&h.reservationId===res.id));
 return round(res.quantity-sum(s.deliveries.filter(d=>d.reservationId===res.id))-returned-pendingReturns-presentation-transfer-externalUnavailable(s,res.id,exceptShipmentId));
}
function taskAvailable(s:State,t:Row,exceptShipmentId=''){
 const delivered=sum(s.deliveries.filter(d=>d.taskId===t.id));
 const returned=sum(s.returns.filter(r=>r.source==='custody'&&(r.taskId===t.id||r.sourceTaskId===t.id)));
 const pending=s.handoffs.filter(h=>h.type==='return_plan'&&h.source!=='delivered'&&(h.sourceTaskId===t.id||s.tasks.some(r=>r.id===h.taskId&&r.sourceTaskId===t.id))).reduce((n,h)=>n+h.quantity-sum(s.returns.filter(r=>r.returnPlanId===h.id)),0);
 const external=s.handoffs.filter(l=>l.type==='external_shipment_line'&&l.taskId===t.id&&l.shipmentId!==exceptShipmentId).reduce((n,l)=>{const h=s.handoffs.find(h=>h.id===l.shipmentId);if(!h||h.mode==='historical'||h.status==='cancelled')return n;const m=externalLineMetrics(s,l);return n+Math.max(0,m.planned-m.delivered-m.returnedCustody);},0);
 return round(t.quantity-delivered-returned-pending-external);
}
function evidence(s:State,c:Command,h:Row,l?:Row,required=true){
 demand(!required||c.documentId,'أرفق إثباتًا مسجلًا للعملية');if(!c.documentId)return undefined;
 const d=row(s,'documents',text(c.documentId));demand(d.objectKey&&d.requestId&&(h.requestIds||[]).includes(d.requestId),'الإثبات يجب أن يخص أحد طلبات الشحنة');
 if(l)demand(d.requestId===l.requestId&&(!d.taskId||d.taskId===l.taskId),'الإثبات لا يخص الطلب والمهمة المحددين');
 return d;
}
function refresh(s:State,h:Row,now:string){
 const lines=s.handoffs.filter(l=>l.type==='external_shipment_line'&&l.shipmentId===h.id);
 if(!lines.some(l=>Number(l.handedQuantity)>0))return;
 h.actualLoadAt=h.actualLoadAt||now;
 const complete=lines.every(l=>{const m=externalLineMetrics(s,l);return m.unhanded===0&&m.custody===0&&m.pendingReturn===0;});
 const delivered=sum(s.deliveries.filter(d=>d.shipmentId===h.id));
 h.status=complete?(delivered===sum(lines)?'delivered':delivered===0?'returned':'completed'):'in_transit';
 const deliveryTimes=s.deliveries.filter(d=>d.shipmentId===h.id).map(d=>d.deliveredAt||d.createdAt).filter(Boolean).sort();
 if(deliveryTimes.length)h.actualDeliveryAt=deliveryTimes.at(-1);
 if(complete)h.actualCompletionAt=now;else delete h.actualCompletionAt;
 for(const requestId of h.requestIds||[]){const r=s.requests.find(r=>r.id===requestId);if(!r)continue;
  const tasks=s.tasks.filter(t=>t.requestId===r.id&&['delivery','allocation'].includes(t.taskType));
  for(const t of tasks){const q=sum(s.deliveries.filter(d=>d.taskId===t.id))+sum(s.returns.filter(x=>(x.sourceTaskId===t.id||x.taskId===t.id)&&x.source==='custody'));if(round(q)===round(t.quantity)){t.status='completed';t.completedAt=now;}}
  for(const p of r.distributionPlans||[]){const planned=tasks.filter(t=>t.distributionPlanId===p.id);if(planned.length&&planned.every(t=>t.status==='completed')){p.status='completed';p.completedAt=now;}}
  if(r.status==='closed'||!['delivery','distribution','warehouse_transfer'].includes(r.requestType||'delivery'))continue;
  if(tasks.length&&tasks.every(t=>t.status==='completed'))r.status=['distribution','warehouse_transfer'].includes(r.requestType)?'ready_to_close':'delivered';else if(!['draft','review','closed'].includes(r.status))r.status='delivering';
 }
}
function ownSender(a:Actor,l:Row){if(a.function==='representative')demand(a.resourceIds?.includes(l.executorId),'العهدة لا تخص مندوب هذا الحساب','FORBIDDEN',403);}
function noOtherExecution(s:State,l:Row,h:Row){const res=row(s,'reservations',l.reservationId),m=externalLineMetrics(s,l);demand(availableForShipment(s,res,h.id)>=round(m.planned-m.delivered-m.returnedCustody),'تغيرت العهدة أو التنفيذ؛ راجع بنود الشحنة قبل التأكيد');return res;}
function actualQuantity(value:unknown){demand(value!==''&&value!=null,'أدخل الكمية الفعلية');const q=Number(value);demand(Number.isFinite(q)&&q>=0&&q<=1000000&&Math.abs(q*1000-Math.round(q*1000))<0.0000001,'الكمية الفعلية صفر أو أكثر وحتى ثلاث منازل عشرية');return q;}

export function executeExternalTransport(s:State,a:Actor,c:Command,now:string,add:Add):Record<string,any>|null{
 if(!externalTransportCommands.includes(c.type as any))return null;
 demand(externalCommandAllowed(a,c.type),'وظيفتك لا تسمح بهذا الإجراء في النقل الخارجي','FORBIDDEN',403);
 if(c.type==='external_shipment_save'){
  const previous=c.shipmentId?shipment(s,c.shipmentId):undefined;
  demand(!previous||['draft','historical'].includes(previous.status),'بدأ تنفيذ الشحنة؛ لا يمكن استبدال خطتها');
  demand(!previous||!s.handoffs.some(e=>e.shipmentId===previous.id&&e.type==='external_event'&&['warehouse_release','handover'].includes(e.eventType)),'يوجد تأكيد فعلي للشحنة؛ لا يمكن استبدال الخطة');
  demand(!previous||!s.handoffs.some(e=>e.shipmentId===previous.id&&['external_document','external_cost'].includes(e.type)||e.type==='external_invoice'&&(e.shipmentIds||[]).includes(previous.id)),'الشحنة مرتبطة بمستند أو تكلفة أو فاتورة محفوظة؛ لا يمكن استبدال سياقها');
  const mode=c.mode==='historical'?'historical':'operational';demand(!previous||previous.mode===mode,'لا يمكن تحويل سجل تاريخي لحركة تشغيلية');
  const carrier=row(s,'carriers',text(c.carrierId));demand(carrier.active!==false&&carrier.status!=='inactive'&&carrier.relationshipStatus!=='suspended','الناقل غير متاح للتعامل');
  const participantRole=c.participantRole||'unspecified';demand(['internal_courier','driver','coordinator','unspecified'].includes(participantRole),'حدد صفة المشارك');
  demand(Array.isArray(c.lines)&&c.lines.length>0&&c.lines.length<=200,'أضف من بند إلى ٢٠٠ بند للشحنة');
  const seen=new Set<string>(),proposedByTask=new Map<string,number>();const lines:Row[]=c.lines.map((input:any)=>{
   if(mode==='historical'){demand(!input.reservationId&&!input.taskId,'السجل التاريخي لا يرتبط بعهدة تشغيلية');return {id:'',code:'',description:text(input.description),quantity:qty(input.quantity),unitLabel:text(input.unitLabel),packageCount:packages(input.packageCount),packaging:optional(input.packaging)};}
   const res=row(s,'reservations',text(input.reservationId)),r=row(s,'requests',res.requestId),p=row(s,'products',res.productId);
   const t=row(s,'tasks',text(input.taskId||res.taskId||s.tasks.find(t=>t.reservationId===res.id)?.id));
   const distribution=t.distributionPlanId?(r.distributionPlans||[]).find((plan:any)=>plan.id===t.distributionPlanId):undefined;
   demand(!t.distributionPlanId||distribution&&res.distributionPlanId===distribution.id&&res.receiptMovementId===t.receiptMovementId&&s.movements.some(m=>m.id===t.receiptMovementId&&m.requestId===r.id&&m.productId===res.productId&&m.delta>0),'التوزيع لا يطابق الاستلام المقبول');
   demand(['held','issued'].includes(res.status)&&!(distribution?!['ready','loaded','in_transit','arrived','delivering'].includes(distribution.status):['draft','review','closed'].includes(r.status)),'اختر حجزًا معتمدًا لم يُغلق');
   demand(distribution||['delivery','distribution','warehouse_transfer'].includes(r.requestType||'delivery'),'الشحنة الخارجية للبضاعة المصروفة من المخزن');
   demand(t.requestId===r.id&&t.lineId===res.lineId&&['delivery','allocation'].includes(t.taskType)&&(!res.taskId||res.taskId===t.id)&&(!t.reservationId||t.reservationId===res.id||res.taskId===t.id),'الحجز لا يخص مهمة التسليم');
   demand(t.status!=='completed'&&t.destinationKind!=='warehouse','اختر مهمة تسليم عميل مفتوحة');
   demand(!seen.has(res.id),'كرر الشحنة أو قسّم الحجز قبل إضافة نفس المصدر مرة أخرى');seen.add(res.id);
   const quantity=qty(input.quantity);demand(quantity<=availableForShipment(s,res,previous?.id),'الكمية تتجاوز العهدة المتاحة بعد التوزيعات والتسليمات');
   const proposed=round((proposedByTask.get(t.id)||0)+quantity);demand(proposed<=taskAvailable(s,t,previous?.id),'الكمية تتجاوز نصيب وجهة التسليم المعتمد');proposedByTask.set(t.id,proposed);
   const b=res.batchId?s.batches.find(b=>b.id===res.batchId):undefined;
   demand(!p.tracked||b?.productId===p.id,'بيانات الباتش غير مكتملة');demand(!p.expiry||!!b?.expiryDate,'صلاحية الباتش غير مسجلة');
   return {id:'',code:'',requestId:r.id,projectId:r.projectId,taskId:t.id,lineId:res.lineId,reservationId:res.id,...(distribution?{distributionPlanId:distribution.id,receiptMovementId:t.receiptMovementId}:{}),productId:p.id,productName:p.name,productCode:p.code,sku:p.sku||'',unitId:p.unitId,batchId:res.batchId||'',batchCode:b?.code||'',expiryDate:b?.expiryDate||'',warehouseId:res.warehouseId,executorId:res.executorId||s.assignments.find(x=>x.reservationId===res.id)?.executorId||t.executorId||'',customerId:t.customerId||r.customerId,origin:s.warehouses.find(w=>w.id===res.warehouseId)?.name||'',destination:t.addressSnapshot||t.destination||r.destination,governorate:t.governorate||r.governorate||null,quantity,handedQuantity:0,packageCount:packages(input.packageCount),packaging:optional(input.packaging)};
  });
  const historicProject=mode==='historical'?row(s,'projects',text(c.projectId)):undefined;
  const data={code:code(c.code),carrierId:carrier.id,carrierName:carrier.name,mode,status:mode==='historical'?'historical':'draft',driverName:optional(c.driverName),driverPhone:optional(c.driverPhone,80),vehicleType:optional(c.vehicleType),plateNumber:optional(c.plateNumber,40),plateLetters:optional(c.plateLetters,40),participantRole,participantName:optional(c.participantName),origin:optional(c.origin),destination:optional(c.destination),originAddress:optional(c.originAddress,1000),destinationAddress:optional(c.destinationAddress,1000),originGovernorate:normalizeGovernorate(c.originGovernorate),destinationGovernorate:normalizeGovernorate(c.destinationGovernorate),plannedLoadAt:date(c.plannedLoadAt),plannedDeliveryAt:date(c.plannedDeliveryAt),declaredValueMinor:money(c.declaredValue),currency:currency(c.currency),notes:optional(c.notes,2000),...context(lines),...(historicProject?{projectId:historicProject.id,projectIds:[historicProject.id]}:{})};
  demand(!s.handoffs.some(h=>h.type==='external_shipment'&&h.id!==previous?.id&&h.code.toLowerCase()===data.code.toLowerCase()),'رقم الشحنة مكرر','DUPLICATE',409);
  demand(!data.plannedLoadAt||!data.plannedDeliveryAt||Date.parse(data.plannedDeliveryAt)>=Date.parse(data.plannedLoadAt),'موعد التسليم يجب أن يلي التحميل');
  if(previous){s.handoffs=s.handoffs.filter(l=>!(l.type==='external_shipment_line'&&l.shipmentId===previous.id));Object.assign(previous,data);}
  const h=previous||add('handoffs',{type:'external_shipment',...data});
  for(const {id:unusedId,code:unusedCode,...l} of lines)add('handoffs',{type:'external_shipment_line',shipmentId:h.id,...l});
  add('handoffs',{type:'external_event',eventType:previous?'edited':'created',shipmentId:h.id,...context(lines),at:now,recordedBy:a.userId,recordedByName:a.name});
  return {id:h.id};
 }
 if(c.type==='external_invoice'){
  demand(Array.isArray(c.shipmentIds)&&c.shipmentIds.length>0&&c.shipmentIds.length<=100,'اختر الشحنات التي تغطيها الفاتورة');
  const ids=[...new Set(c.shipmentIds as string[])];demand(ids.length===c.shipmentIds.length,'الشحنة مكررة في الفاتورة');const shipments=ids.map(id=>shipment(s,id));
  demand(shipments.every(h=>h.status!=='cancelled'),'لا تُفوتر شحنة ملغاة');
  const invoiceType=text(c.invoiceType);demand(['goods','transport'].includes(invoiceType),'حدد هل الفاتورة للبضاعة أم للنقل');
  if(invoiceType==='transport')demand(new Set(shipments.map(h=>h.carrierId)).size===1,'فاتورة النقل تجمع شحنات الناقل نفسه فقط');
  const issuer=text(c.issuer),invoiceNumber=text(c.invoiceNumber,80),issueDate=date(c.issueDate,true),currencyCode=currency(c.currency);
  demand(!s.handoffs.some(h=>h.type==='external_invoice'&&h.invoiceType===invoiceType&&h.issuer.trim().toLocaleLowerCase()===issuer.toLocaleLowerCase()&&h.invoiceNumber.toLocaleLowerCase()===invoiceNumber.toLocaleLowerCase()),'الفاتورة مسجلة لهذه الجهة والنوع','DUPLICATE',409);
  if(invoiceType==='transport')demand(!s.handoffs.some(h=>h.type==='external_invoice'&&h.invoiceType==='transport'&&(h.shipmentIds||[]).some((id:string)=>ids.includes(id))),'إحدى الشحنات مرتبطة بالفعل بفاتورة نقل؛ لا تُفوتر مرتين','DUPLICATE',409);
  const doc=c.documentId?row(s,'documents',text(c.documentId)):undefined;const requestIds=[...new Set(shipments.flatMap(h=>h.requestIds||[]))];if(doc)demand(doc.objectKey&&requestIds.includes(doc.requestId),'المستند لا يخص طلبات الفاتورة');
  const ctx=Object.fromEntries(contextKeys.map(key=>[key,[...new Set(shipments.flatMap(h=>h[key]||[]))]]));
  return {id:add('handoffs',{type:'external_invoice',shipmentIds:ids,invoiceType,issuer,invoiceNumber,issueDate,currency:currencyCode,amountMinor:money(c.amount,true),documentId:doc?.id||'',...ctx,recordedBy:a.userId,recordedByName:a.name,at:now}).id};
 }
 const h=shipment(s,c.shipmentId);demand(h.status!=='cancelled','الشحنة ملغاة');
 const event=(eventType:string,l?:Row,values:Record<string,any>={})=>add('handoffs',{type:'external_event',eventType,shipmentId:h.id,...Object.fromEntries(contextKeys.map(k=>[k,h[k]||[]])),...(l?{shipmentLineId:l.id,requestId:l.requestId,taskId:l.taskId,reservationId:l.reservationId,productId:l.productId,batchId:l.batchId,warehouseId:l.warehouseId,executorId:l.executorId}:{}),at:now,recordedBy:a.userId,recordedByName:a.name,...values});
 if(c.type==='external_shipment_cancel'){
  demand(h.status==='draft'&&!s.handoffs.some(l=>l.type==='external_shipment_line'&&l.shipmentId===h.id&&l.handedQuantity),'يمكن إلغاء خطة لم تستلم عهدة فقط');
  demand(!s.handoffs.some(e=>e.shipmentId===h.id&&e.eventType==='warehouse_release'),'تأكيد المخزن محفوظ؛ يلزم تصحيح موثق قبل الإلغاء');
  demand(!s.handoffs.some(e=>e.type==='external_cost'&&e.shipmentId===h.id||e.type==='external_invoice'&&(e.shipmentIds||[]).includes(h.id)),'يوجد مستند مالي مرتبط؛ لا يُلغى سياقه دون تسوية موثقة');
  h.status='cancelled';h.cancelReason=text(c.reason,1000);h.cancelledAt=now;event('cancelled',undefined,{reason:h.cancelReason});return {id:h.id};
 }
 if(c.type==='external_document'){
  const doc=evidence(s,c,h);const documentType=text(c.documentType);demand(['waybill','goods_invoice','transport_invoice','other'].includes(documentType),'نوع المستند غير صحيح');
  demand(!s.handoffs.some(e=>e.type==='external_document'&&e.shipmentId===h.id&&e.documentId===doc!.id&&e.documentType===documentType),'المستند مربوط بالفعل بهذه الشحنة','DUPLICATE',409);
  return {id:add('handoffs',{type:'external_document',shipmentId:h.id,...Object.fromEntries(contextKeys.map(k=>[k,h[k]||[]])),documentId:doc!.id,documentType,number:optional(c.number,80),issuer:optional(c.issuer),issueDate:date(c.issueDate),recordedBy:a.userId,recordedByName:a.name,at:now}).id};
 }
 if(c.type==='external_cost'){
  demand(h.mode!=='historical','تكلفة السجل التاريخي لا تُرحّل كتكلفة تشغيل');const doc=evidence(s,c,h,undefined,false);
  return {id:add('handoffs',{type:'external_cost',shipmentId:h.id,...Object.fromEntries(contextKeys.map(k=>[k,h[k]||[]])),costType:text(c.costType),amountMinor:money(c.amount,true),currency:currency(c.currency),documentId:doc?.id||'',notes:optional(c.notes,1000),recordedBy:a.userId,recordedByName:a.name,at:now}).id};
 }
 demand(h.mode==='operational','السجل التاريخي لا ينشئ حركات أو عهدة');
 const l=shipmentLine(s,h,c.shipmentLineId),res=row(s,'reservations',l.reservationId),r=row(s,'requests',l.requestId),t=row(s,'tasks',l.taskId);
 const distribution=t.distributionPlanId?(r.distributionPlans||[]).find((plan:any)=>plan.id===t.distributionPlanId):undefined;
 const returningDelivered=c.type==='external_return'&&c.source==='delivered'||c.type==='external_return_accept'&&s.handoffs.some(e=>e.id===c.externalReturnId&&e.source==='delivered');
 demand((distribution?distribution.status!=='completed'&&distribution.status!=='cancelled':r.status!=='closed')||returningDelivered,'الطلب أو التوزيع مغلق');
 if(res.status==='held'&&['external_warehouse_release','external_handover'].includes(c.type)){
  const outward=['distribution','warehouse_transfer'].includes(r.requestType);
  demand(distribution?['ready','loaded','in_transit','arrived','delivering'].includes(distribution.status):outward?!!r.authorizationCode&&!!r.authorizedBy&&['reserved','in_transit','arrived','delivering'].includes(r.status):['documents_ready','ready','loaded','in_transit','arrived','delivering'].includes(r.status),'أكمل اعتماد التنفيذ والمستندات قبل تسليم المخزن للناقل');
  demand(!s.handoffs.some(e=>e.type==='loading_confirmation'&&e.reservationId===res.id&&e.status!=='posted'),'يوجد تأكيد تحميل داخلي أو فرق لم يُحسم؛ راجعه قبل التحويل لناقل خارجي');
  demand(!s.exceptions.some(e=>e.type==='loading_difference'&&e.reservationId===res.id&&!['resolved','rejected'].includes(e.status)),'يوجد فرق تحميل مفتوح لهذا الحجز');
 }
 const q=['external_warehouse_release','external_handover'].includes(c.type)?actualQuantity(c.quantity):qty(c.quantity),doc=evidence(s,c,h,l),m=externalLineMetrics(s,l);
 const common={shipmentId:h.id,shipmentLineId:l.id,externalCarrierId:h.carrierId,carrierId:h.carrierId,performerType:'carrier',executorId:'',sourceExecutorId:l.executorId,requestId:l.requestId,taskId:l.taskId,lineId:l.lineId,reservationId:l.reservationId,...(distribution?{distributionPlanId:distribution.id,receiptMovementId:l.receiptMovementId}:{}),productId:l.productId,batchId:l.batchId,warehouseId:l.warehouseId,documentId:doc!.id,quantity:q,recordedBy:a.userId,recordedByName:a.name};
 if(c.type==='external_warehouse_release'){
  demand(h.status==='draft'&&res.status==='held'&&m.handed===0,'تأكيد المخزن لكمية محجوزة لم يبدأ تسليمها');noOtherExecution(s,l,h);
  const earlier=s.handoffs.filter(e=>e.type==='external_event'&&e.shipmentLineId===l.id&&e.eventType==='warehouse_release');
  const reason=q!==l.quantity||earlier.length?text(c.reason,1000):optional(c.reason,1000);
  return {id:event('warehouse_release',l,{quantity:q,documentId:doc!.id,reason,supersedesId:earlier.at(-1)?.id||'',matchesPlanned:q===l.quantity}).id,pending:q!==l.quantity};
 }
 if(c.type==='external_handover'){
  const recipient=text(c.recipient);let senderName='';
  if(res.status==='held'){
   demand(a.function!=='representative','مسؤول الحركة يؤكد استلام الناقل المستقل');
   const confirmation=s.handoffs.filter(e=>e.type==='external_event'&&e.shipmentLineId===l.id&&e.eventType==='warehouse_release').at(-1);
   demand(confirmation&&confirmation.recordedBy!==a.userId,'يلزم تأكيد مستقل من المخزن قبل إثبات استلام الناقل');
   if(confirmation.quantity!==q||q!==l.quantity||q!==res.quantity){const difference=event('handover_difference',l,{quantity:q,warehouseQuantity:confirmation.quantity,plannedQuantity:l.quantity,documentId:doc!.id,recipient,reason:text(c.reason,1000),warehouseConfirmationId:confirmation.id});return {id:difference.id,pending:true,issued:0};}
   noOtherExecution(s,l,h);
   const p=row(s,'products',res.productId),b=s.batches.find(b=>b.id===res.batchId);
   if(p.expiry){const days=(Date.parse(b?.expiryDate+'T00:00:00Z')-Date.parse(now.slice(0,10)+'T00:00:00Z'))/86400000;demand(days>90||days>0&&s.approvals.some(ap=>(!ap.type||ap.type==='near_expiry')&&ap.requestId===r.id&&ap.lineId===res.lineId&&ap.batchId===res.batchId&&ap.quantity>=q&&ap.status==='approved'),'الدفعة منتهية أو تحتاج اعتماد قرب الصلاحية');}
   demand(balance(s,res.productId,res.warehouseId,res.batchId).onHand>=q,'المخزون الفعلي غير كافٍ');
   res.status='issued';res.executorId=res.executorId||l.executorId;res.externalShipmentId=h.id;
   add('movements',{...common,type:'issue',delta:-q,postedAt:now,reason:'صرف المخزن للناقل بعد تأكيد مستقل ومتطابق',warehousePerformedBy:confirmation.recordedBy,warehousePerformedByName:confirmation.recordedByName});senderName=confirmation.recordedByName;
  }else{demand(res.status==='issued','العهدة غير مصروفة');ownSender(a,l);senderName=a.function==='representative'?a.name:text(c.senderName);if(q===0||q>m.unhanded){const difference=event('handover_difference',l,{quantity:q,plannedQuantity:m.unhanded,documentId:doc!.id,recipient,senderName,reason:text(c.reason,1000)});return {id:difference.id,pending:true,issued:0};}noOtherExecution(s,l,h);}
  l.handedQuantity=round(m.handed+q);l.lastHandoverAt=now;
  const e=event('handover',l,{quantity:q,documentId:doc!.id,senderName,recipient,attestationSource:'internal_recorder_with_external_evidence',externalRecipientAccount:false});
  h.actualLoadAt=h.actualLoadAt||now;h.status='in_transit';if(distribution)distribution.status='in_transit';else if(['reserved','ready','documents_ready','assigned','authorized'].includes(r.status))r.status='in_transit';
  return {id:e.id,handed:q};
 }
 if(c.type==='external_deliver'){
  demand(q<=round(m.custody-m.pendingReturn),'الكمية تتجاوز العهدة الخارجية المتاحة بعد المرتجع المنتظر');
  demand(q<=taskAvailable(s,t,h.id),'الكمية تتجاوز المتبقي المعتمد لوجهة التسليم');
  const recipient=text(c.recipient);const delivered=add('deliveries',{...common,recipient,destinationKind:'customer',customerId:l.customerId,addressSnapshot:l.destination,destinationSnapshot:l.destination,governorate:l.governorate,deliveredAt:now,carrierDeliveredAt:now,externalRecipientAccount:false,attestationSource:'internal_recorder_with_external_evidence',visitId:crypto.randomUUID(),deliveryEventId:crypto.randomUUID()});
  event('delivery',l,{quantity:q,documentId:doc!.id,recipient,deliveryId:delivered.id});refresh(s,h,now);return {id:delivered.id,delivered:q};
 }
 if(c.type==='external_return'){
  const source=c.source==='delivered'?'delivered':'custody',warehouse=row(s,'warehouses',text(c.warehouseId)),reason=text(c.reason,1000);let originalDeliveryId='';
  if(source==='delivered'){
   const d=row(s,'deliveries',text(c.originalDeliveryId));demand(d.shipmentLineId===l.id,'واقعة التسليم لا تخص بند الشحنة');const planned=sum(s.handoffs.filter(e=>e.type==='external_event'&&e.eventType==='return_presented'&&e.originalDeliveryId===d.id));demand(q<=round(d.quantity-planned),'المرتجع يتجاوز الكمية المسلمة في الواقعة');originalDeliveryId=d.id;
  }else demand(q<=round(m.custody-m.pendingReturn),'المرتجع يتجاوز العهدة الخارجية غير المخصصة للرجوع');
  const e=event('return_presented',l,{quantity:q,documentId:doc!.id,source,warehouseId:warehouse.id,originalDeliveryId,reason});refresh(s,h,now);return {id:e.id,presented:q};
 }
 if(c.type==='external_return_accept'){
  const presented=row(s,'handoffs',text(c.externalReturnId));demand(presented.type==='external_event'&&presented.eventType==='return_presented'&&presented.shipmentLineId===l.id&&presented.shipmentId===h.id,'اختر مرتجعًا مقدمًا لهذا البند');
  demand(q<=round(presented.quantity-sum(s.returns.filter(x=>x.externalReturnId===presented.id))),'الكمية تتجاوز المرتجع المنتظر قبول المخزن');
  const warehouse=row(s,'warehouses',presented.warehouseId);demand(a.warehouseIds==null||a.warehouseIds.includes(warehouse.id),'مخزن الرجوع خارج نطاق الحساب','FORBIDDEN',403);const recipient=text(c.recipient);
  const ret=add('returns',{...common,warehouseId:warehouse.id,sourceTaskId:l.taskId,source:presented.source,externalReturnId:presented.id,originalDeliveryId:presented.originalDeliveryId||'',reason:presented.reason,recipient,receivedAt:now});
  add('movements',{...common,type:'return',warehouseId:warehouse.id,externalReturnId:presented.id,sourceTaskId:l.taskId,delta:q,postedAt:now,recipient,reason:presented.reason});
  event('return_accepted',l,{quantity:q,documentId:doc!.id,externalReturnId:presented.id,warehouseId:warehouse.id,source:presented.source,returnId:ret.id});refresh(s,h,now);return {id:ret.id,received:q};
 }
 return null;
}
