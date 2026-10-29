import {type State,type Row} from './model';
import {customerDeliveries} from './customer-report';
import {correctedRecord} from './request-evolution';
import {cairoDay,filterRequests,type Filters} from './insights';
import {deliveryMetadata,EGYPT_GOVERNORATES} from './delivery-metadata';

/** Codes are stored, labels are presentation only. Never geocode a free-text address. */
const englishGovernorates:Record<string,string>={'القاهرة':'Cairo','الجيزة':'Giza','الإسكندرية':'Alexandria','القليوبية':'Qalyubia','الشرقية':'Sharqia','الدقهلية':'Dakahlia','الغربية':'Gharbia','المنوفية':'Monufia','البحيرة':'Beheira','كفر الشيخ':'Kafr El Sheikh','دمياط':'Damietta','بورسعيد':'Port Said','الإسماعيلية':'Ismailia','السويس':'Suez','الفيوم':'Fayoum','بني سويف':'Beni Suef','المنيا':'Minya','أسيوط':'Asyut','سوهاج':'Sohag','قنا':'Qena','الأقصر':'Luxor','أسوان':'Aswan','البحر الأحمر':'Red Sea','الوادي الجديد':'New Valley','مطروح':'Matrouh','شمال سيناء':'North Sinai','جنوب سيناء':'South Sinai'};
export const GOVERNORATES=EGYPT_GOVERNORATES.map(([code,label])=>[code,label,englishGovernorates[label]||code] as const);
const govCodes=new Set<string>(GOVERNORATES.map(x=>x[0]));
export function governorateCode(value:unknown){return typeof value==='string'&&govCodes.has(value)?value:'unknown';}
export function governorateLabel(value:unknown,ar=true){const item=GOVERNORATES.find(x=>x[0]===value);return item?item[ar?1:2]:ar?'غير محدد':'Not recorded';}
export type GeoFilters=Partial<Filters>&{basis?:'period'|'cumulative';governorate?:string;customer?:string;product?:string;unit?:string;currency?:string};
export type GeoFact=Row&{eventType:'delivery'|'accepted_return'|'unlinked_return';requestId:string;customerId:string;productId:string;unitId:string;governorate:string;date:string;quantity:number;priceMinor:number|null;amountMinor:number|null;currency:string;sign:1|-1;sourceDeliveryId:string;priceStatus:string};
const n3=(n:number)=>Math.round(n*1000)/1000;
function date(value:unknown){if(typeof value!=='string'||!value)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'';}return Number.isFinite(Date.parse(value))?cairoDay(value):'';}
function unique(rows:Row[]){return [...new Map(rows.map(r=>[r.id,r])).values()];}
function amount(quantity:number,unitMinor:number|null){
 if(unitMinor===null||!Number.isFinite(quantity)||quantity<0)return null;
 const milli=Math.round(quantity*1000);if(!Number.isSafeInteger(milli))return null;
 const result=(BigInt(milli)*BigInt(unitMinor)+BigInt(500))/BigInt(1000);
 return result<=BigInt(Number.MAX_SAFE_INTEGER)?Number(result):null;
}
function context(s:State,event:Row){
 const task=s.tasks.find(t=>t.id===event.taskId),reservation=s.reservations.find(r=>r.id===event.reservationId),request=s.requests.find(r=>r.id===event.requestId);
 const line=s.lines.find(l=>l.id===(event.lineId||task?.lineId||reservation?.lineId));
 const need=s.delivery_needs.find(n=>n.id===(event.needId||task?.needId||reservation?.needId));
 const metadata=deliveryMetadata(s,event),priceMinor=metadata.priceMinor,product=s.products.find(p=>p.id===event.productId),customerId=event.customerId||need?.customerId||task?.customerId||request?.customerId||'';
 const governorate=governorateCode(metadata.governorate);
 const unitId=event.unitId||line?.unitId||product?.unitId||'';
 const unit=s.units.find(u=>u.id===unitId)?.name||'';
 return {task,reservation,request,line,need,priceMinor,currency:String(metadata.currency||'EGP'),product,customerId,governorate,unitId,unit,free:metadata.free};
}

/** Immutable fact projection; current product/site masters never supply historical price/province. */
export function createGeoFacts(s:State):GeoFact[]{
 const deliveries=unique(customerDeliveries(s).filter(d=>d.eventType==='delivery'));
 const mapped=new Map<string,GeoFact>();
 const facts:GeoFact[]=deliveries.map(d=>{
  const c=context(s,d),eventDate=date(d.deliveredAt||d.createdAt),quantity=Number(d.delivered??d.quantity),priceMinor=c.priceMinor;
  const fact:GeoFact={...d,id:'delivery:'+d.id,code:d.code||d.id,eventType:'delivery',requestId:d.requestId,projectId:c.request?.projectId||'',project:s.projects.find(p=>p.id===c.request?.projectId)?.name||'',customerId:c.customerId,customer:s.customers.find(x=>x.id===c.customerId)?.name||'',productId:d.productId,product:c.product?.code||'',productName:c.product?.name||'',unitId:c.unitId,unit:c.unit,governorate:c.governorate,governorateLabel:governorateLabel(c.governorate),address:d.site||d.addressSnapshot||'',warehouseId:d.warehouseId||c.reservation?.warehouseId||'',date:eventDate,quantity,priceMinor,unitPrice:priceMinor===null?null:priceMinor/100,amountMinor:amount(quantity,priceMinor),currency:c.currency,sign:1,sourceDeliveryId:d.id,sourceEventId:d.id,priceStatus:priceMinor===null?'missing':'recorded',originalDeliveryDate:eventDate,recipient:d.recipient||''};
  mapped.set(d.id,fact);return fact;
 });
 for(const raw of unique(s.returns)){
  const accepted=correctedRecord(s,'returns',raw),plan=s.handoffs.find(h=>h.id===accepted.returnPlanId),request=s.requests.find(r=>r.id===accepted.requestId);
  if((accepted.source||plan?.source)!=='delivered')continue; // Undelivered courier custody is not a customer return.
  const originalId=accepted.originalDeliveryId||plan?.originalDeliveryId||'',original=mapped.get(originalId),product=s.products.find(p=>p.id===accepted.productId),task=s.tasks.find(t=>t.id===accepted.sourceTaskId||t.id===plan?.sourceTaskId),customerId=original?.customerId||task?.customerId||request?.customerId||'',quantity=Number(accepted.quantity),unitId=original?.unitId||accepted.unitId||product?.unitId||'';
  facts.push({...accepted,id:'return:'+accepted.id,code:accepted.code||accepted.id,eventType:original?'accepted_return':'unlinked_return',requestId:original?.requestId||accepted.requestId,request:original?.request||request?.code||'',projectId:original?.projectId||request?.projectId||'',project:original?.project||s.projects.find(p=>p.id===request?.projectId)?.name||'',customerId,customer:s.customers.find(c=>c.id===customerId)?.name||'',productId:original?.productId||accepted.productId,product:original?.product||product?.code||'',productName:original?.productName||product?.name||'',unitId,unit:original?.unit||s.units.find(u=>u.id===unitId)?.name||'',governorate:original?.governorate||'unknown',governorateLabel:governorateLabel(original?.governorate),address:original?.address||task?.addressSnapshot||task?.destination||'',date:date(accepted.receivedAt||accepted.createdAt),quantity,priceMinor:original?.priceMinor??null,unitPrice:original?.unitPrice??null,amountMinor:original?amount(quantity,original.priceMinor):null,currency:original?.currency||'EGP',sign:-1,sourceDeliveryId:original?.sourceDeliveryId||'',sourceEventId:accepted.id,priceStatus:original?(original.priceMinor===null?'missing':'recorded'):'unlinked',originalDeliveryDate:original?.date||'',recipient:accepted.recipient||'',batch:original?.batch||s.batches.find(b=>b.id===accepted.batchId)?.code||'',expiryDate:original?.expiryDate||s.batches.find(b=>b.id===accepted.batchId)?.expiryDate||'',warehouseId:original?.warehouseId||accepted.warehouseId||'',returnWarehouseId:accepted.warehouseId||''});
 }
 // Independent customer-return receipts have no proven original delivery price.
 for(const raw of unique(s.deliveries.filter(d=>d.destinationKind==='warehouse'&&!!d.collectionId))){
  const accepted=correctedRecord(s,'deliveries',raw),request=s.requests.find(r=>r.id===accepted.requestId),collection=s.handoffs.find(h=>h.id===accepted.collectionId);
  if(request?.requestType!=='customer_return')continue;
  const product=s.products.find(p=>p.id===(accepted.productId||collection?.productId)),unitId=accepted.unitId||product?.unitId||'',customerId=request.customerId||'';
  facts.push({...accepted,id:'independent-return:'+accepted.id,code:accepted.code||accepted.id,eventType:'unlinked_return',requestId:request.id,request:request.code,projectId:request.projectId||'',project:s.projects.find(p=>p.id===request.projectId)?.name||'',customerId,customer:s.customers.find(c=>c.id===customerId)?.name||'',productId:product?.id||'',product:product?.code||'',productName:product?.name||'',unitId,unit:s.units.find(u=>u.id===unitId)?.name||'',governorate:'unknown',governorateLabel:governorateLabel('unknown'),address:request.sourceAddress||'',date:date(accepted.createdAt),quantity:Number(accepted.quantity),priceMinor:null,amountMinor:null,currency:'EGP',sign:-1,sourceDeliveryId:'',sourceEventId:accepted.id,priceStatus:'unlinked',warehouseId:accepted.warehouseId||'',recipient:accepted.recipient||''});
 }
 return facts;
}
export type GeoTotals={deliveryCount:number;acceptedReturnCount:number;pricedDeliveryCount:number;pricedReturnCount:number;grossMinor:number|null;acceptedMinor:number|null;netMinor:number|null;missingPriceCount:number;unlinkedReturnCount:number;partial:boolean;quantities:{unitId:string;unit:string;delivered:number;accepted:number;net:number}[];currencyTotals:{currency:string;grossMinor:number|null;acceptedMinor:number|null;netMinor:number|null;partial:boolean}[]};
function total(facts:GeoFact[]):GeoTotals{
 const delivered=facts.filter(f=>f.eventType==='delivery'),accepted=facts.filter(f=>f.eventType!=='delivery'),pricedDelivery=delivered.filter(f=>f.amountMinor!==null),pricedReturns=accepted.filter(f=>f.amountMinor!==null),known=[...pricedDelivery,...pricedReturns],units=new Map<string,GeoTotals['quantities'][number]>(),currencies=new Map<string,GeoFact[]>();
 for(const f of facts){const unit=units.get(f.unitId)||{unitId:f.unitId,unit:f.unit||'غير متاح',delivered:0,accepted:0,net:0};if(f.eventType==='delivery')unit.delivered=n3(unit.delivered+f.quantity);else unit.accepted=n3(unit.accepted+f.quantity);unit.net=n3(unit.delivered-unit.accepted);units.set(f.unitId,unit);currencies.set(f.currency,[...(currencies.get(f.currency)||[]),f]);}
 const money=(rows:GeoFact[])=>rows.length&&!rows.some(r=>r.amountMinor!==null)?null:rows.reduce((n,r)=>n+(r.amountMinor??0),0);
 const currencyTotals=[...currencies].map(([currency,rows])=>{const ds=rows.filter(f=>f.eventType==='delivery'),rs=rows.filter(f=>f.eventType!=='delivery'),grossMinor=money(ds),acceptedMinor=money(rs);return {currency,grossMinor,acceptedMinor,netMinor:rows.length&&!rows.some(r=>r.amountMinor!==null)?null:(grossMinor??0)-(acceptedMinor??0),partial:rows.some(r=>r.amountMinor===null)};});
 const single=currencyTotals.length<=1;
 return {deliveryCount:delivered.length,acceptedReturnCount:accepted.length,pricedDeliveryCount:pricedDelivery.length,pricedReturnCount:pricedReturns.length,grossMinor:single?money(delivered):null,acceptedMinor:single?money(accepted):null,netMinor:single?facts.length&&!known.length?null:known.reduce((n,f)=>n+f.sign*(f.amountMinor??0),0):null,missingPriceCount:facts.filter(f=>f.amountMinor===null).length,unlinkedReturnCount:accepted.filter(f=>!f.sourceDeliveryId).length,partial:facts.some(f=>f.amountMinor===null),quantities:[...units.values()],currencyTotals};
}

export function geoValueReport(s:State,input:GeoFilters={}){
 const filters={project:'all',warehouse:'all',query:'',from:'',to:'',queue:'all',basis:'period',governorate:'all',customer:'all',product:'all',unit:'all',currency:'all',...input} as Required<GeoFilters>;
 for(const d of [filters.from,filters.to])if(d&&!date(d))throw new Error('حدد تاريخًا صحيحًا / Invalid report date');
 if(filters.from&&filters.to&&filters.from>filters.to)throw new Error('البداية بعد النهاية / Invalid report date range');
 if(!['period','cumulative'].includes(filters.basis))throw new Error('طريقة فترة غير صحيحة / Invalid period basis');
 const requestIds=new Set(filterRequests(s,{...filters,from:'',to:''}).map(r=>r.id));
 const scope=(f:GeoFact)=>(requestIds.has(f.requestId))&&(filters.warehouse==='all'||f.warehouseId===filters.warehouse)&&(filters.governorate==='all'||f.governorate===filters.governorate)&&(filters.customer==='all'||f.customerId===filters.customer)&&(filters.product==='all'||f.productId===filters.product)&&(filters.unit==='all'||f.unitId===filters.unit)&&(filters.currency==='all'||f.currency===filters.currency);
 const scoped=createGeoFacts(s).filter(scope),inPeriod=(day:string)=>!!day&&(!filters.to||day<=filters.to)&&(filters.basis==='cumulative'||!filters.from||day>=filters.from);
 const undatedFacts=scoped.filter(f=>!f.date).length,rows=scoped.filter(f=>inPeriod(f.date)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const group=(key:'governorate'|'customerId')=>[...new Set(rows.map(f=>f[key]))].map(id=>{const facts=rows.filter(f=>f[key]===id);return {id,key:id,label:key==='governorate'?governorateLabel(id):s.customers.find(c=>c.id===id)?.name||'غير مسجل',requestCount:new Set(facts.map(f=>f.requestId)).size,...total(facts),facts};}).sort((a,b)=>(b.netMinor??-Infinity)-(a.netMinor??-Infinity)||a.label.localeCompare(b.label));
 const asOfRows=scoped.filter(f=>!!f.date&&(!filters.to||f.date<=filters.to));
 return {filters,rows,...total(rows),groups:group('governorate'),customers:group('customerId'),unknownGovernorateFacts:rows.filter(f=>f.governorate==='unknown').length,undatedFacts,distinctRequests:new Set(rows.map(f=>f.requestId)).size,asOf:total(asOfRows),source:'server-scoped-operational-events',countingBasis:'delivery-date-and-warehouse-return-acceptance-date'};
}

/** Additive financial columns for one delivery, with returns accepted by the chosen end date. */
export function geoDeliveryFields(s:State,deliveryId:string,to='',facts=createGeoFacts(s)){
 const original=facts.find(f=>f.eventType==='delivery'&&f.sourceDeliveryId===deliveryId);
 if(!original)return {governorate:'unknown',governorateLabel:governorateLabel('unknown'),unitPrice:null,currency:null,deliveredValue:null,acceptedReturnValue:null,netValue:null,valueCompleteness:'غير متاح'};
 const returns=facts.filter(f=>f.eventType==='accepted_return'&&f.sourceDeliveryId===deliveryId&&(!to||!!f.date&&f.date<=to));
 const ambiguous=facts.some(f=>f.eventType==='unlinked_return'&&f.requestId===original.requestId&&f.productId===original.productId&&(!to||!!f.date&&f.date<=to));
 const gross=original.amountMinor,returned=ambiguous?null:returns.length&&returns.some(f=>f.amountMinor===null)?null:returns.reduce((n,f)=>n+(f.amountMinor??0),0);
 return {project:original.project,governorate:original.governorate,governorateLabel:original.governorateLabel,address:original.address,unitPrice:original.unitPrice,currency:original.currency,deliveredValue:gross===null?null:gross/100,acceptedReturnValue:returned===null?null:returned/100,netValue:gross===null||returned===null?null:(gross-returned)/100,valueCompleteness:gross===null||returned===null?'غير مكتمل':'مسعّر'};
}
