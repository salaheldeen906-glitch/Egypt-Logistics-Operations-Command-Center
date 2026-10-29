const assert=require('node:assert/strict');
const {execute}=require('../.sites-runtime/test-domain/engine.js');
const {emptyState,balance}=require('../.sites-runtime/test-domain/model.js');
const {executeActual}=require('../.sites-runtime/test-domain/actual-quantities.js');
const {executeLoading,loadingGuard,nextLoadingStep,readLoadingSummary}=require('../.sites-runtime/test-domain/loading-confirmation.js');
const {scopedState,assertScope}=require('../.sites-runtime/test-domain/access.js');
const {nextAction}=require('../.sites-runtime/test-domain/insights.js');
const {guidedStep}=require('../.sites-runtime/test-domain/guided-step.js');
const now='2026-10-13T10:00:00Z';
const owner={userId:'loading-owner',name:'Owner',role:'owner',function:'all',active:1};
let s,p,aWarehouse,bWarehouse,executor,keeperA,keeperB,courier,requestId,routeId,aRes,bRes,pass=0;
const test=(name,fn)=>{fn();pass++;console.log('PASS',name);};
const act=(command,actor=owner)=>{const out=execute(s,actor,command,now);s=out.state;return out.result;};
function loading(command,actor){
 const next=structuredClone(s);
 loadingGuard(next,actor,command);
 const add=(kind,value)=>{const row={id:crypto.randomUUID(),code:'LOAD-'+crypto.randomUUID(),createdAt:now,createdBy:actor.userId,...value};next[kind].push(row);return row;};
 const result=executeLoading(next,actor,command,now,add,executeActual);
 assert(result,'Expected a loading command');
 s=next;
 return result;
}
function fixture(twoCouriers=false,taskRoutes=false){
 s=execute(emptyState(),owner,{type:'seed'},now).state;p=s.products[0];[aWarehouse,bWarehouse]=s.warehouses;executor=s.resources[0];
 keeperA={userId:'keeper-cairo',name:'Cairo keeper',role:'contributor',function:'warehouse',active:1,warehouseIds:[aWarehouse.id],resourceIds:[]};
 keeperB={...keeperA,userId:'keeper-giza',name:'Giza keeper',warehouseIds:[bWarehouse.id]};
 courier={userId:'courier-one',name:'Courier',role:'contributor',function:'representative',active:1,warehouseIds:[],resourceIds:[executor.id]};
 act({type:'opening',productCode:p.code,warehouseId:bWarehouse.id,quantity:80,reason:'Isolated two warehouse fixture'});
 requestId=act({type:'create_request',requestType:'delivery',code:'DUAL-100',projectId:p.projectId,customerId:s.customers[0].id,destination:'Client',lines:[{productId:p.id,quantity:100}]}).id;
 act({type:'submit',requestId});act({type:'approve',requestId});const line=s.lines.find(l=>l.requestId===requestId);
 act({type:'reserve',requestId,batchRows:[{lineId:line.id,warehouseId:aWarehouse.id,quantity:60},{lineId:line.id,warehouseId:bWarehouse.id,quantity:40}]});
 [aRes,bRes]=s.reservations.filter(r=>r.requestId===requestId);
 for(const [r,ex] of [[aRes,executor],[bRes,twoCouriers?s.resources[1]:executor]])act({type:'assign',requestId,reservationId:r.id,executorId:ex.id,carrierId:s.carriers[0].id});
 act({type:'verify_documents',requestId});routeId=act({type:'create_route',code:'DUAL-RT',name:'Two warehouse actual load',...(taskRoutes?{taskIds:s.tasks.filter(t=>t.requestId===requestId&&t.taskType==='delivery').map(t=>t.id)}:{requestIds:[requestId]})}).id;
 s.requests.find(r=>r.id===requestId).loadingProtocol='dual';
}
const req=()=>s.requests.find(r=>r.id===requestId);
const release=(res,q,actor,reason)=>loading({type:'warehouse_release',requestId,reservationId:res.id,quantity:q,...(reason?{reason}:{})},actor);
const collect=(loadingId,q,actor=courier,reason)=>loading({type:'courier_collect',requestId,loadingId,quantity:q,...(reason?{reason}:{})},actor);

fixture();
test('First guided loading step is the source keeper with an explicit reservation',()=>{const step=nextLoadingStep(s,req());assert.equal(step.action,'warehouse_release');assert.equal(step.role,'warehouse');assert.equal(step.command.reservationId,aRes.id);});
test('Legacy pickup, full load and extended issue cannot bypass the dual protocol',()=>{for(const type of ['pickup_actual','load','op_issue'])assert.throws(()=>loadingGuard(s,owner,{type,requestId,reservationId:aRes.id}),/تأكيد المخزن/);});
test('No departure before either source has independent loading confirmations',()=>assert.throws(()=>loadingGuard(s,courier,{type:'depart',routeId}),/كل مخزن مصدر/));
test('Keeper needs its own mapped warehouse and cannot be replaced by dispatch',()=>{for(const actor of [keeperB,{...keeperA,warehouseIds:undefined},{...keeperA,function:'dispatcher'}])assert.throws(()=>release(aRes,60,actor),/المخزن|الحساب/);});
test('Any partial or excess warehouse declaration requires a reason before it is recorded',()=>{const before=structuredClone(s);assert.throws(()=>release(aRes,50,keeperA),/نص مطلوب/);assert.throws(()=>release(aRes,61,keeperA),/نص مطلوب/);assert.deepEqual(s,before);});
const initialA=balance(s,p.id,aWarehouse.id),first=release(aRes,50,keeperA,'Actual available to load');
test('Warehouse alone does not change stock, held quantity or courier custody',()=>{assert.deepEqual(balance(s,p.id,aWarehouse.id),initialA);assert.equal(s.reservations.find(r=>r.id===aRes.id).quantity,60);assert.equal(s.handoffs.find(h=>h.id===first.loadingId).courierQuantity,undefined);assert.equal(nextLoadingStep(s,req()).role,'representative');});
test('A pending cycle cannot be duplicated for the same reservation',()=>assert.throws(()=>release(aRes,50,keeperA,'Duplicate pending'),/سابق لم يُحسم/));
test('Courier must use an independently authenticated assigned resource account',()=>{for(const actor of [{...courier,resourceIds:[]},{...courier,resourceIds:undefined},keeperA,{...courier,userId:keeperA.userId}])assert.throws(()=>collect(first.loadingId,50,actor,'Actual pickup'),/الحساب|المندوب|مستقل/);});
test('Partial independent courier input needs its own reason',()=>assert.throws(()=>collect(first.loadingId,50,courier),/نص مطلوب/));
const posted=collect(first.loadingId,50,courier,'Received fifty actually');
test('Matching 50/50 posts only fifty once and leaves ten held at the source',()=>{assert.equal(posted.posted,true);assert.equal(balance(s,p.id,aWarehouse.id).onHand,initialA.onHand-50);assert.equal(balance(s,p.id).transit,50);assert.equal(s.reservations.find(r=>r.id===aRes.id).quantity,10);assert.equal(s.reservations.find(r=>r.id===aRes.id).status,'held');const movement=s.movements.find(m=>m.loadingId===first.loadingId);assert.equal(movement.delta,-50);assert.equal(s.handoffs.find(h=>h.id===first.loadingId).movementId,movement.id);});
test('Posted confirmation preserves distinct actors and exact actual quantities',()=>{const summary=readLoadingSummary(s,req())[0];assert.equal(summary.warehouseUserId,keeperA.userId);assert.equal(summary.courierUserId,courier.userId);assert.notEqual(summary.warehouseUserId,summary.courierUserId);assert.equal(summary.planned,60);assert.equal(summary.warehouseReleased,50);assert.equal(summary.courierReceived,50);assert.equal(summary.difference,0);});
test('A repeated courier confirmation cannot post the stock again',()=>{const before=structuredClone(s);assert.throws(()=>collect(first.loadingId,50,courier,'Repeated confirmation'),/تم استلامه/);assert.deepEqual(s,before);});
test('After a partial first-source load the guide leads to the second warehouse',()=>{const step=nextLoadingStep(s,req());assert.equal(step.action,'warehouse_release');assert.equal(step.command.reservationId,bRes.id);assert.throws(()=>loadingGuard(s,courier,{type:'depart',routeId}),/كل مخزن مصدر/);});
const second=release(bRes,40,keeperB);collect(second.loadingId,40);
test('Second-source independent 40/40 accumulates ninety custody and leaves ten planned',()=>{assert.equal(balance(s,p.id).transit,90);assert.equal(balance(s,p.id,bWarehouse.id).onHand,40);assert.equal(s.movements.filter(m=>m.loadingId).length,2);assert.equal(s.reservations.find(r=>r.id===aRes.id).quantity,10);assert.equal(nextLoadingStep(s,req()),null);assert.doesNotThrow(()=>loadingGuard(s,courier,{type:'depart',routeId}));});
test('Departure adds no second stock movement or custody',()=>{const before=s.movements.length;act({type:'depart',routeId},courier);assert.equal(s.movements.length,before);assert.equal(balance(s,p.id).transit,90);});
act({type:'arrive',stopId:s.stops.find(st=>st.routeId===routeId).id},courier);
const issued=s.reservations.filter(r=>r.requestId===requestId&&r.status==='issued');
for(const res of issued)act({type:'deliver',requestId,reservationId:res.id,quantity:res.quantity,recipient:'Client'},courier);
test('Held remaining ten keeps original request open after actual ninety delivery',()=>{assert.equal(balance(s,p.id).transit,0);assert.throws(()=>act({type:'close',requestId},courier),/كميات|مهام/);const step=nextLoadingStep(s,req());assert.equal(step.action,'warehouse_release');assert.equal(step.max,10);});

fixture();const mismatch=release(aRes,55,keeperA,'Five remain reserved');const beforeMismatch=balance(s,p.id,aWarehouse.id);collect(mismatch.loadingId,50,courier,'Count differed');
test('Different 55/50 inputs are preserved without stock issue or fabricated custody',()=>{assert.deepEqual(balance(s,p.id,aWarehouse.id),beforeMismatch);assert.equal(balance(s,p.id).transit,0);const summary=readLoadingSummary(s,requestId)[0];assert.equal(summary.difference,5);assert.equal(summary.posted,false);assert.equal(summary.status,'mismatch');const step=nextLoadingStep(s,req());assert.equal(step.action,'loading_mismatch');assert(step.blocked.includes('لم تُرحّل'));});
test('Mismatch blocks departure, repeat overwrite and a new cycle on the same reservation',()=>{assert.throws(()=>loadingGuard(s,courier,{type:'depart',routeId}),/فرق/);assert.throws(()=>collect(mismatch.loadingId,55,courier,'Try overwrite'),/فرق ينتظر الحسم/);assert.throws(()=>release(aRes,55,keeperA,'New cycle'),/سابق لم يُحسم/);});
test('Client-supplied keeper/courier identity fields cannot replace authenticated identities',()=>{const next=release(bRes,40,keeperB);loading({type:'courier_collect',requestId,loadingId:next.loadingId,quantity:40,courierUserId:'forged',warehouseUserId:'forged'},courier);const h=s.handoffs.find(h=>h.id===next.loadingId);assert.equal(h.warehouseUserId,keeperB.userId);assert.equal(h.courierUserId,courier.userId);assert.throws(()=>loadingGuard(s,courier,{type:'depart',routeId}),/فرق/);});

fixture();
test('Owner with broad warehouse scope can record release but cannot supply the courier signature',()=>{const h=release(aRes,60,owner);assert.throws(()=>collect(h.loadingId,60,owner),/حساب المندوب/);assert.throws(()=>collect(h.loadingId,60,{...courier,userId:owner.userId}),/مستقل/);});
test('Cross-request loading ID and invalid attachment references are rejected',()=>{const h=s.handoffs.find(h=>h.type==='loading_confirmation');assert.throws(()=>loading({type:'courier_collect',requestId:'other',loadingId:h.id,quantity:60},courier));assert.throws(()=>loading({type:'warehouse_release',requestId,reservationId:bRes.id,quantity:40,documentId:'missing-proof'},keeperB),/Record not found/);});

fixture();
test('Posting revalidates physical stock and atomically preserves the pending input on failure',()=>{const h=release(aRes,60,keeperA);s.movements.push({id:'external-adjustment',code:'EXTERNAL-CHANGE',type:'adjustment',productId:p.id,warehouseId:aWarehouse.id,batchId:'',delta:-100});const before=structuredClone(s);assert.throws(()=>collect(h.loadingId,60),/المخزون غير كاف/);assert.deepEqual(s,before);assert.equal(s.handoffs.find(x=>x.id===h.loadingId).status,'awaiting_courier');});
test('Legacy requests keep their original pickup guard and guide contracts',()=>{delete req().loadingProtocol;assert.doesNotThrow(()=>loadingGuard(s,courier,{type:'pickup_actual',requestId,reservationId:aRes.id}));assert.equal(nextLoadingStep(s,req()),null);assert.equal(executeLoading(s,courier,{type:'deliver',requestId},now,()=>{},executeActual),null);});

fixture();
test('Integrated public engine rejects every old loading shortcut on a dual request',()=>{for(const type of ['pickup_actual','load','op_issue'])assert.throws(()=>act({type,requestId,reservationId:aRes.id,quantity:1}),e=>e.code==='STATE'&&e.status===409);});
const engineFirst=act({type:'warehouse_release',requestId,reservationId:aRes.id,quantity:50,reason:'Actual partial warehouse release'},keeperA);
const enginePosted=act({type:'courier_collect',requestId,loadingId:engineFirst.loadingId,quantity:50,reason:'Actual partial courier collection'},courier);
const engineSecond=act({type:'warehouse_release',requestId,reservationId:bRes.id,quantity:40},keeperB);act({type:'courier_collect',requestId,loadingId:engineSecond.loadingId,quantity:40},courier);
test('Integrated engine uses independent signatures and preserves partial source balance',()=>{assert.equal(enginePosted.posted,true);assert.equal(balance(s,p.id).transit,90);assert.equal(s.reservations.find(x=>x.id===aRes.id).quantity,10);assert.equal(s.movements.filter(x=>x.loadingId===engineFirst.loadingId).length,1);});
act({type:'depart',routeId},courier);act({type:'arrive',stopId:s.stops.find(st=>st.routeId===routeId).id},courier);
for(const res of s.reservations.filter(x=>x.requestId===requestId&&x.status==='issued'))act({type:'deliver',requestId,reservationId:res.id,quantity:res.quantity,recipient:'Client'},courier);
const returnSource=s.tasks.find(t=>t.requestId===requestId&&t.reservationId===aRes.id),customerReturn=act({type:'plan_return',requestId,taskId:returnSource.id,source:'delivered',quantity:5,warehouseId:aWarehouse.id,reason:'Actual customer return'},courier);
test('Pending customer return leads both action and inline guide before remaining loading',()=>{assert.equal(nextLoadingStep(s,req()).action,'warehouse_release');assert.equal(nextAction(s,req()).action,'return_arrive');assert.equal(guidedStep(s,req()).action,'return_arrive');assert.equal(guidedStep(s,req()).command.taskId,customerReturn.id);});
act({type:'return_arrive',requestId,taskId:customerReturn.id,quantity:3},courier);
test('Warehouse acceptance stays the next step despite a held source remainder',()=>{assert.equal(nextAction(s,req()).action,'receive_return');assert.equal(guidedStep(s,req()).action,'receive_return');assert.equal(guidedStep(s,req()).max,3);});
test('A source keeper cannot accept a return addressed to the other warehouse',()=>{const before=structuredClone(s);assert.throws(()=>act({type:'receive_return',requestId,taskId:customerReturn.id,quantity:1,recipient:'Wrong keeper'},keeperB),e=>e.code==='FORBIDDEN'&&e.status===403);assert.deepEqual(s,before);});
act({type:'receive_return',requestId,taskId:customerReturn.id,quantity:1,recipient:'Correct keeper'},keeperA);
test('Correct mapped keeper adds only its actual acceptance and cannot close held quantities',()=>{assert.equal(s.returns.filter(x=>x.taskId===customerReturn.id).reduce((n,x)=>n+x.quantity,0),1);assert.equal(guidedStep(s,req()).action,'receive_return');assert.equal(guidedStep(s,req()).max,2);assert.throws(()=>act({type:'close',requestId},courier));});

fixture();act({type:'warehouse_release',requestId,reservationId:bRes.id,quantity:40},keeperB);
test('Scoped keeper guide does not follow dangling confirmations from another warehouse',()=>{const visible=scopedState(s,keeperA),r=visible.requests.find(x=>x.id===requestId);assert(!visible.handoffs.some(h=>h.type==='loading_confirmation'&&h.warehouseId===bWarehouse.id));assert.doesNotThrow(()=>guidedStep(visible,r));assert.equal(guidedStep(visible,r).command.reservationId,aRes.id);});

fixture(true,true);const otherCourier={...courier,userId:'courier-two',resourceIds:[s.resources[1].id]};
const ownTask=s.tasks.find(t=>t.requestId===requestId&&t.executorId===executor.id),otherTask=s.tasks.find(t=>t.requestId===requestId&&t.executorId===s.resources[1].id);
const ownProof=act({type:'upload',requestId,taskId:ownTask.id,purpose:'pod',file:{key:'own-proof',name:'own.pdf',size:10,mime:'application/pdf'}}),otherProof=act({type:'upload',requestId,taskId:otherTask.id,purpose:'pod',file:{key:'other-proof',name:'other.pdf',size:10,mime:'application/pdf'}});
test('Mapped courier cannot read or reference another courier task proof on the same request',()=>{const visible=scopedState(s,courier);assert(visible.documents.some(d=>d.id===ownProof.id));assert(!visible.documents.some(d=>d.id===otherProof.id));assert.throws(()=>assertScope(s,courier,{type:'pod',requestId,documentId:otherProof.id}),e=>e.code==='FORBIDDEN');});
for(const [res,keeper,rep] of [[aRes,keeperA,courier],[bRes,keeperB,otherCourier]]){const h=act({type:'warehouse_release',requestId,reservationId:res.id,quantity:res.quantity},keeper);act({type:'courier_collect',requestId,loadingId:h.loadingId,quantity:res.quantity},rep);}
test('Mapped courier cannot depart a shared route for another courier',()=>{assert.throws(()=>act({type:'depart',routeId},courier),e=>e.code==='FORBIDDEN');assert.equal(s.routes.find(rt=>rt.id===routeId).status,'planned');});
act({type:'depart',routeId});const otherStop=s.stops.find(st=>st.routeId===routeId&&st.taskId===otherTask.id);
test('Other courier task stop is hidden and direct arrival is rejected',()=>{assert(!scopedState(s,courier).stops.some(st=>st.id===otherStop.id));assert.throws(()=>act({type:'arrive',stopId:otherStop.id},courier),e=>e.code==='FORBIDDEN');assert.equal(s.tasks.find(t=>t.id===otherTask.id).status,'in_transit');});
fixture();
s.reservations.find(x=>x.id===bRes.id).warehouseId=aWarehouse.id;
s.reservations.find(x=>x.id===bRes.id).batchId='second-source-batch';
s.batches.push({id:'second-source-batch',code:'SECOND-LOT',productId:p.id,expiryDate:'2029-12-31'});
s.movements.push({id:'batch-stock',code:'BATCH-STOCK',type:'opening',productId:p.id,warehouseId:aWarehouse.id,batchId:'second-source-batch',delta:40});
const firstBatch=release(aRes,60,keeperA);collect(firstBatch.loadingId,60);
test('One confirmed batch does not allow skipping another reserved batch in the same warehouse',()=>{assert.throws(()=>loadingGuard(s,courier,{type:'depart',routeId}),/كل مخزن مصدر/);assert.equal(nextLoadingStep(s,req()).command.reservationId,bRes.id);});
const nextBatch=release(bRes,40,keeperA);collect(nextBatch.loadingId,40);
test('Every original source/batch confirmation posts once before departure',()=>{assert.doesNotThrow(()=>loadingGuard(s,courier,{type:'depart',routeId}));assert.equal(s.movements.filter(m=>m.loadingId).length,2);});

fixture();
test('A documented warehouse excess creates an approval work item without issuing stock',()=>{const before=balance(s,p.id,aWarehouse.id),count=s.movements.length;const h=release(aRes,61,keeperA,'Counted one above reserved quantity');assert(h.approvalId);assert(h.exceptionId);assert.equal(s.approvals.find(ap=>ap.id===h.approvalId).status,'pending');assert.equal(s.approvals.find(ap=>ap.id===h.approvalId).newQuantity,101);assert.equal(s.reservations.find(x=>x.id===aRes.id).quantity,60);assert.deepEqual(balance(s,p.id,aWarehouse.id),before);assert.equal(s.movements.length,count);});

console.log(JSON.stringify({suite:'Separate source loading confirmations',pass,fail:0}));
