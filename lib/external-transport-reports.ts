import {type State,type Row} from './model';
import {filterRequests,type Filters,cairoDay} from './insights';
import {externalLineMetrics} from './external-transport';
import {governorateLabel} from './geo-value-report';

export const externalReportKinds=['external_shipments','external_custody','external_carrier_performance','external_invoice_coverage','external_followup'] as const;
export type ExternalReportKind=typeof externalReportKinds[number];
const unavailable='غير متاح';
const validTime=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const day=(v:unknown)=>validTime(v)?cairoDay(v as string):'';
const inPeriod=(v:unknown,f:Filters)=>{const d=day(v);return !(f.from||f.to)||!!d&&(!f.from||d>=f.from)&&(!f.to||d<=f.to);};
const knownAmount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v/100:null;

/** Read-only projections. The input must already be scopedState(); report filters never grant access.
 * A project selection may select only part of a combined shipment/invoice. Its unallocated
 * declared value/invoice total is then unknown, rather than repeated against each project.
 * Custody is the current balance of the selected shipment cohort, not a historical reconstruction.
 */
export function externalTransportRows(s:State,kind:ExternalReportKind,f:Filters,now=Date.now()):Row[]{
 const name=(k:keyof State,id:string)=>s[k].find(r=>r.id===id)?.name||'',code=(k:keyof State,id:string)=>s[k].find(r=>r.id===id)?.code||'';
 const allHeaders=s.handoffs.filter(h=>h.type==='external_shipment');
 const eligibleRequests=new Set(filterRequests(s,{...f,query:'',from:'',to:''},now).map(r=>r.id));
 const allLines=(h:Row)=>s.handoffs.filter(l=>l.type==='external_shipment_line'&&l.shipmentId===h.id&&l.status!=='superseded');
 const selectedLines=(h:Row)=>allLines(h).filter(l=>eligibleRequests.has(l.requestId)&&(f.warehouse==='all'||l.warehouseId===f.warehouse));
 // Historical records have no operational request links; their own optional project must match.
 const headerSelected=(h:Row)=>h.mode==='historical'?(f.warehouse==='all'&&(!f.queue||f.queue==='all')&&(f.project==='all'||h.projectId===f.project)):selectedLines(h).length>0;
 const period=(h:Row)=>({at:h.actualLoadAt||h.plannedLoadAt||h.createdAt,basis:h.actualLoadAt?'تحميل فعلي':h.plannedLoadAt?'تحميل مخطط':'إنشاء السجل'});
 const headers=allHeaders.filter(h=>headerSelected(h)&&inPeriod(period(h).at,f));
 const codes=(ids:string[],k:keyof State)=>[...new Set(ids)].map(id=>code(k,id)).filter(Boolean).join(' / ');
 const contextual=(h:Row)=>{const lines=selectedLines(h),full=h.mode==='historical'||lines.length===allLines(h).length;return {lines,full,requestIds:[...new Set(lines.map(l=>String(l.requestId)))],projectIds:h.mode==='historical'?(h.projectIds||[h.projectId]).filter(Boolean):[...new Set(lines.map(l=>String(l.projectId||s.requests.find(r=>r.id===l.requestId)?.projectId||'')))].filter(Boolean)};};
 const invoices=s.handoffs.filter(h=>h.type==='external_invoice');
 const documents=s.handoffs.filter(h=>h.type==='external_document');
 const waybill=(h:Row)=>h.waybillNumber||documents.filter(d=>d.shipmentId===h.id&&['waybill','shipping'].includes(d.documentType)).map(d=>d.number||d.reference||s.documents.find(file=>file.id===d.documentId)?.name).filter(Boolean).join(' / ')||'';
 const common=(h:Row)=>{const ctx=contextual(h);return {id:h.id,code:h.code,shipmentId:h.id,carrierId:h.carrierId,carrier:h.carrierName||name('carriers',h.carrierId),status:h.status,mode:h.mode,requestCodes:codes(ctx.requestIds,'requests'),requestIds:ctx.requestIds,project:ctx.projectIds.map((id:string)=>name('projects',id)).join(' / '),origin:h.origin||h.originAddress||'',destination:h.destination||h.destinationAddress||'',originGovernorate:governorateLabel(h.originGovernorate),destinationGovernorate:governorateLabel(h.destinationGovernorate),driver:h.driverName||'',vehicle:[h.vehicleType,h.plateNumber,h.plateLetters].filter(Boolean).join(' · '),plannedLoadAt:h.plannedLoadAt||null,actualLoadAt:h.actualLoadAt||null,plannedDeliveryAt:h.plannedDeliveryAt||null,actualDeliveryAt:h.actualDeliveryAt||null,waybill:waybill(h),periodBasis:period(h).basis};};
 let rows:Row[]=[];
 if(kind==='external_shipments')rows=headers.map(h=>{
  const {full}=contextual(h),costs=s.handoffs.filter(c=>c.type==='external_cost'&&c.shipmentId===h.id),currencies=[...new Set(costs.map(c=>c.currency).filter(Boolean))];
  return {...common(h),declaredValue:full?knownAmount(h.declaredValueMinor):null,currency:h.currency||null,freightCost:full&&costs.length&&currencies.length===1&&costs.every(c=>knownAmount(c.amountMinor)!==null)?costs.reduce((n,c)=>n+c.amountMinor,0)/100:null,freightCurrency:currencies.length===1?currencies[0]:currencies.join(' / ')||null,freightDetail:costs.map(c=>`${c.costType||''}: ${knownAmount(c.amountMinor)??unavailable} ${c.currency||''}`).join(' | '),valueScope:full?'قيمة الشحنة كاملة؛ ليست أجرة النقل':'جزء محدد من شحنة مجمعة؛ القيمة غير موزعة',scopeFull:full};
 });
 if(kind==='external_custody')rows=headers.filter(h=>h.mode!=='historical'&&h.status!=='cancelled').flatMap(h=>selectedLines(h).map(l=>({id:l.id,code:l.code,shipment:h.code,shipmentId:h.id,carrier:h.carrierName||name('carriers',h.carrierId),carrierId:h.carrierId,request:code('requests',l.requestId),requestId:l.requestId,project:name('projects',l.projectId||s.requests.find(r=>r.id===l.requestId)?.projectId),customer:name('customers',l.customerId),product:l.productCode||code('products',l.productId),productName:l.productName||name('products',l.productId),sku:l.sku||s.products.find(p=>p.id===l.productId)?.sku||'',batch:l.batchCode||code('batches',l.batchId),expiryDate:l.expiryDate||s.batches.find(b=>b.id===l.batchId)?.expiryDate||null,unit:name('units',l.unitId||s.products.find(p=>p.id===l.productId)?.unitId),warehouse:name('warehouses',l.warehouseId),destination:l.destination||h.destinationAddress||h.destination||'',...externalLineMetrics(s,l),balanceScope:'الرصيد الحالي للشحنات المختارة؛ لا يمثل رصيدًا تاريخيًا'})));
 if(kind==='external_carrier_performance'){
  const groups=new Map<string,Row[]>();for(const h of headers){const key=h.carrierId||h.carrierName||h.id;groups.set(key,[...(groups.get(key)||[]),h]);}
  rows=[...groups].map(([id,hs])=>{
   const ops=hs.filter(h=>h.mode!=='historical'&&h.status!=='cancelled'),complete=ops.filter(h=>h.status==='delivered'),timed=complete.filter(h=>validTime(h.actualDeliveryAt)&&validTime(h.plannedDeliveryAt)),onTime=timed.filter(h=>Date.parse(h.actualDeliveryAt)<=Date.parse(h.plannedDeliveryAt));
   return {id,code:code('carriers',id)||hs[0].carrierName||id,carrierId:id,carrier:hs[0].carrierName||name('carriers',id),shipmentCount:hs.length,operationalCount:ops.length,historicalCount:hs.filter(h=>h.mode==='historical').length,cancelledShipments:hs.filter(h=>h.status==='cancelled').length,deliveredShipments:complete.length,returnedShipments:ops.filter(h=>h.status==='returned').length,partiallySettledShipments:ops.filter(h=>h.status==='completed').length,inTransitShipments:ops.filter(h=>h.status==='in_transit').length,timingKnown:timed.length,onTimeShipments:onTime.length,onTimePercent:timed.length?Math.round(onTime.length/timed.length*10000)/100:null,unknownTiming:complete.length-timed.length,openCustodyLines:ops.flatMap(selectedLines).filter(l=>externalLineMetrics(s,l).custody>0||externalLineMetrics(s,l).pendingReturn>0).length,missingWaybill:ops.filter(h=>!waybill(h)).length,timingBasis:'المسلّم بالكامل ذو موعد مطلوب ووقت تسليم فعلي فقط؛ غير المسجل لا يعد التزامًا أو تأخيرًا'};
  });
 }
 if(kind==='external_invoice_coverage'){
  const selectedIds=new Set(allHeaders.filter(headerSelected).map(h=>h.id));
  rows=invoices.filter(inv=>(inv.shipmentIds||[]).some((id:string)=>selectedIds.has(id))&&inPeriod(inv.issueDate,f)).map(inv=>{
   const covered=(inv.shipmentIds||[]).filter((id:string)=>selectedIds.has(id)),full=covered.length===(inv.shipmentIds||[]).length&&covered.every((id:string)=>{const h=allHeaders.find(h=>h.id===id);return !!h&&contextual(h).full;}),proof=s.documents.find(d=>d.id===inv.documentId);
   return {id:inv.id,code:inv.code,invoiceType:inv.invoiceType==='transport'?'نقل':inv.invoiceType==='goods'?'بضاعة':inv.invoiceType,issuer:inv.issuer,invoiceNumber:inv.invoiceNumber,issueDate:inv.issueDate,shipmentCodes:covered.map((id:string)=>allHeaders.find(h=>h.id===id)?.code).filter(Boolean).join(' / '),shipmentIds:covered,carrier:[...new Set(covered.map((id:string)=>{const h=allHeaders.find(h=>h.id===id);return h&&(h.carrierName||name('carriers',h.carrierId));}).filter(Boolean))].join(' / '),amount:full?knownAmount(inv.amountMinor):null,currency:inv.currency||null,coverageCount:covered.length,coverageScope:full?'كل الشحنات المغطاة':'تغطية جزئية ضمن الفلتر؛ مبلغ الفاتورة غير موزع',proof:proof?.name||'',documentId:proof?.id||'',periodBasis:'تاريخ إصدار الفاتورة'};
  });
 }
 if(kind==='external_followup'){
  for(const h of headers.filter(h=>h.mode!=='historical'&&h.status!=='cancelled')){
   const base=common(h),ctx=contextual(h),add=(issue:string,nextAction:string,owner:string,extra:Record<string,any>={})=>rows.push({...base,id:`${h.id}:${extra.id||issue}`,code:h.code,shipment:h.code,issue,owner,nextAction,dueAt:h.plannedDeliveryAt||null,ageDays:validTime(h.actualLoadAt)?Math.max(0,Math.floor((now-Date.parse(h.actualLoadAt))/86400000)):null,quantity:null,unit:null,...extra});
   if(!waybill(h))add('سند الشحن غير مسجل','استكمال سند الشحن','مدير الحركة');
   if(!['delivered','returned','completed'].includes(h.status)&&validTime(h.plannedDeliveryAt)&&Date.parse(h.plannedDeliveryAt)<now)add('تجاوز موعد التسليم المطلوب','متابعة الناقل وتسجيل النتيجة الفعلية','مدير الحركة');
   for(const l of ctx.lines){const m=externalLineMetrics(s,l),unit=name('units',l.unitId||s.products.find(p=>p.id===l.productId)?.unitId);if(m.custody>0)add('عهدة مفتوحة لدى الناقل','متابعة تسليم العميل أو تقديم المرتجع','مدير الحركة',{id:l.id+':custody',requestId:l.requestId,quantity:m.custody,unit});if(m.pendingReturn>0)add('مرتجع بانتظار قبول المخزن','تسجيل الكمية التي قبلها المخزن','أمين المخزن',{id:l.id+':return',requestId:l.requestId,quantity:m.pendingReturn,unit});
    const events=s.handoffs.filter(e=>e.type==='external_event'&&e.shipmentLineId===l.id),latestWarehouse=events.filter(e=>e.eventType==='warehouse_release').at(-1),lastHandover=events.map(e=>e.eventType).lastIndexOf('handover'),lastDifference=events.map(e=>e.eventType).lastIndexOf('handover_difference');
    if(latestWarehouse&&m.handed===0&&latestWarehouse.quantity!==l.quantity)add('اختلاف كمية تأكيد المخزن','مراجعة الكمية والخطة دون صرف المخزون','أمين المخزن',{id:l.id+':warehouse-difference',requestId:l.requestId,quantity:latestWarehouse.quantity,unit});
    if(lastDifference>lastHandover){const diff=events[lastDifference];add('اختلاف كمية استلام الناقل','مراجعة الإثبات والكمية مع المخزن أو المُسلّم','مدير الحركة',{id:l.id+':handover-difference',requestId:l.requestId,quantity:diff.quantity,unit});}
   }
   const missingProof=s.handoffs.filter(e=>e.type==='external_event'&&e.shipmentId===h.id&&e.eventType==='delivery'&&!e.documentId);if(missingProof.length)add('إثبات تسليم غير مسجل','ربط إثبات بواقعة التسليم','مدير الحركة');
  }
 }
 const query=f.query.toLocaleLowerCase();
 return rows.filter(r=>!query||JSON.stringify(r).toLocaleLowerCase().includes(query));
}
