import {permissionScopedState,permissionDecision} from './access-policy';
import { type Actor, type State, type Kind, type Command, kinds, emptyState, demand } from './model';
import {canReadTracking} from './gps';
import {externalLineMetrics,externalUnavailable} from './external-transport';
export function projectAllowed(a: Actor, id: string) { return a.role === 'owner' || a.projectIds == null || a.projectIds.includes(id); }
const externalRecordTypes=new Set(['external_shipment','external_shipment_line','external_event','external_document','external_cost','external_invoice']);
const externalLinkKinds:Record<string,Kind>={requestId:'requests',projectId:'projects',taskId:'tasks',lineId:'lines',reservationId:'reservations',productId:'products',batchId:'batches',warehouseId:'warehouses',sourceWarehouseId:'warehouses',executorId:'resources',sourceExecutorId:'resources',carrierId:'carriers'};
const externalListKinds:Record<string,Kind>={requestIds:'requests',projectIds:'projects',taskIds:'tasks',warehouseIds:'warehouses',executorIds:'resources'};
/** A shared shipment is visible only as a complete authorized context. Do not
 * expose hidden destinations, financial records or driver snapshots by keeping
 * a header whose first request happens to be readable. Ordinary line deliveries
 * retain their own existing project scope and do not reveal the shared header.
 */
function externalProjection(source:State,visible:State,a:Actor):State{
    if(!source.handoffs.some(h=>externalRecordTypes.has(h.type)))return visible;
    const out={...visible},present=(kind:Kind,id:unknown)=>typeof id==='string'&&visible[kind].some(r=>r.id===id);
    const context=(r:any)=>Object.entries(externalLinkKinds).every(([key,kind])=>!r[key]||present(kind,r[key]))&&Object.entries(externalListKinds).every(([key,kind])=>r[key]===undefined||Array.isArray(r[key])&&r[key].every((id:unknown)=>present(kind,id)));
    const records=source.handoffs.filter(h=>externalRecordTypes.has(h.type));
    const headers=records.filter(h=>h.type==='external_shipment');
    const scopedHistorical=(h:any)=>h.mode!=='historical'||a.role==='owner'||(a.projectIds==null||(h.projectIds||[]).length>0||!!h.projectId)&&(a.warehouseIds==null||(h.warehouseIds||[]).length>0)&&(a.resourceIds==null||(h.executorIds||[]).length>0);
    const visibleHeaders=new Set(headers.filter(h=>visible.handoffs.some(v=>v.id===h.id)&&canReadTrips(a)&&scopedHistorical(h)&&context(h)&&records.filter(x=>x.shipmentId===h.id).every(context)).map(h=>h.id));
    const externalVisible=(r:any)=>{
        if(!context(r))return false;
        if(r.type==='external_shipment')return visibleHeaders.has(r.id);
        if(r.type==='external_invoice')return Array.isArray(r.shipmentIds)&&r.shipmentIds.length>0&&r.shipmentIds.every((id:unknown)=>visibleHeaders.has(id as string));
        return !!r.shipmentId&&visibleHeaders.has(r.shipmentId);
    };
    out.handoffs=visible.handoffs.filter(h=>!externalRecordTypes.has(h.type)||externalVisible(h));
    // Header-wide attachments must not escape via the ordinary file endpoint.
    out.documents=visible.documents.filter(d=>!d.shipmentId||visibleHeaders.has(d.shipmentId));
    // These are read-only totals for a source reservation the caller already
    // sees. They reveal no shared-shipment identity or other-project quantity.
    // Keeping them when a shared header is hidden prevents falsely returning
    // carrier-held stock to the source courier's displayed custody/availability.
    out.reservations=visible.reservations.map(res=>{
        const lines=source.handoffs.filter(l=>l.type==='external_shipment_line'&&l.reservationId===res.id&&headers.some(h=>h.id===l.shipmentId&&h.mode!=='historical'&&h.status!=='cancelled'));
        if(!lines.length)return res;
        const actual=lines.reduce((n,l)=>{const m=externalLineMetrics(source,l);return n+Math.max(0,Math.round((m.handed-m.delivered-m.returnedCustody)*1000)/1000);},0);
        return {...res,externalCarrierCustodyQuantity:Math.round(actual*1000)/1000,externalCommittedQuantity:externalUnavailable(source,res.id)};
    });
    return out;
}
function canReadTrips(a:Actor){return !a.access?.enabled||permissionDecision(a,'trips.view').allowed;}
export function scopedState(s: State, a: Actor): State {
    const trackingSafe=(value:State):State=>{const permitted=(record:any)=>{const journey=s.journey_runs.find(j=>j.id===record.journeyId);return canReadTracking(s,a,record)&&!!journey&&(journey.taskIds||[]).length>0&&(journey.taskIds||[]).every((id:string)=>value.tasks.some(t=>t.id===id));};return {...value,tracking_sessions:(value.tracking_sessions||[]).filter(permitted),tracking_points:(value.tracking_points||[]).filter(permitted)};};
    if (a.role === 'owner' || a.projectIds == null&&a.warehouseIds==null&&a.resourceIds==null) return externalProjection(s,permissionScopedState(trackingSafe(s),a),a);
    const out = emptyState();
    const mine=(id:string)=>a.resourceIds?.includes(id),ownWarehouse=(id:string)=>a.warehouseIds?.includes(id);
    const requests = new Set(s.requests.filter(r => projectAllowed(a, r.projectId)&&
        (a.function!=='representative'||a.resourceIds==null||s.tasks.some(t=>t.requestId===r.id&&(mine(t.executorId)||mine(t.participantId)))||s.handoffs.some(h=>h.type==='custody_transfer'&&h.requestId===r.id&&mine(h.toId))||s.reservations.some(x=>x.requestId===r.id&&(mine(x.executorId)||s.assignments.some(y=>y.reservationId===x.id&&mine(y.executorId)))))&&
        (a.function!=='warehouse'||a.warehouseIds==null||ownWarehouse(r.warehouseId)||s.reservations.some(x=>x.requestId===r.id&&ownWarehouse(x.warehouseId))||s.tasks.some(t=>t.requestId===r.id&&ownWarehouse(t.warehouseId)))).map(r => r.id));
    const products = new Set(s.products.filter(r => projectAllowed(a, r.projectId)).map(r => r.id));
    const routes = new Set(s.routes.filter(rt => s.stops.some(st => st.routeId === rt.id) && s.stops.filter(st => st.routeId === rt.id).every(st => requests.has(st.requestId))).map(rt => rt.id));
    const visibleTask=(id:string)=>{const t=s.tasks.find(t=>t.id===id);if(!t||!requests.has(t.requestId))return false;const warehouseIds=[t.warehouseId,t.sourceWarehouseId,t.destinationWarehouseId,...s.reservations.filter(x=>x.taskId===id).map(x=>x.warehouseId)].filter(Boolean);return (a.function==='representative'||a.warehouseIds==null||warehouseIds.every(ownWarehouse))&&(a.function!=='representative'||a.resourceIds==null||mine(t.executorId)||mine(t.participantId));};
    const visibleJourney=(r:any)=>(a.function!=='representative'||a.resourceIds==null||mine(r.executorId))&&(r.taskIds||[]).some(visibleTask);
    const visibleJourneys=new Set((s.journey_runs||[]).filter(visibleJourney).map(r=>r.id));
    for (const k of kinds) out[k] = s[k].filter(r => {
        if(k==='tracking_sessions'||k==='tracking_points')return visibleJourneys.has(r.journeyId)&&canReadTracking(s,a,r);
        if(k==='journey_runs')return visibleJourneys.has(r.id);
        if(k==='tasks')return visibleTask(r.id);
        if(k==='visit_events')return (!r.journeyId||visibleJourneys.has(r.journeyId))&&(r.taskIds||[]).some(visibleTask)&&(a.function!=='representative'||a.resourceIds==null||mine(r.executorId));
        if(k==='delivery_needs'&&a.function==='representative'&&a.resourceIds!=null&&!s.tasks.some(t=>t.needId===r.id&&visibleTask(t.id)))return false;
        if(k==='customer_sites'){
            if(r.projectId&&!projectAllowed(a,r.projectId))return false;
            if(a.projectIds!=null&&!r.projectId&&!s.delivery_needs.some(n=>n.siteId===r.id&&requests.has(n.requestId)))return false;
            if(a.function==='representative'&&a.resourceIds!=null&&!s.tasks.some(t=>t.siteId===r.id&&visibleTask(t.id)))return false;
        }
        if (k === 'projects') return projectAllowed(a, r.id);
        if(k==='requests')return requests.has(r.id);
        if (k === 'imports') return false;
        if(k==='warehouses'&&a.function!=='representative'&&a.warehouseIds!=null&&!ownWarehouse(r.id))return false;
        if(k==='resources'&&a.function==='representative'&&a.resourceIds!=null&&!mine(r.id))return false;
        if(a.function==='representative'&&a.resourceIds!=null&&['tasks','handoffs','reservations','assignments','deliveries','returns','movements','documents','pods','stops'].includes(k)){
            const executor=r.executorId||s.assignments.find(y=>y.reservationId===(r.reservationId||r.id))?.executorId||s.tasks.find(t=>t.id===r.taskId)?.executorId;
            if(executor&&!mine(executor)&&!mine(r.participantId)&&!(k==='handoffs'&&r.type==='custody_transfer'&&mine(r.toId)))return false;
            if(k==='movements'&&!executor)return false;
        }
        if(a.warehouseIds!=null&&a.function!=='representative'&&['movements','reservations','locations'].includes(k)&&r.warehouseId&&!ownWarehouse(r.warehouseId))return false;
        if(a.function==='warehouse'&&a.warehouseIds!=null&&['tasks','handoffs','documents','returns','deliveries'].includes(k)){
            const task=s.tasks.find(t=>t.id===r.taskId),res=s.reservations.find(x=>x.id===(r.reservationId||task?.reservationId));
            const warehouseId=r.warehouseId||task?.warehouseId||res?.warehouseId;
            if(warehouseId&&!ownWarehouse(warehouseId))return false;
        }
        if (k === 'routes') return routes.has(r.id);
        if (r.projectId && !projectAllowed(a, r.projectId)) return false;
        if (r.requestId && !requests.has(r.requestId)) return false;
        if (r.productId && !products.has(r.productId)) return false;
        return true;
    });
    // Never expose the hidden portion of a cross-project coordination journey.
    for(const kind of ['journey_runs','visit_events'] as const)out[kind]=out[kind].map(r=>({...r,scopeReadOnly:(r.taskIds||[]).some((id:string)=>!visibleTask(id)),taskIds:(r.taskIds||[]).filter(visibleTask),requestIds:(r.requestIds||[]).filter((id:string)=>requests.has(id)),projectIds:(r.projectIds||[]).filter((id:string)=>projectAllowed(a,id))}));
    const visibleQuantityLinks=(r:any)=>Object.entries({requestId:'requests',projectId:'projects',lineId:'lines',productId:'products',warehouseId:'warehouses',sourceWarehouseId:'warehouses',reservationId:'reservations',taskId:'tasks',loadingId:'handoffs'}).every(([key,kind])=>!r[key]||(out[kind as Kind]||[]).some(x=>x.id===r[key]));
    out.handoffs=out.handoffs.filter(h=>h.type!=='loading_confirmation'||visibleQuantityLinks(h));
    out.approvals=out.approvals.filter(ap=>ap.type==='quantity_increase'?visibleQuantityLinks(ap):ap.type==='record_correction'?['deliveries','movements'].includes(ap.recordKind)&&(out as any)[ap.recordKind].some((r:any)=>r.id===ap.recordId):ap.type==='request_change'?a.warehouseIds==null&&a.resourceIds==null&&(['owner','manager'].includes(a.role)||['all','project_manager','operations','dispatcher'].includes(a.function)):true);
    out.exceptions=out.exceptions.filter(ex=>ex.type!=='loading_difference'||visibleQuantityLinks(ex));
    out.handoffs=out.handoffs.filter(h=>!['quantity_control_event','quantity_increase_event','loading_difference_event'].includes(h.type)||visibleQuantityLinks(h)&&(!h.approvalId||out.approvals.some(ap=>ap.id===h.approvalId)));
    if(a.function==='representative'&&a.resourceIds!=null)out.requests=out.requests.map(r=>{const tasks=out.tasks.filter(t=>t.requestId===r.id&&t.taskType==='delivery'),customers=[...new Set(tasks.map(t=>t.customerId).filter(Boolean))];return r.demandPlan?{...r,destination:[...new Set(tasks.map(t=>t.addressSnapshot||t.destination).filter(Boolean))].join(' · '),customerId:customers.length===1?customers[0]:''}:r;});
    return externalProjection(s,permissionScopedState(trackingSafe(out),a),a);
}
export function assertScope(s: State, a: Actor, c: Command) {
    if (a.role === 'owner' || a.projectIds == null&&a.warehouseIds==null&&a.resourceIds==null) return;
    demand(!['import', 'preview_import', 'undo_import', 'seed', 'reverse', 'trace_opening'].includes(c.type), 'This action requires unrestricted scope / الإجراء يحتاج نطاقًا غير مقيد', 'FORBIDDEN', 403);
    const visible = scopedState(s, a);
    const check = (k: Kind, id: unknown) => { if (id) demand(visible[k].some(r => r.id === id), 'Outside permitted scope / خارج نطاق حسابك', 'FORBIDDEN', 403); };
    if(c.type.startsWith('external_')){
        const lists=(value:unknown)=>{demand(value===undefined||Array.isArray(value),'Invalid external shipment record list');return (value||[]) as any[];};
        const inspect=(record:any)=>{
            demand(record&&typeof record==='object'&&!Array.isArray(record),'Invalid external shipment context');
            for(const [key,kind] of Object.entries(externalLinkKinds))check(kind,record[key]);
            for(const [key,kind] of Object.entries(externalListKinds))for(const id of lists(record[key]))check(kind,id);
            for(const key of ['shipmentId','shipmentLineId','externalReturnId','externalInvoiceId','invoiceId'])if(record[key])check('handoffs',record[key]);
            for(const id of lists(record.shipmentIds))check('handoffs',id);
            if(record.documentId)check('documents',record.documentId);
        };
        inspect(c);
        for(const value of [c.data,c.patch,...lists(c.lines),...lists(c.rows),...lists(c.items)])if(value)inspect(value);
        // Stored context is authoritative: an omitted warehouse/task/second
        // request must not turn a mixed-scope shipment into a writable one.
        const storedIds=[c.shipmentId,c.shipmentLineId,c.externalReturnId,c.externalInvoiceId,c.invoiceId,...lists(c.shipmentIds)].filter(Boolean);
        for(const id of storedIds){const stored=s.handoffs.find(h=>h.id===id);demand(stored&&externalRecordTypes.has(stored.type),'External shipment record not found','NOT_FOUND',404);inspect(stored);const shipmentIds=stored.type==='external_shipment'?[stored.id]:stored.type==='external_invoice'?lists(stored.shipmentIds):[stored.shipmentId];for(const shipmentId of shipmentIds){check('handoffs',shipmentId);for(const line of s.handoffs.filter(h=>h.type==='external_shipment_line'&&h.shipmentId===shipmentId))inspect(line);}}
    }
    const keys: Record<string, Kind> = { transferId:'handoffs',originalDeliveryId:'deliveries',loadingId:'handoffs',warehouseId:'warehouses',sourceWarehouseId:'warehouses',returnPlanId:'handoffs',collectionId:'handoffs', sourceTaskId:'tasks', taskId:'tasks', requestId:'requests', projectId:'projects', productId:'products', reservationId:'reservations', assignmentId:'assignments', routeId:'routes', stopId:'stops', lineId:'lines', batchId:'batches', documentId:'documents' };
    Object.assign(keys,{customerId:'customers',siteId:'customer_sites',needId:'delivery_needs',receiptMovementId:'movements',approvalId:'approvals',priorApprovalId:'approvals',journeyId:'journey_runs',actualVisitId:'visit_events',sessionId:'tracking_sessions'});
    for (const [key,k] of Object.entries(keys)) check(k,c[key]);
    // Review the stored context too: omitting a hidden warehouse/task from a command
    // must never make an otherwise out-of-scope approval or discrepancy writable.
    if(['propose_quantity_increase','review_quantity_increase','report_loading_difference','review_loading_difference'].includes(c.type)){
        const approval=s.approvals.find(ap=>ap.id===(c.approvalId||c.priorApprovalId));
        const loading=s.handoffs.find(h=>h.id===(c.loadingId||approval?.loadingId));
        const reservation=s.reservations.find(res=>res.id===(c.reservationId||approval?.reservationId||loading?.reservationId));
        const contexts=[approval,loading,reservation,approval?.taskId?s.tasks.find(t=>t.id===approval.taskId):undefined].filter(Boolean);
        for(const context of contexts)for(const [key,kind] of Object.entries(keys))check(kind,context![key]);
    }
    const list=(value:unknown):any[]=>{demand(value===undefined||Array.isArray(value),'Invalid scoped record list');return (value||[]) as any[];};
    for(const selected of [...list(c.batchRows),...(c.type==='plan_allocations'?list(c.rows):[])]){demand(selected&&typeof selected==='object'&&!Array.isArray(selected),'Invalid scoped record');for(const [key,k] of Object.entries(keys))check(k,selected[key]);}
    const pendingPatch=c.type==='review_request_change'&&c.decision==='approve'?s.approvals.find(ap=>ap.id===c.approvalId)?.patch:undefined;
    const patches=[c,c.patch||{},c.data||{},pendingPatch||{}];
    for(const patch of patches){demand(patch&&typeof patch==='object'&&!Array.isArray(patch),'Invalid scoped patch');for(const [key,k] of Object.entries(keys))check(k,patch[key]);for(const selected of [...list(patch.needs),...list(patch.rows),...list(patch.lines)]){demand(selected&&typeof selected==='object'&&!Array.isArray(selected),'Invalid scoped record');for(const [key,k] of Object.entries(keys))check(k,selected[key]);if(selected.executorId)check('resources',selected.executorId);if(selected.carrierId)check('carriers',selected.carrierId);}}
    const journeyId=c.journeyId||(c.sessionId?s.tracking_sessions.find(x=>x.id===c.sessionId)?.journeyId:undefined)||(c.type==='leave_visit'?s.visit_events.find(x=>x.id===c.visitId)?.journeyId:undefined);
    if(journeyId){const journey=s.journey_runs.find(x=>x.id===journeyId);demand(journey&&(journey.taskIds||[]).every((id:string)=>visible.tasks.some(t=>t.id===id)),'Journey contains work outside your scope / الرحلة تضم عملًا خارج نطاقك','FORBIDDEN',403);}
    if(c.type==='leave_visit')check('visit_events',c.visitId);
    if(c.type==='save_customer_site'&&a.projectIds!=null)demand(c.projectId||c.requestId,'Project is required for a scoped address / حدد مشروع العنوان','FORBIDDEN',403);
    if(c.type==='save_customer_site'&&c.id)check('customer_sites',c.id);
    if(c.type==='propose_correction'&&['deliveries','movements'].includes(c.kind))check(c.kind,c.recordId);
    if(c.type.startsWith('receipt_distribution_')||c.type==='cancel_receipt_distribution'){
        const res=c.reservationId?s.reservations.find(x=>x.id===c.reservationId):undefined,loading=c.loadingId?s.handoffs.find(x=>x.id===c.loadingId):undefined,task=c.taskId?s.tasks.find(x=>x.id===c.taskId):undefined,planId=c.distributionPlanId||task?.distributionPlanId||res?.distributionPlanId||s.reservations.find(x=>x.id===loading?.reservationId)?.distributionPlanId;
        if(['receipt_distribution_reserve','cancel_receipt_distribution'].includes(c.type))demand(planId&&s.tasks.filter(t=>t.distributionPlanId===planId).every(t=>visible.tasks.some(v=>v.id===t.id)),'Distribution contains work outside your scope / التوزيع يضم عملًا خارج نطاقك','FORBIDDEN',403);
    }
    if(c.type==='plan_allocations')for(const v of c.rows||[]){if(v.customerId)check('customers',v.customerId);if(v.executorId)check('resources',v.executorId);if(v.carrierId)check('carriers',v.carrierId);}
    if(a.function==='warehouse'&&a.warehouseIds!=null){
        const task=s.tasks.find(t=>t.id===c.taskId),request=s.requests.find(r=>r.id===(c.requestId||task?.requestId));
        const warehouseId=c.type==='receive_purchase'?request?.warehouseId:['receive_return','op_receive'].includes(c.type)?task?.warehouseId:undefined;
        if(warehouseId)check('warehouses',warehouseId);
    }
    if(a.function==='representative'&&a.resourceIds!=null&&['depart','arrive'].includes(c.type)){
        const stops=c.type==='depart'?s.stops.filter(st=>st.routeId===c.routeId):s.stops.filter(st=>st.id===c.stopId);
        for(const stop of stops){const tasks=stop.taskId?s.tasks.filter(t=>t.id===stop.taskId):s.tasks.filter(t=>t.requestId===stop.requestId&&t.autoGenerated);
            demand(tasks.length>0&&tasks.every(t=>a.resourceIds!.includes(t.executorId)),'This stop includes another courier. Dispatcher must operate the shared trip / المحطة تضم مندوبًا آخر؛ مسؤول الحركة يتابع الرحلة المشتركة','FORBIDDEN',403);
        }
    }
    if(a.function==='representative'&&a.resourceIds!=null&&c.executorId)check('resources',c.executorId);
    for (const id of c.taskIds || []) check('tasks',id);
    for (const id of c.requestIds || []) check('requests',id);
    for (const line of c.lines || []) check('products',line.productId);
    if (c.productCode) demand(visible.products.some(p => p.code === c.productCode), 'Product outside permitted projects / المنتج خارج النطاق', 'FORBIDDEN',403);
    if (c.id && c.kind && kinds.includes(c.kind)) check(c.kind,c.id);
    if (c.type === 'resolve_exception') check('exceptions',c.id);
    if (c.type === 'master') {
        demand(['products','batches'].includes(c.kind), 'Shared master data requires all-project access / البيانات المشتركة تحتاج نطاق كل المشاريع','FORBIDDEN',403);
        if (c.data?.projectId) check('projects',c.data.projectId);
        if (c.data?.productId) check('products',c.data.productId);
    }
    if (['delete','preview_delete'].includes(c.type)) demand(['tasks','products','batches','requests','lines','assignments','documents','routes','stops'].includes(c.kind), 'Shared records require all-project access / السجلات المشتركة تحتاج نطاق كل المشاريع','FORBIDDEN',403);
}
