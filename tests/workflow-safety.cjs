const assert=require('node:assert/strict');
const {execute}=require('../.sites-runtime/test-domain/engine.js');
const {emptyState,balance}=require('../.sites-runtime/test-domain/model.js');
const {reservationOptions}=require('../.sites-runtime/test-domain/batch-selection.js');
const owner={userId:'OWNER',name:'Owner',role:'owner',function:'all',active:1};
const now='2026-10-14T00:00:00Z';let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function fixture(){
 let s=execute(emptyState(),owner,{type:'seed'},now).state;
 const act=c=>{const out=execute(s,owner,c,now);s=out.state;return out.result;};
 const p=s.products[0],w=s.warehouses[0],w2=s.warehouses[1],e=s.resources[0],e2=s.resources[1],customer=s.customers[0],carrier=s.carriers[0];
 act({type:'opening',productCode:p.code,warehouseId:w2.id,quantity:120,reason:'TEST'});
 const delivery=code=>{
  const id=act({type:'create_request',requestType:'delivery',code,projectId:p.projectId,customerId:customer.id,destination:'Two sites',lines:[{productId:p.id,quantity:30}]}).id;
  const line=s.lines.find(l=>l.requestId===id),rows=[{lineId:line.id,quantity:20,destination:'Site A',customerId:customer.id,executorId:e.id,sourceWarehouseId:w.id,carrierId:carrier.id},{lineId:line.id,quantity:10,destination:'Site B',customerId:customer.id,executorId:e.id,sourceWarehouseId:w2.id,carrierId:carrier.id}];
  act({type:'plan_allocations',requestId:id,rows});act({type:'submit',requestId:id});act({type:'approve',requestId:id});reserve(id);return id;
 };
 const reserve=id=>act({type:'reserve',requestId:id,batchRows:reservationOptions(s,s.requests.find(r=>r.id===id),now).map(o=>({...o.values,quantity:o.remaining}))});
 return {get s(){return s},act,p,w,w2,e,e2,customer,carrier,delivery,reserve};
}
test('A before-load reset is atomic, keeps task IDs and detaches only its own unstarted stops',()=>{
 const f=fixture(),id=f.delivery('SAFE-REPLAN'),other=f.delivery('SAFE-OTHER');
 f.act({type:'verify_documents',requestId:id});f.act({type:'verify_documents',requestId:other});
 const tasks=f.s.tasks.filter(t=>t.requestId===id),otherTasks=f.s.tasks.filter(t=>t.requestId===other);
 const route=f.act({type:'create_route',code:'SAFE-ROUTE',name:'Shared unstarted route',taskIds:[...tasks,...otherTasks].map(t=>t.id)}).id;
 const rows=tasks.map(t=>({...t,destination:t.destination+' revised'})),before=structuredClone(f.s),stock=balance(f.s,f.p.id).onHand;
 assert.throws(()=>f.act({type:'plan_allocations',requestId:id,rows}));assert.deepEqual(f.s,before);
 assert.throws(()=>f.act({type:'plan_allocations',requestId:id,reason:'TEST reset',rows:rows.map((x,i)=>({...x,quantity:i?x.quantity:x.quantity+1}))}));assert.deepEqual(f.s,before);
 f.act({type:'plan_allocations',requestId:id,rows,reason:'Change destination before loading'});
 assert.equal(f.s.requests.find(r=>r.id===id).status,'approved');assert.equal(balance(f.s,f.p.id).onHand,stock);
 assert.equal(f.s.reservations.filter(x=>x.requestId===id).length,0);assert.equal(f.s.assignments.filter(x=>x.requestId===id).length,0);
 assert.deepEqual(f.s.tasks.filter(t=>t.requestId===id).map(t=>t.id),tasks.map(t=>t.id));
 assert.equal(f.s.stops.filter(st=>st.requestId===id).length,0);assert.equal(f.s.stops.filter(st=>st.requestId===other&&st.routeId===route).length,2);
 assert(f.s.routes.some(rt=>rt.id===route));assert(f.s.tasks.filter(t=>t.requestId===other).every(t=>t.routeId===route));
 const audit=f.s.requests.find(r=>r.id===id).changes.at(-1);assert.equal(audit.action,'reset_unloaded_plan');assert.equal(audit.releasedReservations.length,2);assert.equal(audit.reason,'Change destination before loading');
 f.reserve(id);assert.equal(f.s.requests.find(r=>r.id===id).status,'assigned');
});
test('Held allocation assignment stays aligned, while loaded assignment cannot bypass handover',()=>{
 const f=fixture(),id=f.delivery('SAFE-ASSIGN'),t=f.s.tasks.find(t=>t.requestId===id);
 f.act({type:'assign_task',taskId:t.id,executorId:f.e2.id});
 const res=f.s.reservations.find(x=>x.taskId===t.id);assert.equal(res.executorId,f.e2.id);assert.equal(f.s.assignments.find(x=>x.reservationId===res.id).executorId,f.e2.id);
 f.act({type:'verify_documents',requestId:id});f.act({type:'create_route',code:'SAFE-AS-ROUTE',name:'TEST',taskIds:f.s.tasks.filter(t=>t.requestId===id).map(t=>t.id)});
 f.act({type:'pickup_actual',requestId:id,reservationId:res.id,quantity:5});const before=structuredClone(f.s);
 assert.throws(()=>f.act({type:'assign_task',taskId:t.id,executorId:f.e.id}));assert.deepEqual(f.s,before);
 assert.throws(()=>f.act({type:'plan_allocations',requestId:id,reason:'Forbidden loaded reset',rows:f.s.tasks.filter(t=>t.requestId===id)}));assert.deepEqual(f.s,before);
});
test('A warehouse loading signature survives and blocks a plan reset before stock is posted',()=>{
 const f=fixture(),id=f.delivery('SAFE-SIGNATURE');f.s.requests.find(r=>r.id===id).loadingProtocol='dual';
 f.act({type:'verify_documents',requestId:id});f.act({type:'create_route',code:'SAFE-SIG-ROUTE',name:'TEST',taskIds:f.s.tasks.filter(t=>t.requestId===id).map(t=>t.id)});
 const res=f.s.reservations.find(x=>x.requestId===id),h=f.act({type:'warehouse_release',requestId:id,reservationId:res.id,quantity:res.quantity}).id,before=structuredClone(f.s);
 assert.throws(()=>f.act({type:'plan_allocations',requestId:id,reason:'Cannot erase signature',rows:f.s.tasks.filter(t=>t.requestId===id)}),/تأكيد تحميل/);
 assert.deepEqual(f.s,before);assert.equal(f.s.handoffs.find(x=>x.id===h).status,'awaiting_courier');
});
test('Two same-product same-courier destinations keep independent source and return custody',()=>{
 const f=fixture(),id=f.act({type:'create_request',requestType:'distribution',code:'SAFE-SOURCE',projectId:f.p.projectId,sourceWarehouseId:f.w.id,lines:[{productId:f.p.id,quantity:30}]}).id;
 f.act({type:'submit',requestId:id});f.act({type:'approve',requestId:id});const line=f.s.lines.find(l=>l.requestId===id);
 const a=f.act({type:'op_plan',requestId:id,lineId:line.id,quantity:20,executorId:f.e.id,sourceWarehouseId:f.w.id,destinationKind:'customer',customerId:f.customer.id,destination:'Site A'}).id;
 const b=f.act({type:'op_plan',requestId:id,lineId:line.id,quantity:10,executorId:f.e.id,sourceWarehouseId:f.w2.id,destinationKind:'customer',customerId:f.customer.id,destination:'Site B'}).id;
 f.act({type:'op_authorize',requestId:id});f.act({type:'op_reserve',requestId:id,batchRows:reservationOptions(f.s,f.s.requests.find(r=>r.id===id),now).map(o=>({...o.values,quantity:o.remaining}))});
 const old=structuredClone(f.s),replan={type:'op_plan',requestId:id,taskId:b,lineId:line.id,quantity:10,executorId:f.e.id,sourceWarehouseId:f.w2.id,destinationKind:'customer',customerId:f.customer.id,destination:'Site B revised'};
 assert.throws(()=>f.act(replan));assert.deepEqual(f.s,old);
 f.act({...replan,reason:'Before-loading destination correction'});assert.equal(f.s.requests.find(r=>r.id===id).status,'approved');assert.equal(f.s.reservations.filter(x=>x.requestId===id).length,0);assert(!f.s.requests.find(r=>r.id===id).authorizationCode);assert(f.s.tasks.some(t=>t.id===b));
 f.act({type:'op_authorize',requestId:id});f.act({type:'op_reserve',requestId:id,batchRows:reservationOptions(f.s,f.s.requests.find(r=>r.id===id),now).map(o=>({...o.values,quantity:o.remaining}))});
 const ra=f.s.reservations.find(x=>x.taskId===a),rb=f.s.reservations.find(x=>x.taskId===b);
 f.act({type:'pickup_actual',requestId:id,reservationId:ra.id,quantity:20});f.act({type:'pickup_actual',requestId:id,reservationId:rb.id,quantity:10});f.act({type:'op_arrive',requestId:id,taskId:b});
 const before=structuredClone(f.s);assert.throws(()=>f.act({type:'op_deliver',requestId:id,taskId:b,sourceId:ra.id,quantity:1,recipient:'TEST'}));assert.deepEqual(f.s,before);
 assert.throws(()=>f.act({type:'plan_return',requestId:id,taskId:b,sourceId:ra.id,source:'custody',quantity:1,warehouseId:f.w.id,reason:'Forged source'}));assert.deepEqual(f.s,before);
 assert.throws(()=>f.act({type:'plan_return',requestId:id,taskId:b,reservationId:ra.id,source:'custody',quantity:1,warehouseId:f.w.id,reason:'Forged reservation'}));assert.deepEqual(f.s,before);
 f.act({type:'op_deliver',requestId:id,taskId:b,quantity:4,recipient:'Site B receiver'});
 const delivery=f.s.deliveries.find(d=>d.taskId===b);assert.equal(delivery.reservationId,rb.id);assert.equal(delivery.plannedQuantity,10);assert.equal(delivery.deliveryOutcome,'partial');
 const ret=f.act({type:'plan_return',requestId:id,taskId:b,source:'custody',quantity:2,warehouseId:f.w.id,reason:'Own task return'}).id;
 assert(f.s.handoffs.filter(h=>h.taskId===ret&&h.type==='return_plan').every(h=>h.reservationId===rb.id));
});
test('Failed-delivery events identify their actual task and preserve arrival evidence',()=>{
 const f=fixture(),id=f.delivery('SAFE-FAIL');f.act({type:'verify_documents',requestId:id});f.act({type:'create_route',code:'SAFE-FAIL-ROUTE',name:'TEST',taskIds:f.s.tasks.filter(t=>t.requestId===id).map(t=>t.id)});
 const before=structuredClone(f.s);assert.throws(()=>f.act({type:'exception',requestId:id,failed:true,reason:'Ambiguous failure'}));assert.deepEqual(f.s,before);
 for(const res of f.s.reservations.filter(x=>x.requestId===id))f.act({type:'pickup_actual',requestId:id,reservationId:res.id,quantity:res.quantity});
 const route=f.s.routes.find(rt=>rt.code==='SAFE-FAIL-ROUTE');f.act({type:'depart',routeId:route.id});const stop=f.s.stops.find(st=>st.requestId===id);f.act({type:'arrive',stopId:stop.id});
 const exception=f.act({type:'exception',requestId:id,taskId:stop.taskId,failed:true,reason:'Recipient refused'}).id;
 const event=f.s.exceptions.find(x=>x.id===exception),task=f.s.tasks.find(t=>t.id===stop.taskId);assert.equal(event.failed,true);assert.equal(event.taskId,task.id);assert.equal(event.destination,task.destination);assert.equal(event.productId,f.p.id);assert.equal(event.executorId,task.executorId);assert.equal(event.arrivedAt,now);
 assert.equal(f.s.stops.find(st=>st.id===stop.id).status,'failed');assert(f.s.stops.filter(st=>st.requestId===id&&st.id!==stop.id).every(st=>st.status==='planned'));
});
test('Multi-batch delivery has one immutable event with the final full-delivery outcome',()=>{
 const f=fixture(),id=f.delivery('SAFE-EVENT');f.act({type:'verify_documents',requestId:id});f.act({type:'create_route',code:'SAFE-EVENT-ROUTE',name:'TEST',taskIds:f.s.tasks.filter(t=>t.requestId===id).map(t=>t.id)});
 const task=f.s.tasks.find(t=>t.requestId===id&&t.quantity===20),res=f.s.reservations.find(x=>x.taskId===task.id);
 f.act({type:'pickup_actual',requestId:id,reservationId:res.id,quantity:8});f.act({type:'pickup_actual',requestId:id,reservationId:res.id,quantity:12});
 const route=f.s.routes.find(rt=>rt.code==='SAFE-EVENT-ROUTE');const before=structuredClone(f.s);assert.throws(()=>f.act({type:'depart',routeId:route.id}));assert.deepEqual(f.s,before);
 const other=f.s.reservations.find(x=>x.requestId===id&&x.taskId!==task.id);f.act({type:'pickup_actual',requestId:id,reservationId:other.id,quantity:10});
 f.act({type:'depart',routeId:route.id});f.act({type:'arrive',stopId:f.s.stops.find(st=>st.taskId===task.id).id});
 const sources=f.s.reservations.filter(x=>x.taskId===task.id&&x.status==='issued');f.act({type:'deliver',requestId:id,taskId:task.id,recipient:'TEST receiver',deliveryEventId:'FORGED',batchRows:sources.map(x=>({reservationId:x.id,taskId:task.id,quantity:x.quantity}))});
 const rows=f.s.deliveries.filter(x=>x.taskId===task.id);assert.equal(rows.length,2);assert.equal(new Set(rows.map(x=>x.deliveryEventId)).size,1);assert.notEqual(rows[0].deliveryEventId,'FORGED');assert(rows.every(x=>x.deliveryOutcome==='full'&&x.plannedQuantity===20));
});
test('Receipt rejects an impossible calendar expiry without creating a batch or stock',()=>{
 const f=fixture(),productId=f.act({type:'master',kind:'products',data:{code:'SAFE-EXP',name:'TEST expiry',projectId:f.p.projectId,unitId:f.p.unitId,expiry:true}}).id;
 const id=f.act({type:'create_request',requestType:'purchase_receipt',code:'SAFE-EXP-REC',projectId:f.p.projectId,warehouseId:f.w.id,supplierName:'TEST supplier',purchaseReference:'TEST',lines:[{productId,quantity:2}]}).id;
 f.act({type:'submit',requestId:id});f.act({type:'approve',requestId:id});const t=f.s.tasks.find(x=>x.requestId===id);f.act({type:'assign_task',taskId:t.id,executorId:f.e.id});const before=structuredClone(f.s);
 assert.throws(()=>f.act({type:'receive_purchase',requestId:id,lineId:t.lineId,quantity:1,batchCode:'SAFE-BAD-DATE',expiryDate:'2028-02-30',recipient:'TEST',reason:'TEST'}));assert.deepEqual(f.s,before);
});
console.log(JSON.stringify({suite:'Pre-load changes and independent task custody',pass:passed,fail:0}));
