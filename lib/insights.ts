import {nextLoadingStep} from './loading-confirmation';
import {returnAmount,taskDelivered} from './task-trace';
import {extended,operationNext} from './operation-types';
import { isReceipt, receiptNext } from './workflow';
import { type State, type Row, balance, flows } from './model';
export const cairoDay=(value:string|number=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export type Filters={project:string;warehouse:string;from:string;to:string;query:string;queue?:string};
export const queueNames = [
    ['quantity_review','زيادات وفروق الكميات','Quantity increases and differences'],
    ['receiving','بانتظار استلام بالمخزن','Warehouse receiving'],['review','بانتظار المراجعة','Awaiting review'],['dispatch','بانتظار التوزيع','Awaiting assignment'],
    ['ready','جاهز للخروج','Ready for dispatch'],['transit','قيد النقل','In transit'],
    ['overdue','متأخر','Overdue'],['pod','تسليمات بدون إثبات — اختياري','Deliveries without optional proof']
];
export function matchesQueue(s:State,r:Row,queue:string,now=Date.now()) {
    if(queue==='all'||!queue) return true;
    if(queue==='quantity_review')return s.approvals.some(ap=>ap.type==='quantity_increase'&&ap.requestId===r.id&&ap.status==='pending')||s.exceptions.some(ex=>ex.type==='loading_difference'&&ex.requestId===r.id&&!ex.resolved);
    if(queue==='receiving') return ['awaiting_receipt','partially_received','received'].includes(r.status);
    if(queue==='review') return r.status==='review';
    if(queue==='dispatch') return ['approved','reserved','awaiting_assignment'].includes(r.status);
    if(queue==='ready') return r.status==='ready';
    if(queue==='transit') return ['in_transit','arrived','delivering'].includes(r.status);
    if(queue==='overdue') return r.status!=='closed' && !!r.dueDate && r.dueDate<cairoDay(now);
    if(queue==='pod') return !extended(r)&&r.status!=='closed' && (s.tasks.some(t=>t.requestId===r.id)?s.tasks.some(t=>t.requestId===r.id&&t.taskType==='delivery'&&s.deliveries.some(d=>d.taskId===t.id)&&!s.pods.some(p=>p.taskId===t.id)):s.deliveries.some(d=>d.requestId===r.id)&&!s.pods.some(p=>p.requestId===r.id));
    return r.status===queue;
}
export function filterRequests(s:State,f:Filters,now=Date.now()) {
    const warehouseRequests = new Set([...s.reservations,...s.assignments,...s.tasks].filter(r=>r.warehouseId===f.warehouse||r.sourceWarehouseId===f.warehouse).map(r=>r.requestId));
    return s.requests.filter(r=>(f.project==='all'||r.projectId===f.project) && (f.warehouse==='all'||warehouseRequests.has(r.id)||r.warehouseId===f.warehouse||r.sourceWarehouseId===f.warehouse) && (!f.from||cairoDay(r.createdAt)>=f.from) && (!f.to||cairoDay(r.createdAt)<=f.to) && `${r.code} ${r.supplierName||''} ${r.purchaseReference||''} ${r.destination} ${s.customers.find(c=>c.id===r.customerId)?.name||''} ${s.tasks.filter(t=>t.requestId===r.id).map(t=>[t.destination,s.customers.find(c=>c.id===t.customerId)?.name,s.resources.find(e=>e.id===t.executorId)?.name].filter(Boolean).join(' ')).join(' ')}`.toLowerCase().includes(f.query.toLowerCase()) && matchesQueue(s,r,f.queue||'all',now));
}
export function stageMetrics(rows:Row[],now=Date.now()) {
    return [...flows,'awaiting_receipt','partially_received','received','authorized','collecting','ready_to_close'].map(status=>{
        const current=rows.filter(r=>r.status===status), entries=current.filter(r=>r.status!=='closed').map(r=>r.stageEnteredAt).filter(Boolean).map(d=>Date.parse(d)).filter(d=>Number.isFinite(d)&&d<=now);
        const durations:number[]=[];
        for(const r of rows){const t=r.timeline||[];for(let i=0;i<t.length-1;i++)if(t[i].to===status){const duration=(Date.parse(t[i+1].at)-Date.parse(t[i].at))/3600000;if(Number.isFinite(duration)&&duration>=0&&Date.parse(t[i+1].at)<=now)durations.push(duration);}}
        return {status,count:current.length,known:entries.length,age:entries.length?entries.reduce((n,d)=>n+(now-d)/3600000,0)/entries.length:null,oldest:entries.length?(now-Math.min(...entries))/3600000:null,completed:durations.length?durations.reduce((n,d)=>n+d,0)/durations.length:null};
    });
}
export function inventoryUnits(s:State,project:string,warehouse:string) {
    const result=new Map<string,{unit:string;onHand:number;reserved:number;available:number;transit:number}>();
    for(const p of s.products.filter(p=>project==='all'||p.projectId===project)) {
        const b=balance(s,p.id,warehouse==='all'?undefined:warehouse), u=s.units.find(u=>u.id===p.unitId)?.name||p.unitId;
        const item=result.get(p.unitId)||{unit:u,onHand:0,reserved:0,available:0,transit:0};
        for(const key of ['onHand','reserved','available','transit'] as const)item[key]+=b[key];result.set(p.unitId,item);
    }
    return [...result.values()];
}
export function nextAction(s:State,r:Row):{action:string;ar:string;en:string;blocked?:string} {
    const ret=s.tasks.find(t=>t.requestId===r.id&&t.taskType==='return'&&t.status!=='completed');if(ret?.status==='awaiting_destination')return {action:'return_destination',ar:'تحديد مخزن رجوع الكمية في عهدة المندوب',en:'Choose return warehouse'};if(ret){const accepted=s.returns.filter(x=>x.taskId===ret.id).reduce((n,x)=>n+x.quantity,0),needsDrop=ret.status==='planned'||(ret.presentedQuantity??ret.quantity)<=accepted;return {action:needsDrop?'return_arrive':'receive_return',ar:needsDrop?'تسجيل الكمية المقدمة إلى '+ret.destination:'تأكيد استلام المرتجع في '+ret.destination,en:'Complete return to '+ret.destination};}
    const loading=nextLoadingStep(s,r);if(loading)return {action:loading.action,ar:loading.ar,en:loading.en,blocked:loading.blocked};
    if(extended(r)) return operationNext(s,r);
    if(isReceipt(r)){if(!['draft','review','closed'].includes(r.status)&&!s.tasks.some(t=>t.requestId===r.id&&t.taskType==='warehouse_receipt'))return {action:'prepare_tasks',ar:'تجهيز مهام الاستلام وتكليف المسؤول',en:'Prepare and assign receipt tasks'};return receiptNext(r);}
    if(['loaded','in_transit','arrived','delivering','delivered'].includes(r.status)) {
        const pending=s.tasks.filter(t=>t.requestId===r.id&&t.status!=='completed'&&t.taskType!=='return');
        const prep=pending.find(t=>['pickup','documents'].includes(t.taskType));
        if(prep)return {action:'complete_task',ar:'تأكيد اكتمال مهمة '+(prep.taskType==='pickup'?'الاستلام':'المستندات'),en:'Confirm '+prep.taskType+' task completion'};
        const settled=pending.find(t=>t.taskType==='delivery'&&Math.abs(t.quantity-taskDelivered(s,t)-returnAmount(s,t))<0.0001);
        if(settled)return {action:'complete_task',ar:'تأكيد انتهاء المهمة — الكمية تمت تسويتها',en:'Confirm reconciled task completion'};
        const task=pending.filter(t=>!t.autoGenerated).find(t=>t.status==='arrived')||pending.find(t=>!t.autoGenerated);
        if(task){
            if(task.status==='planned')return {action:'depart',ar:'مغادرة رحلة الوجهة المتبقية',en:'Depart remaining destination route'};
            if(task.status==='in_transit')return {action:'arrive',ar:'الوصول للوجهة المتبقية',en:'Arrive at remaining destination'};
        }
        const held=s.reservations.find(x=>x.requestId===r.id&&x.status==='held');
        const free=s.reservations.filter(x=>x.requestId===r.id&&x.status==='issued').reduce((n,x)=>n+x.quantity-s.deliveries.filter(d=>d.reservationId===x.id).reduce((m,d)=>m+d.quantity,0)-s.returns.filter(d=>d.reservationId===x.id&&d.source==='custody').reduce((m,d)=>m+d.quantity,0),0);
        if(held&&free<=0.0001)return {action:'pickup_actual',ar:'تأكيد استلام الكمية المتبقية من المخزن',en:'Collect remaining reserved quantity'};
    }
    if(['arrived','delivering','delivered'].includes(r.status)) {
        const reason=closeReason(s,r);
        if(!reason)return {action:'close',ar:'إغلاق الطلب',en:'Close request'};
        if(reason.includes('POD'))return {action:'pod',ar:'رفع وتسجيل إثبات التسليم',en:'Upload and record POD',blocked:reason};
        if(reason.includes('exceptions'))return {action:'resolve_exception',ar:'معالجة الاستثناءات المفتوحة',en:'Resolve open exceptions',blocked:reason};
    }
    const actions:Record<string,[string,string,string]>={draft:['submit','إرسال للمراجعة','Submit for review'],review:['approve','اعتماد العمليات','Approve request'],approved:['reserve','حجز المخزون FEFO','Reserve stock'],reserved:['assign','إسناد الحجوزات المتبقية','Assign remaining reservations'],assigned:['verify_documents','اعتماد المستندات','Verify documents'],documents_ready:['create_route','تخطيط رحلة','Plan route'],ready:['pickup_actual','تأكيد الكمية المستلمة فعليًا','Confirm actual picked-up quantity'],loaded:['depart','تأكيد مغادرة الرحلة','Confirm departure'],in_transit:['arrive','تسجيل الوصول للمحطة','Record arrival'],arrived:['deliver','تسجيل التسليم','Record delivery'],delivering:['deliver','تسوية الكميات وإثبات التسليم','Reconcile delivery and POD'],delivered:['close','إغلاق الطلب','Close request'],closed:['','مكتمل','Completed']};
    const [action,ar,en]=actions[r.status]||['','غير متاح','Unavailable'];
    let blocked:string|undefined;


    return {action,ar,en,blocked};
}
export function closeReason(s:State,r:Row):string|undefined {
    if(s.tasks.some(t=>t.requestId===r.id&&t.status!=='completed'))return 'أكمل جميع المهام / Complete every task';
    if(s.reservations.filter(x=>x.requestId===r.id).some(x=>Math.abs(x.quantity-s.deliveries.filter(d=>d.reservationId===x.id).reduce((n,d)=>n+d.quantity,0)-s.returns.filter(d=>d.reservationId===x.id&&d.source==='custody').reduce((n,d)=>n+d.quantity,0))>=0.0001))return 'توجد كميات لم تُسلم أو ترتجع / Unaccounted custody remains';

    if(s.exceptions.some(x=>x.requestId===r.id&&!x.resolved))return 'عالج الاستثناءات المفتوحة أولًا / Resolve open exceptions first';
}
