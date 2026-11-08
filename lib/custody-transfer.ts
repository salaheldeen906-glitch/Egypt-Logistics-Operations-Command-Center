import {type State,type Actor,type Command,type Kind,type Row,demand,qty,row,text} from './model';
import {actualAvailable} from './actual-quantities';
import {permissionDecision} from './access-policy';
export type CustodyDirectory=Record<string,{id:string;name:string}[]>;
export const custodyExecutor=(s:State,res:Row)=>res.executorId||s.assignments.find(x=>x.reservationId===res.id)?.executorId;
export function canProposeCustody(a:Actor){
 return a.function==='representative'&&!!a.resourceIds?.length&&permissionDecision(a,'trips.propose_custody').allowed;
}
export function custodySource(s:State,res:Row){
 const request=s.requests.find(r=>r.id===res.requestId),task=s.tasks.find(t=>t.id===res.taskId)||s.tasks.find(t=>t.reservationId===res.id),fromId=custodyExecutor(s,res);
 return {request,task,fromId};
}
export function eligibleCustodyCourier(sender:Actor,recipient:Actor,request:Row,courier:Row){
 return recipient.userId!==sender.userId&&!sender.resourceIds?.includes(courier.id)&&recipient.function==='representative'
  &&!!recipient.resourceIds?.includes(courier.id)&&(!recipient.projectIds||recipient.projectIds.includes(request.projectId))
  &&(!courier.function||courier.function==='representative')&&(!courier.projectId||courier.projectId===request.projectId)
  &&permissionDecision(recipient,'trips.accept_custody').allowed&&permissionDecision(recipient,'orders.view').allowed;
}
type Add=(k:Kind,v:Record<string,any>)=>Row;
export function transferCustody(s:State,a:Actor,c:Command,now:string,add:Add):Record<string,any>|null{
 if(!['propose_custody','accept_custody','cancel_custody'].includes(c.type))return null;
 demand(a.function==='representative'&&Array.isArray(a.resourceIds)&&a.resourceIds.length,'نقل العهدة بتأكيد حساب المندوب المرتبط فقط','FORBIDDEN',403);
 if(c.type==='propose_custody'){
 const res=row(s,'reservations',text(c.reservationId)),r=row(s,'requests',res.requestId),{fromId,task}=custodySource(s,res);
 demand(a.resourceIds.includes(fromId),'المندوب المسلم لا يملك هذه العهدة','FORBIDDEN',403);demand(res.status==='issued'&&r.status!=='closed','نقل العهدة بعد التحميل فقط');const target=row(s,'resources',text(c.toId));demand(!a.resourceIds.includes(target.id),'اختر مندوبًا بحساب مستقل','FORBIDDEN',403);demand(task&&task.status!=='completed','مهمة مفتوحة مطلوبة');const q=qty(c.quantity);demand(q<=actualAvailable(s,res),'الكمية أكبر من العهدة غير المسلمة أو المنتظرة');
 return {id:add('handoffs',{type:'custody_transfer',status:'awaiting_receiver',requestId:r.id,taskId:task.id,reservationId:res.id,fromId,fromName:row(s,'resources',fromId).name,toId:target.id,toName:target.name,executorId:fromId,quantity:q,reason:text(c.reason),senderUserId:a.userId,sentAt:now,productId:res.productId,batchId:res.batchId,warehouseId:res.warehouseId}).id};
 }
 const h=row(s,'handoffs',text(c.transferId));demand(h.type==='custody_transfer'&&h.status==='awaiting_receiver','طلب النقل مؤكد أو غير موجود');if(c.type==='cancel_custody'){demand(a.resourceIds.includes(h.fromId)||a.resourceIds.includes(h.toId),'النقل لا يخص حسابك','FORBIDDEN',403);h.status='cancelled';h.cancelledAt=now;h.cancelledBy=a.userId;h.cancelReason=text(c.reason);return {id:h.id};}
 demand(a.resourceIds.includes(h.toId)&&a.userId!==h.senderUserId,'يلزم حساب المندوب المستلم المستقل','FORBIDDEN',403);const res=row(s,'reservations',h.reservationId),task=row(s,'tasks',h.taskId),r=row(s,'requests',h.requestId);demand(r.status!=='closed','الطلب مغلق');const q=qty(c.quantity);demand(q===h.quantity,'اختلاف كمية النقل؛ لا تتغير العهدة حتى تتطابق الكميتان');h.status='accepted';h.receiverUserId=a.userId;h.receivedAt=now;demand(q<=actualAvailable(s,res),'تغيرت العهدة؛ راجعها قبل التأكيد');res.quantity=Math.round((res.quantity-q)*1000)/1000;task.quantity=Math.round((task.quantity-q)*1000)/1000;
 const {id:oldId,code:oldCode,createdAt,createdBy,...copy}=res;const newRes=add('reservations',{...copy,quantity:q,executorId:h.toId,originReservationId:res.originReservationId||res.id});const {id:oldTaskId,code:oldTaskCode,...taskCopy}=task;const newTask=add('tasks',{...taskCopy,quantity:q,executorId:h.toId,reservationId:newRes.id,sourceTaskId:task.id,history:[],custodyTransferId:h.id});newRes.taskId=newTask.id;const as=s.assignments.find(x=>x.reservationId===res.id);add('assignments',{requestId:r.id,reservationId:newRes.id,warehouseId:res.warehouseId,executorId:h.toId,carrierId:as?.carrierId||task.carrierId||'',participantId:'',routeId:task.routeId||as?.routeId||''});const stop=s.stops.find(st=>st.taskId===task.id);if(stop)add('stops',{requestId:r.id,taskId:newTask.id,routeId:stop.routeId,sequence:stop.sequence,destination:stop.destination,status:stop.status==='arrived'?'arrived':'planned'});if(task.quantity===0){task.status='completed';for(const st of s.stops.filter(st=>st.taskId===task.id))st.status='completed';}h.receivingTaskId=newTask.id;h.receivingReservationId=newRes.id;return {id:h.id,taskId:newTask.id};
}
