export const kinds = ['units', 'projects', 'products', 'customers', 'warehouses', 'locations', 'batches', 'resources', 'carriers', 'requests', 'lines', 'reservations', 'assignments', 'routes', 'stops', 'movements', 'documents', 'pods', 'deliveries', 'returns', 'exceptions', 'approvals', 'handoffs', 'imports', 'tasks', 'customer_sites', 'delivery_needs', 'journey_runs', 'visit_events', 'tracking_sessions', 'tracking_points'] as const;
export type Kind = typeof kinds[number];
export type Row = {
    id: string;
    code: string;
    [key: string]: any;
};
export type State = Record<Kind, Row[]>;
export type Role = 'owner' | 'manager' | 'contributor' | 'viewer';
export type Member = {
    userId: string;
    name: string;
    role: Role;
    function: string;
    active: number;
    projectIds?: string[] | null;
    warehouseIds?: string[] | null;
    resourceIds?: string[] | null;
    platformOwner?: boolean;
    clientAdmin?: boolean;
    access?: import('./access-policy').AccessContext;
};
export type Actor = Member;
export type Command = {
    type: string;
    [key: string]: any;
};
export function emptyState(): State { return Object.fromEntries(kinds.map(k => [k, []])) as unknown as State; }
export const flows = ['draft', 'review', 'approved', 'reserved', 'assigned', 'documents_ready', 'ready', 'loaded', 'in_transit', 'arrived', 'delivering', 'delivered', 'closed'];
export const statusAr: Record<string, string> = { awaiting_destination:'حدد مخزن الرجوع',awaiting_assignment:'بانتظار توزيع الاستلام', authorized:'مصرح بالتنفيذ', collecting:'استلام المندوب جزئي', ready_to_close:'جاهز للمراجعة والإغلاق', awaiting_receipt:'بانتظار الاستلام بالمخزن', partially_received:'استلام جزئي', received:'تم الاستلام بالمخزن', completed:'مكتملة', draft: 'مسودة', review: 'مراجعة العمليات', approved: 'معتمد', reserved: 'محجوز', assigned: 'تم الإسناد', documents_ready: 'المستندات جاهزة', ready: 'جاهز للتوزيع', loaded: 'تم الاستلام والتحميل', in_transit: 'في الطريق', arrived: 'وصل للموقع', delivering: 'تسليم جزئي', delivered: 'تم التسليم', closed: 'مغلق', failed: 'تعذر التسليم', planned: 'مخططة', active: 'نشطة', returned: 'مرتجع' };
export class DomainError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function demand(ok: unknown, message: string, code = 'INVALID', status = 400): asserts ok { if (!ok)
    throw new DomainError(code, message, status); }
export const quantityRequirement = 'Quantity must be at least 1, with at most 3 decimals / الكمية لا تقل عن 1، وحتى 3 منازل عشرية';
/** Validate entered quantities only; balances, historical records and derived remainders keep their actual values. */
export function isQuantity(v: unknown) {
    const n = Number(v), scaled = n * 1000;
    return Number.isFinite(n) && n >= 1 && n <= 1000000 && Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
}
export function qty(v: unknown) { const n = Number(v); demand(isQuantity(v), quantityRequirement); return n; }
export function text(v: unknown, max = 180) { demand(typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max, 'Required text is missing or too long / نص مطلوب أو أطول من الحد'); return v.trim(); }
export function code(v: unknown) { const c = text(v, 50); demand(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(c), 'Code: letters, numbers, . _ - / صيغة الكود غير صحيحة'); return c; }
export function row(s: State, k: Kind, id: string) { const r = s[k].find(x => x.id === id); demand(r, `Record not found: ${k} / السجل غير موجود`, 'NOT_FOUND', 404); return r; }
export function balance(s: State, productId: string, warehouseId?: string, batchId?: string) { const m = s.movements.filter(x => x.productId === productId && (!warehouseId || x.warehouseId === warehouseId) && (batchId === undefined || x.batchId === batchId)); const onHand = m.reduce((n, x) => n + x.delta, 0); const reserved = s.reservations.filter(x => x.productId === productId && x.status === 'held' && (!warehouseId || x.warehouseId === warehouseId) && (batchId === undefined || x.batchId === batchId)).reduce((n, x) => n + x.quantity, 0); const transit = s.reservations.filter(x => x.productId === productId && x.status === 'issued' && (!warehouseId || x.warehouseId === warehouseId) && (batchId === undefined || x.batchId === batchId)).reduce((n, x) => n + x.quantity - s.deliveries.filter(d => d.reservationId === x.id).reduce((a, d) => a + d.quantity, 0) - s.returns.filter(d => d.reservationId === x.id && d.source === 'custody').reduce((a, d) => a + d.quantity, 0), 0); const customerCustody=s.handoffs.filter(h=>h.type==='return_plan'&&h.source==='delivered'&&h.productId===productId&&(batchId===undefined||h.batchId===batchId)&&(!warehouseId||s.reservations.some(x=>x.id===h.reservationId&&x.warehouseId===warehouseId))).reduce((n,h)=>n+h.quantity-s.returns.filter(x=>x.returnPlanId===h.id).reduce((a,x)=>a+x.quantity,0),0);const externalCustody=!warehouseId?s.handoffs.filter(h=>h.type==='external_collection'&&h.productId===productId&&(batchId===undefined||h.batchId===batchId)).reduce((n,h)=>n+h.quantity-s.deliveries.filter(d=>d.collectionId===h.id).reduce((a,d)=>a+d.quantity,0)-s.returns.filter(d=>d.collectionId===h.id&&d.source==='custody').reduce((a,d)=>a+d.quantity,0),0):0;return { onHand, reserved, available: Math.round((onHand - reserved) * 1000) / 1000, transit:Math.round((transit+customerCustody+externalCustody)*1000)/1000 }; }
export function references(k: Kind, r: Row): [
    Kind,
    string
][] { const map: Record<string, Kind> = { priorApprovalId:'approvals',quantityApprovalId:'approvals',lastQuantityApprovalId:'approvals',exceptionId:'exceptions',resolutionId:'exceptions',originalMovementId:'movements',priorNeedId:'delivery_needs',approvalId:'approvals',siteId:'customer_sites',customerSiteId:'customer_sites',needId:'delivery_needs',journeyId:'journey_runs',actualVisitId:'visit_events',sessionId:'tracking_sessions',receiptMovementId:'movements',sourceReceiptId:'requests',sourceExecutorId:'resources',originalDeliveryId:'deliveries',originReservationId:'reservations',custodyTransferId:'handoffs',receivingTaskId:'tasks',receivingReservationId:'reservations',warehouseDocumentId:'documents',courierDocumentId:'documents',loadingId:'handoffs',issuedReservationId:'reservations',presentationId:'handoffs',returnPlanId:'handoffs',sourceWarehouseId:'warehouses', sourceTaskId:'tasks', collectionId:'handoffs', taskId: 'tasks', unitId: 'units', projectId: 'projects', productId: 'products', customerId: 'customers', warehouseId: 'warehouses', locationId: 'locations', batchId: 'batches', requestId: 'requests', lineId: 'lines', reservationId: 'reservations', executorId: 'resources', participantId: 'resources', carrierId: 'carriers', routeId: 'routes', documentId: 'documents', movementId: 'movements', fromId: 'resources', toId: 'resources', importId: 'imports', custodyLocationId: 'locations' }; const links=Object.entries(map).filter(([key]) => r[key]).map(([key, kind]) => [kind, r[key]] as [Kind,string]);
 if(k==='journey_runs'||k==='visit_events'||k==='handoffs'&&String(r.type||'').startsWith('external_'))for(const id of r.taskIds||[])links.push(['tasks',id]);
 if(k==='journey_runs'||k==='visit_events'||k==='handoffs'&&String(r.type||'').startsWith('external_'))for(const id of r.requestIds||[])links.push(['requests',id]);
 for(const field of ['shipmentId','shipmentLineId','externalReturnId','externalInvoiceId'])if(r[field])links.push(['handoffs',r[field]]);
 if(k==='handoffs'&&String(r.type||'').startsWith('external_')){
  if(r.invoiceId)links.push(['handoffs',r.invoiceId]);
  for(const [field,kind] of Object.entries({shipmentIds:'handoffs',projectIds:'projects',warehouseIds:'warehouses',executorIds:'resources',documentIds:'documents'}))for(const id of r[field]||[])links.push([kind as Kind,id]);
 }
 return links; }
