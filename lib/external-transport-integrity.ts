import {type State,type Actor,type Command,demand} from './model';
import {externalUnavailable} from './external-transport';
const round=(n:number)=>Math.round(n*1000)/1000;

/** A carrier allocation cannot be collected again through an older internal-courier action. */
export function externalTransportGuard(s:State,_actor:Actor,c:Command){
 if(c.type.startsWith('external_'))return;
 const guarded=['pickup_actual','warehouse_release','courier_collect','load','op_issue','complete_task','assign_task','assign','split_reservation','handoff'];
 if(!guarded.includes(c.type))return;
 const loading=s.handoffs.find(h=>h.id===c.loadingId),assignment=s.assignments.find(a=>a.id===c.assignmentId);
 const linked=s.handoffs.filter(l=>l.type==='external_shipment_line'&&externalUnavailable(s,l.reservationId)>0&&s.handoffs.some(h=>h.id===l.shipmentId&&h.type==='external_shipment'&&h.mode!=='historical'&&h.status!=='cancelled'));
 const affected=linked.some(l=>c.reservationId?l.reservationId===c.reservationId:c.taskId?l.taskId===c.taskId:loading?l.reservationId===loading.reservationId:assignment?l.reservationId===assignment.reservationId:c.requestId?l.requestId===c.requestId:false);
 demand(!affected,'هذه الكمية مرتبطة بشحنة خارجية؛ تابع تسليم الناقل من قسم النقل الخارجي أو ألغِ الخطة غير المنفذة أولًا','STATE',409);
}

/** Final transaction-level protection against legacy spending or source changes after allocation. */
export function assertExternalTransportIntegrity(s:State){
 const lines=s.handoffs.filter(l=>l.type==='external_shipment_line'&&s.handoffs.some(h=>h.id===l.shipmentId&&h.type==='external_shipment'&&h.mode!=='historical'&&h.status!=='cancelled'));
 for(const l of lines){
  const res=s.reservations.find(r=>r.id===l.reservationId),task=s.tasks.find(t=>t.id===l.taskId);
  demand(res&&task&&res.requestId===l.requestId&&res.lineId===l.lineId&&res.productId===l.productId&&res.warehouseId===l.warehouseId&&(res.batchId||'')===(l.batchId||'')&&task.requestId===l.requestId&&task.lineId===l.lineId,'تغير مصدر أو وجهة كمية مرتبطة بالنقل الخارجي؛ راجع خطة الشحنة','CONFLICT',409);
 }
 for(const id of new Set(lines.map(l=>l.reservationId))){
  const res=s.reservations.find(r=>r.id===id)!;
  const delivered=s.deliveries.filter(d=>d.reservationId===id).reduce((n,d)=>n+d.quantity,0),returned=s.returns.filter(r=>r.reservationId===id&&r.source==='custody').reduce((n,r)=>n+r.quantity,0);
  const transfers=s.handoffs.filter(h=>h.type==='custody_transfer'&&h.status==='awaiting_receiver'&&h.reservationId===id).reduce((n,h)=>n+h.quantity,0);
  const returns=s.handoffs.filter(h=>h.type==='return_plan'&&h.source!=='delivered'&&h.reservationId===id).reduce((n,h)=>n+h.quantity-s.returns.filter(r=>r.returnPlanId===h.id).reduce((a,r)=>a+r.quantity,0),0);
  const presentations=s.handoffs.filter(h=>h.type==='warehouse_present'&&h.reservationId===id).reduce((n,h)=>n+h.quantity-(h.rejectedQuantity||0)-s.deliveries.filter(d=>d.presentationId===h.id).reduce((a,d)=>a+d.quantity,0),0);
  demand(round(res.quantity-delivered-returned-transfers-returns-presentations-externalUnavailable(s,id))>=0,'الكمية مستخدمة أو مخصصة بالفعل؛ لا يمكن تكرار الصرف أو تجاوز العهدة الخارجية','STOCK_CONFLICT',409);
 }
}
