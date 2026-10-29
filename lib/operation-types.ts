import {actualSources,actualAvailable} from './actual-quantities';
import {type Row,type State} from './model';
export const operationTypes=[
 ['delivery','تسليم لعملاء — عنوان أو عدة عناوين','Customer delivery'],
 ['purchase_receipt','استلام مشتريات بالمخزن مباشرة','Direct purchase receipt'],
 ['warehouse_transfer','تحويل بين المخازن','Warehouse transfer'],
 ['distribution','توزيع على مخازن وعملاء','Multi-destination distribution'],
 ['receipt_order','أمر استلام من مورد بواسطة مندوب','Supplier collection order'],
 ['courier_receipt','أمر استلام من مندوب بواسطة مندوب','Courier-to-courier collection order'],
 ['customer_return','استلام مرتجع من عميل','Customer return collection'],
 ['documents','مهمة مستندية','Document task']
] as const;
export const extendedTypes=['warehouse_transfer','distribution','receipt_order','courier_receipt','customer_return','documents'];
export const extended=(r:Row)=>extendedTypes.includes(r.requestType);
export const inbound=(r:Row)=>['receipt_order','courier_receipt','customer_return'].includes(r.requestType);
export const outbound=(r:Row)=>['warehouse_transfer','distribution'].includes(r.requestType);
export const documentActions=[['collect','استلام مستند','Collect document'],['deliver','تسليم مستند','Deliver document'],['sign','توقيع / اعتماد مستند','Get document signed'],['return','إرجاع أصل المستند','Return original document']];
export const round=(n:number)=>Math.round(n*1000)/1000;
export const collected=(s:State,lineId:string)=>round(s.handoffs.filter(h=>h.type==='external_collection'&&h.lineId===lineId).reduce((n,h)=>n+h.quantity,0));
export const fulfilled=(s:State,t:Row)=>round(s.deliveries.filter(d=>d.taskId===t.id).reduce((n,d)=>n+d.quantity,0));
export function nextOperationTask(s:State,r:Row){
 const tasks=s.tasks.filter(t=>t.requestId===r.id&&t.taskType!=='return'&&t.status!=='completed').sort((a,b)=>(a.sequence||0)-(b.sequence||0));
 return tasks.find(t=>t.taskType==='paperwork'||actualSources(s,r,t).some(x=>actualAvailable(s,x)>0)||round(s.handoffs.filter(h=>h.type==='warehouse_present'&&h.taskId===t.id).reduce((n,h)=>n+h.quantity-(h.rejectedQuantity||0),0)-fulfilled(s,t))>0)||tasks[0];
}
export function operationNext(s:State,r:Row):{action:string;ar:string;en:string;blocked?:string}{
 const doc=r.requestType==='documents';
 const tasks=s.tasks.filter(t=>t.requestId===r.id);
 if(r.status==='draft')return {action:'submit',ar:'إرسال للمراجعة',en:'Submit for review'};
 if(r.status==='review')return {action:'approve',ar:'اعتماد العمليات',en:'Operations approval'};
 if(r.status==='approved'){
  const planned=doc?tasks.length>0:s.lines.filter(l=>l.requestId===r.id).every(l=>round(tasks.filter(t=>t.lineId===l.id).reduce((n,t)=>n+t.quantity,0))===l.quantity);
  if(!planned||tasks.some(t=>!t.executorId))return {action:'op_plan',ar:doc?'حدد المهمة والمكان والمسؤول':'وزّع الكميات واختر مسؤول كل وجهة',en:doc?'Choose document task and executor':'Allocate quantities and assign destinations'};
  return {action:'op_authorize',ar:inbound(r)?'إصدار أمر الاستلام':'اعتماد خطة التنفيذ',en:inbound(r)?'Issue receipt authorization':'Authorize execution plan'};
 }
 if(doc&&r.status==='authorized')return {action:'op_document',ar:'تسجيل تنفيذ المهمة — المرفق اختياري',en:'Complete document task — evidence optional'};
 if(outbound(r)&&r.status==='authorized')return {action:'op_reserve',ar:'حجز الكمية من مخزن المصدر',en:'Reserve source stock'};
 if(outbound(r)&&r.status==='reserved')return {action:'pickup_actual',ar:'سجّل الكمية التي استلمها المندوب فعليًا',en:'Record actual courier pickup'};

 if(r.status==='ready_to_close'&&s.exceptions.some(x=>x.requestId===r.id&&!x.resolved))return {action:'resolve_exception',ar:'معالجة المشكلة المسجلة قبل الإغلاق',en:'Resolve open exception'};
 if(r.status==='ready_to_close')return {action:'op_close',ar:'مراجعة النتائج وإغلاق الطلب',en:'Review results and close request'};
 if(r.status==='closed')return {action:'',ar:'مكتمل ومحفوظ',en:'Completed and saved'};
 const next=nextOperationTask(s,r);
 const held=next&&actualSources(s,r,next).some(x=>actualAvailable(s,x)>0),awaiting=next&&round(s.handoffs.filter(h=>h.type==='warehouse_present'&&h.taskId===next.id).reduce((n,h)=>n+h.quantity-(h.rejectedQuantity||0),0)-fulfilled(s,next))>0;
 if(next&&!held&&!awaiting){
  if(inbound(r)&&s.lines.filter(l=>l.requestId===r.id).some(l=>collected(s,l.id)<l.quantity))return {action:'op_collect',ar:'تسجيل استلام المندوب من المصدر',en:'Record courier collection'};
  if(outbound(r)&&s.reservations.some(x=>x.requestId===r.id&&x.status==='held'))return {action:'pickup_actual',ar:'تأكيد استلام الكمية المتبقية من المخزن',en:'Collect remaining reserved quantity'};
 }

 if(next?.destinationKind==='warehouse'&&next.status!=='completed'&&(!next.presentationRequired||round(s.handoffs.filter(h=>h.type==='warehouse_present'&&h.taskId===next.id).reduce((n,h)=>n+h.quantity-(h.rejectedQuantity||0),0)-fulfilled(s,next))<=0))return {action:'op_present',ar:'المندوب يسجل الكمية المقدمة للمخزن فعليًا',en:'Record actual warehouse drop-off'};
 if(next?.status==='planned')return {action:'op_arrive',ar:'تسجيل الوصول للوجهة التالية',en:'Record arrival at the next destination'};
 if(next)return {action:next.destinationKind==='warehouse'?'op_receive':'op_deliver',ar:next.destinationKind==='warehouse'?'تأكيد استلام مخزن الوجهة':'تسجيل تسليم العميل',en:next.destinationKind==='warehouse'?'Confirm destination warehouse receipt':'Record customer delivery'};
 return {action:'op_close',ar:'إغلاق الطلب',en:'Close request'};
}
export function operationFields(type:string){
 const common=['priority','code','projectId','dueDate','notes'];
 const specific:Record<string,string[]>={delivery:['customerId','destination'],purchase_receipt:['supplierName','purchaseReference','warehouseId'],warehouse_transfer:['sourceWarehouseId'],distribution:['sourceWarehouseId'],courier_receipt:['sourceExecutorId','sourceAddress'],receipt_order:['supplierName','purchaseReference','sourceAddress'],customer_return:['customerId','sourceAddress','referenceCode'],documents:['sourceAddress','destination','documentAction','documentDescription']};
 return [...common,...(specific[type]||specific.delivery)];
}
