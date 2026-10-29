import {assertCommandPermission} from './access-policy';
import {transferCustody} from './custody-transfer';
import {executeRequestEvolution,normalizeDeliveryNeeds,needsAsLines,saveDeliveryNeeds,approveDeliveryNeeds,replanJourneys} from './request-evolution';
import {executeJourney,afterJourneyAction} from './journeys';
import {executeTracking} from './gps';
import {saveAllocationPlan} from './allocation-plan';
import {executeLoading,loadingGuard} from './loading-confirmation';
import {executeQuantityControl,canReviewQuantity,canProposeQuantity} from './quantity-control';
import {reserveSelected,expandBatchRows} from './batch-selection';
import {taskDelivered} from './task-trace';
import {executeActual,optionalEvidence,pendingPresentation,actualAvailable} from './actual-quantities';
import {executeReturn,bindEvidence,pendingFor,pendingReturn,returnAmount} from './task-trace';
import {executeOperation,operationPermissions} from './operations';
import {extended} from './operation-types';
import { type State, type Actor, type Command, type Kind, type Row, kinds, emptyState, demand, qty, text, code, row, balance, references } from './model';
import { assertScope } from './access';
import {importRowErrors} from './import';
import { deleteRecords } from './deletion';
import { findBoxUnit } from './default-unit';
import {deliveryMetadata,hasPriceMetadata,normalizeGovernorate,normalizePriceMetadata} from './delivery-metadata';
import {assertStockTransition} from './stock-integrity';
import {productCatalogMetadata} from './dental-catalog';
import {productTrackingEdit} from './product-tracking';
import {carrierDirectoryMetadata} from './carrier-directory';
import {executeExternalTransport,externalTransportCommands,externalCommandAllowed} from './external-transport';
import {externalTransportGuard,assertExternalTransportIntegrity} from './external-transport-integrity';
const priority=(value:any)=>{const p=value||'normal';demand(['low','normal','high','urgent'].includes(p),'Invalid priority / أولوية غير صحيحة');return p;};
const validDay=(value:any)=>{demand(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'Valid date required / تاريخ صحيح مطلوب');return value;};
const masterKinds: Kind[] = ['projects', 'products', 'units', 'customers', 'warehouses', 'locations', 'batches', 'resources', 'carriers'];
export function roleAuthorize(a: Actor, c: Command) { if(c.type==='complete_task') c={...c,type:c.taskType==='documents'?'verify_documents':c.taskType==='pickup'?'load':'deliver'}; demand(a.active, 'Membership disabled / العضوية معطلة', 'FORBIDDEN', 403); demand(a.role !== 'viewer', 'Read only / قراءة فقط', 'FORBIDDEN', 403); if(externalTransportCommands.includes(c.type as any)){demand(externalCommandAllowed(a,c.type),'وظيفتك لا تسمح بإجراء النقل الخارجي','FORBIDDEN',403);return;} const owner = ['seed', 'reset', 'restore', 'member', 'invite', 'revoke_invite', 'revoke_invites', 'backup']; const manager = ['near_expiry', 'reverse', 'undo_import', 'trace_opening', 'delete', 'preview_delete']; if (owner.includes(c.type))
    demand(a.role === 'owner', 'Owner only / للمالك فقط', 'FORBIDDEN', 403); if (manager.includes(c.type))
    demand(['owner', 'manager'].includes(a.role), 'Manager approval required / يلزم مدير', 'FORBIDDEN', 403); if (c.type === 'preview_import')
    c = { ...c, type: 'import' }; if(['propose_quantity_increase','report_loading_difference','review_quantity_increase','review_loading_difference'].includes(c.type)){demand(c.type.startsWith('review_')?canReviewQuantity(a):canProposeQuantity(a),'وظيفتك لا تسمح بإجراء مراجعة الكمية','FORBIDDEN',403);return;} if (['owner', 'manager'].includes(a.role) || a.function === 'all')
    return; const additions:Record<string,string[]>={project_manager:['save_customer_site','save_delivery_needs','propose_request_change','propose_correction'],operations:['save_customer_site','approve_delivery_needs','propose_request_change','review_request_change','propose_correction','review_correction'],warehouse:['propose_correction','receipt_distribution_release'],dispatcher:['save_customer_site','propose_correction','create_receipt_distribution','receipt_distribution_reserve','plan_journey','start_journey','end_journey','cancel_journey','arrive_visit','leave_visit'],representative:['propose_correction','receipt_distribution_collect','receipt_distribution_arrive','receipt_distribution_deliver','start_journey','end_journey','cancel_journey','arrive_visit','leave_visit','tracking_start','tracking_point','tracking_stop']};
    additions.dispatcher.push('cancel_receipt_distribution');
    for(const fn of ['project_manager','dispatcher','warehouse','representative','operations'])additions[fn].push('propose_quantity_increase','report_loading_difference');
    for(const fn of ['project_manager','dispatcher'])additions[fn].push('review_quantity_increase','review_loading_difference');
    const perms: Record<string, string[]> = { project_manager: ['plan_allocations','master', 'create_request', 'edit_request', 'plan_task', 'submit', 'import'], operations: ['close_receipt', 'resolve_exception', 'master', 'approve', 'reserve', 'verify_documents', 'exception', 'import'], warehouse: ['warehouse_release','pickup_actual','receive_return', 'receive_purchase', 'close_receipt', 'master', 'opening', 'reserve', 'load', 'upload', 'import'], dispatcher: ['plan_allocations','reserve','op_reserve','pickup_actual','return_destination','prepare_tasks','plan_return','assign_task', 'split_reservation', 'master', 'assign', 'create_route', 'depart', 'arrive', 'handoff', 'exception'], representative: ['cancel_custody','propose_custody','accept_custody','courier_collect','return_destination','pickup_actual','op_present','plan_return','return_arrive','depart', 'arrive', 'deliver', 'pod', 'return', 'upload', 'exception', 'close'] }; demand((perms[a.function]?.includes(c.type)||operationPermissions[a.function]?.includes(c.type)||additions[a.function]?.includes(c.type)), 'Your operational function cannot do this / وظيفتك لا تسمح بهذا الإجراء', 'FORBIDDEN', 403); }
// ACCESS-DAF: preserve the complete existing role matrix as the default.
// Overrides affect the permission decision, never execution/scope/quantity guards.
export function authorize(a: Actor, c: Command) {
    if (!a.access?.enabled) return roleAuthorize(a,c);
    let allowed=false;
    try { roleAuthorize(a,c); allowed=true; } catch {}
    assertCommandPermission(a,c,allowed);
}
export function execute(original: State, a: Actor, c: Command, now = new Date().toISOString(), deliveryEventId?:string):{state:State;result:Record<string,any>} {
    authorize(a, c);
    assertScope(original, a, c);
    loadingGuard(original,a,c);
    externalTransportGuard(original,a,c);
    if(['deliver','op_deliver'].includes(c.type))c={...c,visitId:c.visitId?text(c.visitId):crypto.randomUUID(),deliveryEventId:deliveryEventId||crypto.randomUUID()};
    const commands=expandBatchRows(c);if(commands){let state=original;const results=[];for(const command of commands){const out=execute(state,a,command,now,c.deliveryEventId);state=out.state;results.push(out.result);}if(c.deliveryEventId){for(const d of state.deliveries.filter(d=>d.deliveryEventId===c.deliveryEventId)){const t=state.tasks.find(t=>t.id===d.taskId),res=state.reservations.find(x=>x.id===d.reservationId);const planned=t?.quantity||res?.quantity;const delivered=state.deliveries.filter(x=>t?x.taskId===t.id:x.reservationId===res?.id).reduce((n,x)=>n+x.quantity,0);d.deliveryOutcome=planned&&Math.round(delivered*1000)>=Math.round(planned*1000)?'full':'partial';}}return {state,result:{...results.at(-1),batchResults:results}};}
    const s = structuredClone(original);
    let result: Record<string, any> = {};
    const id = () => crypto.randomUUID();
    const add = (k: Kind, v: Record<string, any>) => {
        let metadata:Record<string,any>={};
        if(k==='requests'&&c.type==='create_request')metadata={governorate:normalizeGovernorate(c.governorate)};
        // Extended outward workflows create their lines through the same add function.
        if(k==='lines'&&c.type==='create_request'&&['delivery','distribution','warehouse_transfer'].includes(c.requestType||'delivery')){
            const input=(c.lines||[]).find((l:any)=>l.productId===v.productId);
            if(input&&hasPriceMetadata(input))metadata=normalizePriceMetadata(input);
        }
        if(k==='deliveries'||k==='tasks'&&['delivery','allocation'].includes(v.taskType))metadata={...metadata,...deliveryMetadata(s,v)};
        if(k==='movements'&&v.type==='issue'){
            const line=s.lines.find(l=>l.id===v.lineId),task=s.tasks.find(t=>t.id===v.taskId);
            metadata={...metadata,approvedQuantityAtIssue:task?.distributionPlanId?task.quantity:line?.approvedQuantity??line?.quantity??null,...(task?.distributionPlanId?{distributionPlanId:task.distributionPlanId,receiptMovementId:task.receiptMovementId}:{}),...(a.function==='warehouse'?{warehousePerformedBy:a.userId,warehousePerformedByName:a.name}:{})};
        }
        const r = { id: id(), code: `${k.toUpperCase().slice(0, 3)}-${id().slice(0, 8)}`, createdAt: now, createdBy: a.userId, createdByName:a.name, ...metadata,...v } as Row; demand(!s[k].some(x => x.code.toLowerCase() === r.code.toLowerCase()), 'Duplicate code / الكود مكرر', 'DUPLICATE', 409); s[k].push(r); return r;
    };
    const request = () => row(s, 'requests', text(c.requestId));
    const ensureStatus = (r: Row, list: string[]) => demand(list.includes(r.status), `Invalid state ${r.status} / الإجراء غير مسموح في هذه الحالة`, 'STATE', 409);
    const deliveryTask=(r:Row,res:Row,q:number)=>{
        if(!s.tasks.some(t=>t.requestId===r.id&&t.taskType==='delivery')) return '';
        const t=c.taskId?row(s,'tasks',text(c.taskId)):s.tasks.find(t=>t.id===res.taskId)||s.tasks.find(t=>t.autoGenerated&&t.reservationId===res.id); demand(t,'اختر مهمة التسليم');
        demand(t.requestId===r.id&&t.lineId===res.lineId&&t.taskType==='delivery','Task/line mismatch');
        demand(!t.allocationPlan||res.taskId===t.id,'الكمية تخص توزيعًا آخر');
        demand(!t.autoGenerated||(res.taskId?res.taskId===t.id:res.id===t.reservationId),'الدفعة المحجوزة تخص مهمة أخرى / Batch reservation belongs to another task');
        demand(c.source==='delivered'||t.status!=='completed','Task already completed');
        if(c.type==='deliver')ensureStatus(t,['arrived']);
        const delivered=s.deliveries.filter(d=>d.taskId===t.id).reduce((n,d)=>n+d.quantity,0),returned=returnAmount(s,t);
        if(c.source==='delivered')demand(q<=delivered-s.returns.filter(d=>d.taskId===t.id&&d.source==='delivered').reduce((n,d)=>n+d.quantity,0),'Return exceeds task delivery');
        else demand(Math.round(q*1000)<=Math.round((t.quantity-delivered-returned-pendingReturn(s,t))*1000),'Quantity exceeds destination allocation / الكمية تتجاوز نصيب الوجهة');
        return t.id;
    };
    const mv = (v: Record<string, any>) => add('movements', { ...v, postedAt: now });
    const batchEligible = (p: Row, b: Row | undefined, rid: string, lid: string, q: number) => { if (!p.tracked)
        return true; if (!b)
        return false; if (p.expiry) {
        if (!b.expiryDate)
            return false;
        const days = (Date.parse(b.expiryDate + 'T00:00:00Z') - Date.parse(now.slice(0, 10) + 'T00:00:00Z')) / 86400000;
        if (days <= 0)
            return false;
        if (days <= 90)
            return s.approvals.some(x => (!x.type||x.type==='near_expiry') && x.requestId === rid && x.lineId === lid && x.batchId === b.id && x.quantity >= q && x.approvedBy && x.status === 'approved');
    } return true; };
    const master = (kind: Kind, data: any, importId?: string) => { demand(masterKinds.includes(kind), 'Unsupported master data / نوع البيانات غير مدعوم'); const val: any = { code: code(data.code), name: text(data.name) }; if(kind==='customers'){if(data.governorate!==undefined)val.governorate=normalizeGovernorate(data.governorate);if(data.address!==undefined)val.address=data.address?text(data.address,1000):'';} if (kind === 'products') {
        // Create a missing default only as part of this explicit product save.
        // Existing products, stock movements and explicitly selected units retain their units.
        val.unitId = data.unitId ? row(s, 'units', text(data.unitId)).id
            : (findBoxUnit(s.units) || add('units', { code: 'BOX', name: 'صندوق / Box', ...(importId ? { importId } : {}) })).id;
        val.projectId = row(s, 'projects', text(data.projectId)).id;
        Object.assign(val,productCatalogMetadata(data));
        val.tracked = data.tracked === true || data.tracked === 'true';
        val.expiry = data.expiry === true || data.expiry === 'true';
        if (val.expiry)
            val.tracked = true;
    } if (kind === 'locations')
        val.warehouseId = row(s, 'warehouses', text(data.warehouseId)).id; if (kind === 'batches') {
        val.productId = row(s, 'products', text(data.productId)).id;
        val.expiryDate = data.expiryDate || '';
        const p = row(s, 'products', val.productId);
        if (p.expiry)
            val.expiryDate = validDay(val.expiryDate);
    } if (kind === 'resources')
        val.function = data.function || 'representative'; if (kind === 'carriers')
        {val.custodyLocationId = data.custodyLocationId || '';Object.assign(val,carrierDirectoryMetadata(data));} if (importId)
        val.importId = importId; return add(kind, val); };
    const createRequest = (data: any, importId?: string) => { const requestType=data.requestType||'delivery'; demand(['delivery','purchase_receipt'].includes(requestType),'اختر نوع طلب صحيح / Invalid request type'); const incoming=requestType==='purchase_receipt';const normalized=data.needs?normalizeDeliveryNeeds(s,text(data.projectId),data.needs):undefined;if(normalized&&!incoming)data={...data,lines:needsAsLines(normalized),customerId:normalized[0].customerId,destination:normalized.map(n=>n.addressSnapshot).join(' · ').slice(0,180)}; if(incoming)demand(data.warehouseId,'اختر مخزن الاستلام أولًا / Select receiving warehouse'); const warehouseId=incoming?row(s,'warehouses',text(data.warehouseId||'',180)).id:''; const r = add('requests', { requestType, loadingProtocol:data.loadingProtocol==='dual'?'dual':undefined, warehouseId, supplierName:incoming?text(data.supplierName):'', purchaseReference:incoming?text(data.purchaseReference):'', code: code(data.code), projectId: row(s, 'projects', text(data.projectId)).id, customerId: incoming?'':row(s, 'customers', text(data.customerId)).id, destination: incoming?row(s,'warehouses',warehouseId).name:text(data.destination), dueDate: validDay(data.dueDate || now.slice(0, 10)), status: 'draft', priority: priority(data.priority), notes: data.notes ? text(data.notes, 1000) : '', ...(importId ? { importId } : {}) }); demand(Array.isArray(data.lines) && data.lines.length > 0 && data.lines.length <= 100, 'Add 1–100 lines / أضف بنود الطلب'); const seenProducts=new Set(); for (const l of data.lines) {
        const p = row(s, 'products', text(l.productId));
        demand(p.projectId === r.projectId, 'Product belongs to another project / المنتج يتبع مشروعًا آخر');
        demand(!seenProducts.has(p.id),'الصنف مكرر؛ اجمع كميته بسطر واحد');seenProducts.add(p.id);add('lines', { requestId: r.id, productId: p.id, quantity: qty(l.quantity),...(!incoming?normalizePriceMetadata(l):{}) });
    } if(normalized)saveDeliveryNeeds(s,r,a,data.needs,now,add); return r; };
    const opening = (data: any, importId?: string) => { const p = s.products.find(x => x.code === data.productCode); demand(p, 'Product Code not found / كود المنتج غير موجود'); const w = row(s, 'warehouses', text(data.warehouseId)); let b: Row | undefined; if (data.batchId) {
        b = row(s, 'batches', data.batchId);
        demand(b.productId === p.id, 'Batch/product mismatch / الدفعة لا تخص المنتج');
    } return mv({ type: 'opening', productId: p.id, warehouseId: w.id, batchId: b?.id || '', delta: qty(data.quantity), reason: text(data.reason || 'Pilot opening balance'), ...(importId ? { importId } : {}) }); };
    const resetUnloadedPlan=(r:Row)=>{
        const reservations=s.reservations.filter(x=>x.requestId===r.id),stops=s.stops.filter(x=>x.requestId===r.id),taskRows=s.tasks.filter(x=>x.requestId===r.id);
        demand(reservations.every(x=>x.status==='held')&&!s.movements.some(x=>x.requestId===r.id)&&!s.deliveries.some(x=>x.requestId===r.id)&&!s.returns.some(x=>x.requestId===r.id),'بدأ التحميل أو التنفيذ؛ انقل العهدة بتأكيد المندوبين بدل تغيير الخطة','STATE',409);
        demand(!s.handoffs.some(h=>h.requestId===r.id&&h.type==='loading_confirmation'),'يوجد تأكيد تحميل مسجل من المخزن أو المندوب؛ راجع التأكيد قبل تعديل الخطة. لا يمكن إلغاء توقيع مسجل بتغيير التوزيع','STATE',409);
        demand(taskRows.every(t=>t.status==='planned')&&stops.every(st=>row(s,'routes',st.routeId).status==='planned'),'بدأت رحلة أو مهمة؛ لا يمكن استبدال خطة التنفيذ','STATE',409);
        const reason=text(c.reason,1000),routeIds=new Set(stops.map(x=>x.routeId));
        replanJourneys(s,r,a,now,reason);
        const previousPlan=taskRows.map(t=>({id:t.id,code:t.code,lineId:t.lineId,quantity:t.quantity,executorId:t.executorId,sourceWarehouseId:t.sourceWarehouseId,destination:t.destination}));
        s.assignments=s.assignments.filter(x=>x.requestId!==r.id);
        s.reservations=s.reservations.filter(x=>x.requestId!==r.id);
        s.stops=s.stops.filter(x=>x.requestId!==r.id);
        for(const t of taskRows)t.routeId='';
        s.routes=s.routes.filter(rt=>!routeIds.has(rt.id)||s.stops.some(st=>st.routeId===rt.id));
        r.changes=[...(r.changes||[]),{at:now,actor:a.name,action:'reset_unloaded_plan',reason,previousStatus:r.status,previousPlan,releasedReservations:reservations.map(x=>({id:x.id,code:x.code,taskId:x.taskId,warehouseId:x.warehouseId,batchId:x.batchId,quantity:x.quantity})),detachedStops:stops.map(x=>({id:x.id,routeId:x.routeId,taskId:x.taskId,sequence:x.sequence}))}];
        r.status='approved';delete r.authorizationCode;delete r.authorizedBy;delete r.authorizedAt;
    };
    if(c.type==='plan_allocations'){
        const r=request();
        if(r.allocationPlan&&['approved','assigned','documents_ready','ready'].includes(r.status)&&(s.reservations.some(x=>x.requestId===r.id)||s.stops.some(x=>x.requestId===r.id)||r.status!=='approved'))resetUnloadedPlan(r);
    }
    if(c.type==='op_plan'){
        const r=s.requests.find(x=>x.id===(c.requestId||s.tasks.find(t=>t.id===c.taskId)?.requestId));
        if(r&&extended(r)&&['authorized','reserved'].includes(r.status))resetUnloadedPlan(r);
    }
    if(['receive_purchase','op_collect'].includes(c.type)&&c.batchCode){const line=row(s,'lines',text(c.lineId));demand(line.requestId===c.requestId,'البند لا يخص الطلب');const product=row(s,'products',line.productId);const existing=s.batches.find(b=>b.code.toLowerCase()===String(c.batchCode).toLowerCase());if(existing){demand(existing.productId===product.id&&(!product.expiry||existing.expiryDate===c.expiryDate),'الباتش موجود بمنتج أو صلاحية مختلفة');c={...c,batchId:existing.id};}else{const b=master('batches',{code:c.batchCode,name:c.batchCode,productId:product.id,expiryDate:c.expiryDate});c={...c,batchId:b.id};}}
    if(['deliver','op_deliver','op_present','plan_return','return'].includes(c.type)&&c.source!=='delivered'){const source=s.reservations.find(x=>x.id===(c.reservationId||c.sourceId));if(source&&c.quantity)demand(qty(c.quantity)<=actualAvailable(s,source),'الكمية تتجاوز العهدة المتاحة بعد حجز النقل');}
    const operationResult=executeExternalTransport(s,a,c,now,add) || executeQuantityControl(s,a,c,now,add,executeActual) || executeRequestEvolution(s,a,c,now,add) || executeJourney(s,a,c,now,add) || executeTracking(s,a,c,now,add) || transferCustody(s,a,c,now,add) || executeLoading(s,a,c,now,add,executeActual) || reserveSelected(s,c,now,add) || executeActual(s,a,c,now,add) || executeReturn(s,a,c,now,add) || executeOperation(s,a,c,now,add);
    if(operationResult!==null) result=operationResult;
    else if (c.type === 'delete') {
        result = deleteRecords(s, c.kind, c.id, c.reason);
    }
    else if (c.type === 'seed') {
        demand(s.products.length === 0 && s.movements.length === 0, 'Seed allowed only in an empty dataset / البيانات ليست فارغة');
        const u = master('units', { code: 'EA', name: 'Unit / وحدة' });
        const ps = ['Dental', 'Materials', 'Devices', 'IVF', 'Oncology'].map(n => master('projects', { code: n.toUpperCase(), name: n }));
        const w = master('warehouses', { code: 'WH-CAI', name: 'Cairo central / مخزن القاهرة' });
        master('warehouses', { code: 'WH-GIZ', name: 'Giza hub / مخزن الجيزة' });
        const loc = master('locations', { code: 'BOSTA-CUSTODY', name: 'Bosta custody / عهدة بوسطة', warehouseId: w.id });
        master('carriers', { code: 'BOSTA', name: 'Bosta / بوسطة', custodyLocationId: loc.id });
        master('carriers', { code: 'DAF-FLEET', name: 'DAF fleet / أسطول داف' });
        master('resources', { code: 'REP-01', name: 'Demo executor 01 / مندوب تجريبي 01' });
        master('resources', { code: 'REP-02', name: 'Demo executor 02 / مندوب تجريبي 02' });
        const customer = master('customers', { code: 'C-TEST-001', name: 'Pilot medical center / مركز طبي تجريبي' });
        const names = ['Dental kit / طقم أسنان', 'Medical supplies / مستلزمات طبية', 'Device module / وحدة جهاز', 'Lab accessories / ملحقات مختبر', 'Care supplies / مستلزمات رعاية'];
        const products = ps.map((p, i) => master('products', { code: `TEST-${p.code}-001`, name: names[i], projectId: p.id, unitId: u.id }));
        for (const p of products)
            opening({ productCode: p.code, warehouseId: w.id, quantity: 120 });
        const p = master('products', { code: 'TEST-DENTAL-002', name: 'Dental consumables / مستهلكات أسنان', projectId: ps[0].id, unitId: u.id });
        opening({ productCode: p.code, warehouseId: w.id, quantity: 80 });
        createRequest({ code: 'REQ-TEST-001', projectId: ps[0].id, customerId: customer.id, destination: 'Nasr City / مدينة نصر', lines: [{ productId: products[0].id, quantity: 12 }, { productId: p.id, quantity: 8 }] });
        result = { seeded: true };
    }
    else if (c.type === 'master') {
        const k = c.kind as Kind;
        if (c.id) {
            demand(masterKinds.includes(k) && k !== 'batches', 'This master cannot be edited / التعديل غير متاح');
            const r = row(s, k, c.id);
            if(k==='products'){
                const policy=productTrackingEdit(s,r,c.data);
                if(policy?.changed){
                    Object.assign(r,policy.next);
                    r.trackingPolicyHistory=[...(r.trackingPolicyHistory||[]),{previous:policy.previous,next:policy.next,actorId:a.userId,actorName:a.name,at:now}];
                }
                r.updatedAt=now;r.updatedBy=a.userId;
            }
            r.name = text(c.data.name);
            if(k==='carriers'){Object.assign(r,carrierDirectoryMetadata(c.data));r.updatedAt=now;r.updatedBy=a.userId;}
            if(k==='customers'){if(c.data.governorate!==undefined)r.governorate=normalizeGovernorate(c.data.governorate);if(c.data.address!==undefined)r.address=c.data.address?text(c.data.address,1000):'';}
            result = { id: r.id };
        }
        else
            result = { id: master(k, c.data).id };
    }
    else if (c.type === 'opening')
        result = { id: opening(c).id };
    else if (c.type === 'receive_purchase') {
        const r=request(); demand(r.requestType==='purchase_receipt','طلب استلام مشتريات مطلوب');
        ensureStatus(r,['awaiting_receipt','partially_received']);
        const line=row(s,'lines',text(c.lineId)); demand(line.requestId===r.id,'البند لا يتبع الطلب');
        const receiptTask=s.tasks.find(t=>t.requestId===r.id&&t.lineId===line.id&&t.taskType==='warehouse_receipt'); demand(receiptTask?.executorId,'مسؤول الحركة يحدد مسؤول الاستلام أولًا');
        const product=row(s,'products',line.productId), q=qty(c.quantity);
        const received=s.movements.filter(m=>m.type==='purchase_receipt'&&m.lineId===line.id).reduce((n,m)=>n+m.delta,0);
        demand(Math.round((received+q)*1000)<=Math.round(line.quantity*1000),'الكمية أكبر من المتبقي للاستلام / Receipt exceeds remaining quantity');
        const doc=optionalEvidence(s,c,r,a,now,receiptTask);
        let batch:Row|undefined;
        if(c.batchId) {batch=row(s,'batches',c.batchId);demand(batch.productId===product.id,'الدفعة لا تخص المنتج');}
        demand(!product.tracked||batch,'اختر دفعة المنتج المتتبع / Batch required');
        if(product.expiry) demand(batch?.expiryDate&&batch.expiryDate>now.slice(0,10),'لا يمكن استلام منتج منتهي الصلاحية / Valid expiry required');
        if(doc)bindEvidence(s,doc,receiptTask,'purchase_receipt',a,now);
        mv({type:'purchase_receipt',taskId:receiptTask.id,requestId:r.id,lineId:line.id,productId:product.id,warehouseId:r.warehouseId,batchId:batch?.id||'',delta:q,documentId:doc?.id||'',recipient:text(c.recipient),reason:text(c.reason)});
        if(doc){doc.verified=true; doc.verifiedBy=a.userId;} if(Math.round((received+q)*1000)===Math.round(line.quantity*1000)){receiptTask.status='completed';receiptTask.completedAt=now;}
        r.status=s.lines.filter(l=>l.requestId===r.id).every(l=>Math.round(s.movements.filter(m=>m.type==='purchase_receipt'&&m.lineId===l.id).reduce((n,m)=>n+m.delta,0)*1000)===Math.round(l.quantity*1000))?'received':'partially_received';
        result={received:q,remaining:Math.round((line.quantity-received-q)*1000)/1000};
    }
    else if(c.type==='close_receipt') {
        const r=request(); demand(r.requestType==='purchase_receipt','طلب استلام مشتريات مطلوب');ensureStatus(r,['received']);
        demand(!s.exceptions.some(e=>e.requestId===r.id&&!e.resolved),'عالج الاستثناءات المفتوحة أولًا');
        r.status='closed';r.closedAt=now;
    }
    else if (c.type === 'trace_opening') {
        const m = row(s, 'movements', c.movementId);
        demand(m.type === 'opening' && !m.batchId, 'Only untraced opening movements / رصيد افتتاحي غير متتبع فقط');
        const q = qty(c.quantity);
        const used = s.movements.filter(x => x.movementId === m.id && x.type === 'trace_out').reduce((n, x) => n - x.delta, 0);
        demand(q <= m.delta - used && q <= balance(s, m.productId, m.warehouseId, '').available, 'Quantity exceeds untraced balance / الكمية تتجاوز الرصيد');
        const b = row(s, 'batches', c.batchId);
        demand(b.productId === m.productId, 'Batch/product mismatch');
        mv({ type: 'trace_out', movementId: m.id, productId: m.productId, warehouseId: m.warehouseId, batchId: '', delta: -q, reason: text(c.reason) });
        mv({ type: 'trace_in', productId: m.productId, warehouseId: m.warehouseId, batchId: b.id, delta: q, reason: c.reason });
    }
    else if(c.type==='plan_allocations')result=saveAllocationPlan(s,a,c,add,now);
    else if (c.type === 'create_request')
        result = { id: createRequest(c).id };
    else if (c.type === 'edit_request') {
        const r = request();
        ensureStatus(r, ['draft']);
        if(c.destination!==undefined&&r.requestType!=='purchase_receipt'&&!r.allocationPlan) r.destination = text(c.destination);
        if(c.priority!==undefined) r.priority=priority(c.priority);
        if(c.dueDate!==undefined) r.dueDate=validDay(c.dueDate);
        if(c.notes!==undefined) r.notes = c.notes ? text(c.notes, 1000) : '';
        if (c.lines) {
            demand(!s.tasks.some(t=>t.requestId===r.id),'Remove draft tasks before replacing lines / أزل مهام المسودة قبل تغيير البنود');
            demand(c.lines.length > 0 && c.lines.length <= 100, 'Add request lines');
            s.lines = s.lines.filter(x => x.requestId !== r.id);
            for (const l of c.lines) {
                const p = row(s, 'products', l.productId);
                demand(p.projectId === r.projectId, 'Product belongs to another project');
                add('lines', { requestId: r.id, productId: p.id, quantity: qty(l.quantity) });
            }
        }
    }
    else if(c.type==='prepare_tasks'){
        const r=request();demand(!extended(r)&&!['draft','review','closed'].includes(r.status),'الطلب لا يحتاج تجهيز مهام');
        if(r.requestType==='purchase_receipt'){
            demand(s.lines.some(l=>l.requestId===r.id&&!s.tasks.some(t=>t.lineId===l.id&&t.taskType==='warehouse_receipt')),'مهام الاستلام موجودة بالفعل');
            for(const line of s.lines.filter(l=>l.requestId===r.id&&!s.tasks.some(t=>t.lineId===l.id&&t.taskType==='warehouse_receipt'))){const t=add('tasks',{requestId:r.id,taskType:'warehouse_receipt',lineId:line.id,quantity:line.quantity,sourceAddress:r.supplierName,destination:r.destination,warehouseId:r.warehouseId,status:'planned',executorId:'',dueDate:r.dueDate});for(const m of s.movements.filter(m=>m.lineId===line.id&&m.type==='purchase_receipt'))m.taskId=t.id;}
            r.status='awaiting_assignment';
        }else{
            demand(!s.tasks.some(t=>t.requestId===r.id&&t.taskType==='delivery'),'مهام التسليم موجودة بالفعل');
            for(const res of s.reservations.filter(x=>x.requestId===r.id)){const as=s.assignments.find(x=>x.reservationId===res.id);demand(as,'أسند الحجوزات أولًا');const stop=s.stops.find(x=>x.requestId===r.id);const t=add('tasks',{requestId:r.id,taskType:'delivery',autoGenerated:true,reservationId:res.id,lineId:res.lineId,quantity:res.quantity,executorId:as.executorId,participantId:as.participantId||'',sourceAddress:row(s,'warehouses',res.warehouseId).name,destination:r.destination,dueDate:r.dueDate,status:['arrived','delivering','delivered'].includes(r.status)?'arrived':r.status==='in_transit'?'in_transit':'planned',routeId:stop?.routeId||''});for(const d of s.deliveries.filter(x=>x.reservationId===res.id&&!x.taskId))d.taskId=t.id;for(const d of s.returns.filter(x=>x.reservationId===res.id&&!x.taskId))d.sourceTaskId=t.id;for(const doc of s.pods.filter(x=>x.requestId===r.id&&!x.taskId))if(s.deliveries.some(x=>x.taskId===t.id))add('pods',{requestId:r.id,taskId:t.id,documentId:doc.documentId,recipient:doc.recipient,signedAt:doc.signedAt});if(Math.abs(t.quantity-s.deliveries.filter(x=>x.taskId===t.id).reduce((n,x)=>n+x.quantity,0)-returnAmount(s,t))<0.0001)t.status='completed';}
        }result={id:r.id};
    }
    else if(c.type==='plan_task') {
        const r=request(); ensureStatus(r,['draft']); demand(r.requestType!=='purchase_receipt','طلب الاستلام يستخدم تسجيل الوارد بالمخزن / Use warehouse receipt');
        const existing=c.taskId?row(s,'tasks',c.taskId):undefined;
        demand(!existing||existing.requestId===r.id,'Task/request mismatch');
        demand(!r.allocationPlan&&!r.demandPlan,'عدّل جميع كميات وعناوين هذا الطلب من خطة التوزيع حتى تظل البنود متطابقة');
        demand(!c.remove,'Use protected task deletion / استخدم المسح المحمي للمهمة');
        {
            demand(['pickup','documents','delivery'].includes(c.taskType),'Choose a task type / اختر نوع المهمة');
            demand(existing||s.tasks.filter(t=>t.requestId===r.id).length<100,'Maximum 100 tasks');
            const values:any={requestId:r.id,taskType:c.taskType,destination:text(c.destination),dueDate:validDay(c.dueDate||r.dueDate),status:'planned',notes:c.notes?text(c.notes,1000):'',lineId:'',quantity:0};
            if(c.taskType==='delivery') {
                const line=row(s,'lines',c.lineId); demand(line.requestId===r.id,'Line/request mismatch');
                values.lineId=line.id; values.quantity=qty(c.quantity);
                const allocated=s.tasks.filter(t=>t.lineId===line.id&&t.id!==existing?.id).reduce((n,t)=>n+t.quantity,0);
                demand(Math.round((allocated+values.quantity)*1000)<=Math.round(line.quantity*1000),'Task quantities exceed the line / كميات المهام تتجاوز البند');
            }
            if(existing) Object.assign(existing,values); else result={id:add('tasks',values).id};
        }
    }
    else if(c.type==='assign_task') {
        const t=row(s,'tasks',c.taskId),r=row(s,'requests',t.requestId);
        demand(!['closed'].includes(r.status)&&!['completed'].includes(t.status),'Completed task is locked');
        demand(!t.autoGenerated,'عدّل مندوب العهدة من إسناد الحجز قبل التنفيذ');
        if(t.allocationPlan){const taskReservations=s.reservations.filter(x=>x.taskId===t.id);demand(taskReservations.every(x=>x.status==='held')&&!s.handoffs.some(h=>h.type==='loading_confirmation'&&taskReservations.some(x=>x.id===h.reservationId)),'بدأ تأكيد تحميل هذه المهمة؛ نقلها إلى مندوب آخر يحتاج تأكيد تسليم واستلام العهدة','STATE',409);}
        demand(t.taskType!=='warehouse_receipt'||!t.executorId||!s.movements.some(m=>m.taskId===t.id),'بدأ الاستلام؛ لا يمكن تغيير المسؤول');
        demand(t.taskType!=='return','مهمة الرجوع تحت نفس عهدة المندوب');
        demand(!t.routeId,'Task already on a route / المهمة ضمن رحلة بالفعل');
        t.executorId=row(s,'resources',c.executorId).id;
        t.participantId=c.participantId?row(s,'resources',c.participantId).id:'';
        demand(t.executorId!==t.participantId,'Choose a different participant');
        if(t.allocationPlan){for(const res of s.reservations.filter(x=>x.taskId===t.id)){res.executorId=t.executorId;for(const assignment of s.assignments.filter(x=>x.reservationId===res.id)){assignment.executorId=t.executorId;assignment.participantId=t.participantId;}}}
        if(r.status==='awaiting_assignment'&&s.tasks.filter(x=>x.requestId===r.id).every(x=>x.executorId)){r.status=s.lines.filter(l=>l.requestId===r.id).every(l=>Math.round(s.movements.filter(m=>m.lineId===l.id&&m.type==='purchase_receipt').reduce((n,m)=>n+m.delta,0)*1000)===Math.round(l.quantity*1000))?'received':s.movements.some(m=>m.requestId===r.id&&m.type==='purchase_receipt')?'partially_received':'awaiting_receipt';for(const task of s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='warehouse_receipt'))if(Math.round(s.movements.filter(m=>m.taskId===task.id&&m.type==='purchase_receipt').reduce((n,m)=>n+m.delta,0)*1000)===Math.round(task.quantity*1000))task.status='completed';}
        result={id:t.id};
    }
    else if(c.type==='complete_task') {
        const t=row(s,'tasks',c.taskId),r=row(s,'requests',t.requestId);
        demand(c.taskType===t.taskType,'Task type mismatch');
        demand(r.status!=='closed'&&t.status!=='completed'&&t.executorId,'Assigned open task required');
        demand(['pickup','documents','delivery'].includes(t.taskType),'أكمل المهمة من إجراء الاستلام المخصص');
        if(t.taskType==='documents') {t.completionNote=c.reason||'تم التنفيذ بدون مرفق';}
        else if(t.taskType==='pickup') {
            demand(s.reservations.some(x=>x.requestId===r.id)&&s.reservations.filter(x=>x.requestId===r.id).some(x=>x.status==='issued'),'Confirm pickup and load first / أكّد الاستلام والتحميل أولًا');
            if(r.loadingProtocol==='dual'){
                const confirmations=s.handoffs.filter(h=>h.type==='loading_confirmation'&&h.requestId===r.id&&h.executorId===t.executorId&&(!t.lineId||h.lineId===t.lineId));
                demand(confirmations.some(h=>h.status==='posted'&&(h.acceptedQuantity??h.courierQuantity)>0)&&confirmations.every(h=>h.status==='posted'),'إنهاء المهمة لا يؤكد كمية الاستلام؛ أكمل تأكيد المندوب الفعلي وحسم فروقه أولًا','STATE',409);
            }
        }
        else {
            demand(t.status==='arrived'||t.autoGenerated&&['arrived','delivering','delivered'].includes(r.status),'لم تُسجل وصول هذه المهمة');
            const delivered=taskDelivered(s,t),returned=returnAmount(s,t);
            demand(Math.abs(t.quantity-delivered-returned)<0.0001,'Task custody remains / توجد عهدة للمهمة');
            // Evidence is optional; quantity reconciliation is still required.
            for(const st of s.stops.filter(st=>st.taskId===t.id)) {st.status='completed';const route=row(s,'routes',st.routeId);if(s.stops.filter(x=>x.routeId===route.id).every(x=>x.status==='completed'))route.status='closed';}
        }
        t.status='completed';t.completedAt=now;t.completedBy=a.userId;result={id:t.id};
    }
    else if (c.type === 'submit') {
        const r = request();
        ensureStatus(r, ['draft']);
        if(r.demandPlan&&r.requestType!=='purchase_receipt')for(const line of s.lines.filter(l=>l.requestId===r.id))demand(Math.round(s.delivery_needs.filter(n=>n.requestId===r.id&&n.status!=='superseded'&&n.lineId===line.id).reduce((n,v)=>n+v.quantity,0)*1000)===Math.round(line.quantity*1000),'أكمل احتياجات تسليم كل منتج');
        if(s.tasks.some(t=>t.requestId===r.id)) for(const line of s.lines.filter(l=>l.requestId===r.id)) demand(Math.abs(s.tasks.filter(t=>t.lineId===line.id&&t.taskType==='delivery').reduce((n,t)=>n+t.quantity,0)-line.quantity)<0.0001,'Allocate every line across delivery tasks / وزّع كل كمية البند على مهام التسليم');
        r.status = 'review';
    }
    else if (c.type === 'approve') {
        const r = request();
        ensureStatus(r, ['review']);
        r.status = r.requestType==='purchase_receipt'?'awaiting_assignment':'approved';
        if(r.requestType==='purchase_receipt')for(const line of s.lines.filter(l=>l.requestId===r.id))add('tasks',{requestId:r.id,taskType:'warehouse_receipt',lineId:line.id,quantity:line.quantity,sourceAddress:r.supplierName,destination:r.destination,warehouseId:r.warehouseId,status:'planned',executorId:'',dueDate:r.dueDate});
        r.reviewedBy = a.userId;
        r.reviewedByName=a.name;
        for(const line of s.lines.filter(l=>l.requestId===r.id)){line.requestedQuantity??=line.quantity;line.approvedQuantity=line.quantity;}
        if(r.demandPlan)approveDeliveryNeeds(s,r,a,now);
    }
    else if (c.type === 'near_expiry') {
        const r = request();
        ensureStatus(r, ['approved']);
        const l = row(s, 'lines', c.lineId), b = row(s, 'batches', c.batchId);
        demand(l.requestId === r.id && b.productId === l.productId, 'Request, line and batch must match');
        const days = (Date.parse(b.expiryDate) - Date.parse(now.slice(0, 10))) / 86400000;
        demand(days > 0 && days <= 90, 'Only unexpired batches within 90 days / لا اعتماد لمنتج منتهي');
        const q = qty(c.quantity);
        demand(q <= l.quantity, 'Quantity exceeds request');
        result = { id: add('approvals', { requestId: r.id, lineId: l.id, batchId: b.id, quantity: q, reason: text(c.reason), approvedBy: a.userId, status: 'approved' }).id };
    }
    else if (c.type === 'reserve') {
        const r = request(); demand(!r.allocationPlan,'اختر الدفعات والكميات لكل مهمة من خطة التوزيع'); demand(r.requestType!=='purchase_receipt','لا حجز أو صرف لطلب استلام / Receipt cannot reserve stock');
        ensureStatus(r, ['approved']);
        for (const l of s.lines.filter(x => x.requestId === r.id)) {
            const p = row(s, 'products', l.productId);
            let need = Math.round((l.quantity-s.reservations.filter(x=>x.requestId===r.id&&x.lineId===l.id).reduce((n,x)=>n+x.quantity,0))*1000)/1000;
            const keys = [...new Set(s.movements.filter(x => x.productId === p.id && (!c.warehouseId || x.warehouseId === c.warehouseId)).map(x => `${x.warehouseId}|${x.batchId || ''}`))];
            const candidates = keys.map(key => { const [warehouseId, batchId] = key.split('|'); return { warehouseId, batchId, b: s.batches.find(x => x.id === batchId) }; }).sort((a, b) => (a.b?.expiryDate || '9999').localeCompare(b.b?.expiryDate || '9999'));
            for (const cand of candidates) {
                if (need <= 0)
                    break;
                const available = balance(s, p.id, cand.warehouseId, cand.batchId).available;
                let q = Math.min(need, available);
                if (q <= 0)
                    continue;
                if (p.expiry && cand.b) {
                    const days = (Date.parse(cand.b.expiryDate) - Date.parse(now.slice(0, 10))) / 86400000;
                    if (days > 0 && days <= 90) {
                        const approval = s.approvals.find(x => (!x.type||x.type==='near_expiry') && x.requestId === r.id && x.lineId === l.id && x.batchId === cand.b!.id && x.status === 'approved');
                        const allocated = s.reservations.filter(x => x.requestId === r.id && x.lineId === l.id && x.batchId === cand.b!.id).reduce((n, x) => n + x.quantity, 0);
                        q = Math.min(q, (approval?.quantity || 0) - allocated);
                    }
                }
                if (q <= 0 || !batchEligible(p, cand.b, r.id, l.id, q))
                    continue;
                add('reservations', { requestId: r.id, lineId: l.id, productId: p.id, warehouseId: cand.warehouseId, batchId: cand.batchId, quantity: q, status: 'held' });
                need = Math.round((need - q) * 1000) / 1000;
            }
            demand(need === 0, `Insufficient eligible stock: ${p.code} / الرصيد المؤهل غير كافٍ`, 'STOCK', 409);
        }
        r.status = 'reserved';
    }
    else if (c.type === 'split_reservation') {
        const r = request();
        ensureStatus(r, ['reserved', 'assigned']);
        demand(!r.allocationPlan,'الخطة تربط كل حجز بمهمته؛ تعديلها قبل الحجز فقط');
        const res = row(s, 'reservations', c.reservationId);
        demand(res.requestId === r.id && res.status === 'held', 'Only held reservations can be split');
        const q = qty(c.quantity);
        demand(q < res.quantity, 'Split quantity must be less than reserved / الكمية أقل من الحجز');
        res.quantity = Math.round((res.quantity - q) * 1000) / 1000;
        const existingTask=s.tasks.find(t=>t.autoGenerated&&t.reservationId===res.id);if(existingTask)existingTask.quantity=res.quantity;
        const { id: oldId, code: oldCode, ...copy } = res;
        add('reservations', { ...copy, quantity: q });
        r.status = 'reserved';
    }
    else if (c.type === 'assign') {
        const r = request();
        ensureStatus(r, ['reserved', 'assigned']);
        demand(!r.allocationPlan,'الخطة تربط كل حجز بمهمته؛ تعديلها قبل الحجز فقط');
        const res = row(s, 'reservations', c.reservationId);
        demand(res.requestId === r.id, 'Reservation/request mismatch');
        const participantId = c.participantId ? row(s, 'resources', c.participantId).id : '';
        demand(!participantId || participantId !== c.executorId, 'Choose a different participant / اختر مشاركًا مختلفًا');
        const v = { requestId: r.id, reservationId: res.id, warehouseId: res.warehouseId, executorId: row(s, 'resources', c.executorId).id, participantId, carrierId: row(s, 'carriers', c.carrierId).id };
        const existing = s.assignments.find(x => x.reservationId === res.id);
        if (existing)
            Object.assign(existing, v);
        else
            add('assignments', v);
        if(!s.tasks.some(t=>t.requestId===r.id&&t.taskType==='delivery'&&!t.autoGenerated)){const task=s.tasks.find(t=>t.reservationId===res.id&&t.autoGenerated);const values={requestId:r.id,taskType:'delivery',autoGenerated:true,reservationId:res.id,lineId:res.lineId,quantity:res.quantity,executorId:v.executorId,participantId:v.participantId,sourceAddress:row(s,'warehouses',res.warehouseId).name,destination:r.destination,dueDate:r.dueDate,status:'planned'};if(task)Object.assign(task,values);else add('tasks',values);}
        if (s.reservations.filter(x => x.requestId === r.id).every(x => s.assignments.some(y => y.reservationId === x.id)))
            r.status = 'assigned';
    }
    else if (c.type === 'upload') {
        const r = request();
        demand(r.status !== 'closed'||s.tasks.some(t=>t.id===c.taskId&&t.requestId===r.id&&t.taskType==='return'&&t.status!=='completed'), 'Closed request cannot receive new files');
        demand(c.file && typeof c.file.key === 'string', 'Stored file required');
        const uploadTask=c.taskId?row(s,'tasks',c.taskId):undefined; demand(!uploadTask||uploadTask.requestId===r.id,'المهمة لا تخص الطلب');
        result = { id: add('documents', { taskId:uploadTask?.id||'', requestId: r.id, name: text(c.file.name), objectKey: c.file.key, uploadedByName:a.name, size: c.file.size, mime: c.file.mime, purpose: ['shipping', 'pod', 'other'].includes(c.purpose) ? c.purpose : 'shipping', verified: false }).id };
    }
    else if (c.type === 'verify_documents') {
        const r = request();
        ensureStatus(r, ['assigned']);
        demand(s.tasks.filter(t=>t.requestId===r.id&&['delivery','pickup','documents'].includes(t.taskType)).every(t=>t.executorId),'مسؤول الحركة يحدد المسؤول لكل مهمة أولًا');
        const docs = s.documents.filter(x => x.requestId === r.id && x.purpose === 'shipping');
        // Continuing without shipping attachments is explicitly supported.
        docs.forEach(x => { x.verified = true; x.verifiedBy = a.userId; });
        r.status = 'documents_ready';
    }
    else if(c.type==='create_route'&&c.taskIds) {
        demand(Array.isArray(c.taskIds)&&c.taskIds.length>0&&c.taskIds.length<=30,'Select 1–30 delivery tasks');
        const ids=[...new Set(c.taskIds)] as string[];
        const rt=add('routes',{code:code(c.code),name:text(c.name),status:'planned',date:validDay(c.date||now.slice(0,10))});
        ids.forEach((id,i)=>{const t=row(s,'tasks',id),r=row(s,'requests',t.requestId);ensureStatus(r,['documents_ready']);demand(t.taskType==='delivery'&&!t.routeId&&t.executorId,'Assigned delivery task without a route required');t.routeId=rt.id;add('stops',{requestId:r.id,taskId:t.id,routeId:rt.id,sequence:i+1,destination:t.destination,status:'planned'});});
        for(const rid of new Set(ids.map(id=>row(s,'tasks',id).requestId))) {const r=row(s,'requests',rid);if(s.tasks.filter(t=>t.requestId===rid&&t.taskType==='delivery').every(t=>t.routeId))r.status='ready';}
        result={id:rt.id};
    }
    else if (c.type === 'create_route') {
        demand(Array.isArray(c.requestIds) && c.requestIds.length > 0 && c.requestIds.length <= 30, 'Select up to 30 requests / اختر الطلبات');
        const ids = [...new Set(c.requestIds)] as string[];
        demand(!s.tasks.some(t=>ids.includes(t.requestId)&&!t.autoGenerated),'Use delivery-task route planning / استخدم تخطيط الرحلة بالمهام');
        const route = add('routes', { code: code(c.code), name: text(c.name), status: 'planned', date: c.date || now.slice(0, 10) });
        ids.forEach((rid, i) => { const r = row(s, 'requests', rid); ensureStatus(r, ['documents_ready']); add('stops', { requestId: rid, routeId: route.id, sequence: i + 1, destination: r.destination, status: 'planned' }); for(const task of s.tasks.filter(t=>t.requestId===rid&&t.autoGenerated))task.routeId=route.id; for (const as of s.assignments.filter(x => x.requestId === rid))
            as.routeId = route.id; r.status = 'ready'; });
        result = { id: route.id };
    }
    else if (c.type === 'load') {
        const r = request();
        ensureStatus(r, ['ready']);
        for (const res of s.reservations.filter(x => x.requestId === r.id)) {
            demand(res.status === 'held', 'Reservation already issued');
            const p = row(s, 'products', res.productId);
            demand(batchEligible(p, s.batches.find(x => x.id === res.batchId), r.id, res.lineId, s.reservations.filter(x => x.requestId === r.id && x.lineId === res.lineId && x.batchId === res.batchId).reduce((n, x) => n + x.quantity, 0)), 'Batch no longer eligible / الدفعة غير صالحة للصرف', 'EXPIRY', 409);
            demand(balance(s, p.id, res.warehouseId, res.batchId).onHand >= res.quantity, 'Insufficient stock');
            mv({ type: 'issue', requestId: r.id, reservationId: res.id, productId: p.id, warehouseId: res.warehouseId, batchId: res.batchId, delta: -res.quantity, reason: 'Pickup confirmed and loaded' });
            res.status = 'issued';
        }
        r.status = 'loaded';
    }
    else if (c.type === 'depart') {
        const rt = row(s, 'routes', c.routeId);
        ensureStatus(rt, ['planned']);
        const stops = s.stops.filter(x => x.routeId === rt.id);
        demand(stops.every(st => st.taskId?s.reservations.some(x=>x.requestId===st.requestId&&x.status==='issued'&&(!row(s,'tasks',st.taskId).allocationPlan||x.taskId===st.taskId))&&s.tasks.filter(t=>t.requestId===st.requestId&&['pickup','documents'].includes(t.taskType)).every(t=>t.status==='completed'):row(s, 'requests', st.requestId).status === 'loaded'), 'Load every routed task and complete pickup/document tasks before departure / حمّل كل مهمة في الرحلة وأكمل مهام الاستلام والمستندات قبل المغادرة');
        rt.status = 'in_transit';
        rt.departedAt = now;
        for (const st of stops) { if(st.taskId)row(s,'tasks',st.taskId).status='in_transit';else for(const t of s.tasks.filter(t=>t.requestId===st.requestId&&t.autoGenerated))t.status='in_transit';const r=row(s,'requests',st.requestId);if(r.status==='loaded')r.status='in_transit'; }
    }
    else if (c.type === 'arrive') {
        const st = row(s, 'stops', c.stopId);
        const rt = row(s, 'routes', st.routeId);
        ensureStatus(rt, ['in_transit']);
        ensureStatus(st, ['planned', 'failed']);
        demand(!s.stops.some(x => x.routeId === rt.id && x.sequence < st.sequence && !['arrived', 'completed'].includes(x.status)), 'Complete preceding stop / أكمل المحطة السابقة');
        st.status = 'arrived';
        st.arrivedAt = now;
        if(st.taskId)row(s,'tasks',st.taskId).status='arrived';else for(const t of s.tasks.filter(t=>t.requestId===st.requestId&&t.autoGenerated))t.status='arrived';
        const r=row(s,'requests',st.requestId);if(r.status!=='delivering')r.status='arrived';
    }
    else if (c.type === 'deliver') {
        const r = request();
        ensureStatus(r, ['arrived', 'delivering']);
        const res = row(s, 'reservations', c.reservationId);
        demand(res.requestId === r.id && res.status === 'issued', 'Reservation/request mismatch');
        const q = qty(c.quantity);
        const delivered = s.deliveries.filter(x => x.reservationId === res.id).reduce((n, x) => n + x.quantity, 0);
        const returned = s.returns.filter(x => x.reservationId === res.id && x.source === 'custody').reduce((n, x) => n + x.quantity, 0);
        demand(q <= res.quantity - delivered - returned - pendingFor(s,'reservationId',res.id)-pendingPresentation(s,'reservationId',res.id), 'Quantity exceeds remaining custody / الكمية تتجاوز عهدة النقل');
        const deliveredTaskId=deliveryTask(r,res,q);const deliveredTask=s.tasks.find(t=>t.id===deliveredTaskId);const proof=optionalEvidence(s,c,r,a,now,deliveredTask);
        add('deliveries', { documentId:proof?.id||'', taskId:deliveredTaskId, requestId: r.id, reservationId: res.id, productId: res.productId, quantity: q, recipient: text(c.recipient) });
        r.status = 'delivering';if(deliveredTask?.autoGenerated&&Math.abs(deliveredTask.quantity-s.deliveries.filter(d=>d.taskId===deliveredTask.id).reduce((n,d)=>n+d.quantity,0)-returnAmount(s,deliveredTask))<0.0001)deliveredTask.status='completed';
    }
    else if (c.type === 'pod') {
        const r = request();
        ensureStatus(r, ['delivering', 'delivered', 'arrived']);
        demand(s.deliveries.some(x => x.requestId === r.id), 'No delivered quantity / لا توجد كمية مسلمة');
        const doc=optionalEvidence(s,c,r,a,now);
        const taskRows=c.taskId?[row(s,'tasks',text(c.taskId))]:s.tasks.filter(t=>t.requestId===r.id&&t.autoGenerated&&s.deliveries.some(d=>d.taskId===t.id));
        demand(taskRows.length||!s.tasks.some(t=>t.requestId===r.id&&t.taskType==='delivery'),'اختر مهمة التسليم');
        for(const t of taskRows){demand(t.requestId===r.id&&s.deliveries.some(d=>d.taskId===t.id),'المهمة لا تحتوي تسليمًا');demand(!doc?.taskId||doc.taskId===t.id,'Use separate POD / المستند مرتبط بمهمة أخرى');if(doc&&!t.autoGenerated)demand(!s.pods.some(p=>p.documentId===(doc?.id||'')&&p.taskId!==t.id),'Use separate POD per destination / إثبات مستقل لكل وجهة');if(!s.pods.some(p=>p.taskId===t.id&&p.documentId===(doc?.id||'')))add('pods',{taskId:t.id,requestId:r.id,documentId:doc?.id||'',recipient:text(c.recipient),signedAt:now});if(t.autoGenerated&&Math.abs(t.quantity-s.deliveries.filter(d=>d.taskId===t.id).reduce((n,d)=>n+d.quantity,0)-returnAmount(s,t))<0.0001)t.status='completed';}
        if(!taskRows.length)add('pods',{taskId:'',requestId:r.id,documentId:doc?.id||'',recipient:text(c.recipient),signedAt:now});
        if(doc&&taskRows.length===1)bindEvidence(s,doc,taskRows[0],'pod',a,now);if(doc)doc.verified=true;
    }
    else if (c.type === 'close') {
        const r = request();
        ensureStatus(r, ['arrived', 'delivering', 'delivered']);
        const res = s.reservations.filter(x => x.requestId === r.id);
        demand(res.every(x => Math.abs(x.quantity - s.deliveries.filter(d => d.reservationId === x.id).reduce((n, d) => n + d.quantity, 0) - s.returns.filter(d => d.reservationId === x.id && d.source === 'custody').reduce((n, d) => n + d.quantity, 0)) < 0.0001), 'Unaccounted custody remains / توجد كميات لم تسلم أو ترتجع');
        // A file is never required to close reconciled quantities.
        demand(!s.exceptions.some(x => x.requestId === r.id && !x.resolved), 'Resolve open exceptions first / أغلق الاستثناءات أولًا');
        demand(s.tasks.filter(t=>t.requestId===r.id).every(t=>t.status==='completed'),'Complete all request tasks first / أكمل كل مهام الطلب أولًا');
        r.status = 'closed';
        r.closedAt = now;
        for (const st of s.stops.filter(x => x.requestId === r.id)) {
            st.status = 'completed';
            const rt = row(s, 'routes', st.routeId);
            if (s.stops.filter(x => x.routeId === rt.id).every(x => x.status === 'completed'))
                rt.status = 'closed';
        }
    }
    else if (c.type === 'exception') {
        const r = request();
        demand(r.status !== 'closed', 'Request is closed');
        const task=c.taskId?row(s,'tasks',text(c.taskId)):undefined;demand(!task||task.requestId===r.id,'المهمة لا تخص الطلب');
        const candidates=s.stops.filter(x=>x.requestId===r.id&&(!task||x.taskId===task.id)),st=candidates.length===1?candidates[0]:undefined;
        if (c.failed) {
            demand(!extended(r)&&r.requestType!=='purchase_receipt','لطلب الاستلام سجل المشكلة دون تعذر تسليم / Receipt cannot fail delivery');
            demand(!task||task.taskType==='delivery','اختر مهمة التسليم المتعذر');
            demand(candidates.length<=1,'اختر مهمة الوجهة التي تعذر تسليمها؛ الطلب له أكثر من محطة');
            if (st)
                st.status = 'failed';
        }
        result = { id: add('exceptions', { requestId:r.id,taskId:task?.id||'',failed:!!c.failed,reason:text(c.reason),resolved:false,destination:task?.destination||st?.destination||r.destination,executorId:task?.executorId||'',customerId:task?.customerId||r.customerId||'',productId:task?.lineId?row(s,'lines',task.lineId).productId:'',arrivedAt:st?.arrivedAt||'' }).id };
    }
    else if (c.type === 'resolve_exception') {
        demand(['owner', 'manager'].includes(a.role) || a.function === 'operations', 'Manager or operations required', 'FORBIDDEN', 403);
        const e = row(s, 'exceptions', c.id);
        demand(e.type!=='loading_difference','فرق التحميل يحتاج قرار معالجة موثق من شاشة الكميات','STATE',409);
        e.resolved = true;
        e.resolution = text(c.reason);
        e.resolvedBy = a.userId;
    }
    else if (c.type === 'handoff') {
        demand(!s.requests.find(r=>r.id===s.assignments.find(x=>x.id===c.assignmentId)?.requestId)?.allocationPlan,'استخدم تأكيد المندوب المسلم ثم المستلم لنقل العهدة');
        const as = row(s, 'assignments', c.assignmentId);
        demand(row(s,'reservations',as.reservationId).status!=='issued','العهدة المحملة تحتاج تأكيد المسلم والمستلم');
        const r = row(s, 'requests', as.requestId);
        demand(!['closed', 'draft'].includes(r.status), 'Cannot hand off this request');
        const target = row(s, 'resources', c.toId);
        demand(target.id !== as.executorId, 'Choose a different executor');
        add('handoffs', { requestId: r.id, reservationId: as.reservationId, fromId: as.executorId, toId: target.id, reason: text(c.reason) });
        as.executorId = target.id;for(const t of s.tasks.filter(t=>t.reservationId===as.reservationId&&t.status!=='completed'))t.executorId=target.id;
    }
    else if (c.type === 'reverse') {
        const m = row(s, 'movements', c.movementId);
        demand(m.type === 'opening', 'Use return workflow for issued stock / استخدم المرتجع للصرف');
        demand(!s.movements.some(x => x.movementId === m.id && x.type === 'reversal'), 'Already reversed');
        demand(balance(s, m.productId, m.warehouseId, m.batchId).available >= m.delta, 'Stock already used / الرصيد مستخدم');
        demand(!s.reservations.some(x => x.productId === m.productId && x.warehouseId === m.warehouseId), 'Dependent reservations exist / توجد حجوزات مرتبطة');
        mv({ type: 'reversal', movementId: m.id, productId: m.productId, warehouseId: m.warehouseId, batchId: m.batchId, delta: -m.delta, reason: text(c.reason) });
    }
    else if (c.type === 'import') {
        demand(Array.isArray(c.rows) && c.rows.length > 0 && c.rows.length <= 2000, 'Import 1–2000 rows / حد الاستيراد 2000 صف');
        demand(!s.imports.some(x => x.signature === c.signature), 'This file was imported before / تم استيراد الملف من قبل', 'DUPLICATE', 409);
        const mode=c.mode||'add';demand(['add','update'].includes(mode),'Choose add or update / اختر إضافة أو تحديث');
        demand(mode!=='update'||masterKinds.includes(c.kind)&&c.kind!=='batches','Updates change master names only / التحديث لأسماء البيانات الأساسية فقط');
        const batch = add('imports', { name: text(c.name), kind: c.kind, mode, signature: text(c.signature), count: c.rows.length, status: 'applied', errors: 0 });
        const errors: any[] = [];
        const seen=new Set<string>();
        c.rows.forEach((data: any, i: number) => { const before = structuredClone(s); try {
            const issues=importRowErrors(c.kind,data,s,i+2,mode);if(issues.length){errors.push(...issues);return;}
            if(c.kind!=='opening'){const match=String(data.code||'').toLowerCase();demand(!seen.has(match),'Duplicate code inside file / كود مكرر داخل الملف','DUPLICATE',409);seen.add(match);}
            if(mode==='update'){const existing=s[c.kind as Kind].find(r=>r.code.toLowerCase()===data.code.toLowerCase());demand(existing,'Update code not found / كود التحديث غير موجود','NOT_FOUND',404);batch.changes=[...(batch.changes||[]),{id:existing.id,code:existing.code,previousName:existing.name,name:data.name}];existing.name=text(data.name);existing.updatedAt=now;existing.updatedBy=a.userId;return;}
            if (c.kind === 'opening')
                opening(data, batch.id);
            else if (c.kind === 'requests')
                createRequest({ ...data, lines: data.lines || [{ productId: data.productId, quantity: data.quantity }] }, batch.id);
            else
                master(c.kind, data, batch.id);
        }
        catch (e) {
            for (const k of kinds)
                s[k] = before[k];
            errors.push({ row: data.__sourceRow || i + 2, column: c.kind==='opening'?'quantity / batchCode':'code / references',value:String(data.code||data.productCode||''),expected:'Existing references and unique valid code / مراجع صحيحة وكود صالح غير مكرر',message: e instanceof Error ? e.message : String(e) });
        } });
        demand(errors.length === 0, JSON.stringify(errors), 'IMPORT_ERRORS', 422);
        result = { id: batch.id, count: c.rows.length };
    }
    else if (c.type === 'undo_import') {
        const b = row(s, 'imports', c.importId);
        demand(b.status === 'applied', 'Import already undone');
        demand(b.mode!=='update','Imported updates require a recorded correction / التحديث المستورد يحتاج تصحيحًا مسجلًا');
        demand(!['opening', 'requests'].includes(b.kind), 'Posted balances/requests require documented correction / الأرصدة والطلبات تحتاج مسار تصحيح');
        const deleting = new Set(kinds.flatMap(k => s[k].filter(x => x.importId === b.id).map(x => x.id)));
        for (const k of kinds)
            for (const r of s[k])
                if (!deleting.has(r.id))
                    demand(!references(k, r).some(([, id]) => deleting.has(id)), 'Imported records have dependencies / سجلات الاستيراد مستخدمة');
        for (const k of kinds)
            s[k] = s[k].filter(x => !deleting.has(x.id));
        b.status = 'undone';
        b.reason = text(c.reason);
    }
    else
        demand(false, 'Unknown operation / إجراء غير معروف');
    for(const d of s.deliveries.filter(d=>!original.deliveries.some(x=>x.id===d.id))){const t=s.tasks.find(t=>t.id===d.taskId),res=s.reservations.find(x=>x.id===d.reservationId),h=s.handoffs.find(x=>x.id===d.collectionId),r=s.requests.find(r=>r.id===d.requestId),planned=t?.quantity||res?.quantity||h?.quantity,delivered=s.deliveries.filter(x=>t?x.taskId===t.id:res?x.reservationId===res.id:x.collectionId===h?.id).reduce((n,x)=>n+x.quantity,0);Object.assign(d,{visitId:c.visitId||crypto.randomUUID(),deliveryEventId:c.deliveryEventId||crypto.randomUUID(),plannedQuantity:planned,deliveryOutcome:planned&&Math.round(delivered*1000)>=Math.round(planned*1000)?'full':'partial',executorId:d.performerType==='carrier'?'':t?.executorId||res?.executorId,customerId:t?.customerId||r?.customerId,batchId:res?.batchId||h?.batchId||'',siteId:d.siteId||t?.siteId||'',addressSnapshot:d.addressSnapshot||t?.addressSnapshot||t?.destination||r?.destination||'',destinationSnapshot:d.destinationSnapshot||d.addressSnapshot||t?.addressSnapshot||t?.destination||r?.destination||''});}
    for(const t of s.tasks){const before=original.tasks.find(x=>x.id===t.id);const touched=!before||JSON.stringify({...before,history:undefined})!==JSON.stringify({...t,history:undefined})||c.taskId===t.id||(c.reservationId&&t.reservationId===c.reservationId);if(touched)t.history=[...(t.history||[]),{at:now,actor:a.name,action:c.type,status:t.status,quantity:c.quantity||null,documentId:c.documentId||'',from:t.sourceAddress||'',to:t.destination}];}
    for (const r of s.requests) {
        const previous = original.requests.find(x=>x.id===r.id);
        if (previous?.status !== r.status) {
            r.stageEnteredAt = now;
            r.timeline = [...(r.timeline || []), {from:previous?.status || null,to:r.status,at:now,actor:a.name,action:c.type}];
        }
    }
    afterJourneyAction(s,a,c,now,add,result,original);
    for (const k of kinds)
        for (const r of s[k])
            for (const [rk, rid] of references(k, r))
                row(s, rk, rid);
    assertStockTransition(original,s);
    assertExternalTransportIntegrity(s);
    return { state: s, result };
}
export function validateImport(s: State, a: Actor, c: Command) { try {
    execute(s, a, { ...c, type: 'import', signature: 'preview-' + crypto.randomUUID() });
    return { valid: true, count: c.rows.length, added:c.mode==='update'?0:c.rows.length,updated:c.mode==='update'?c.rows.length:0,rejected:0,policy:'all-or-nothing',errors: [] };
}
catch (e: any) {
    if (e.code === 'IMPORT_ERRORS')
        return { valid: false, count: c.rows?.length || 0, errors: JSON.parse(e.message) };
    return { valid: false, count: c.rows?.length || 0, errors: [{ row: 0, message: e.message }] };
} }
