const assert=require('node:assert/strict');
const {execute}=require('../.sites-runtime/test-domain/engine.js');
const {emptyState,balance}=require('../.sites-runtime/test-domain/model.js');
const {guidedStep}=require('../.sites-runtime/test-domain/guided-step.js');
const {returnAmount,taskDelivered}=require('../.sites-runtime/test-domain/task-trace.js');
const owner={userId:'guide',name:'Guide',role:'owner',function:'all',active:1};
let s,id,p,src,dst,ex,pass=0;
const act=c=>{const out=execute(s,owner,c);s=out.state;return out.result;};
const r=()=>s.requests.find(r=>r.id===id),step=()=>guidedStep(s,r());
const go=(expected,form={})=>{const next=step();assert.equal(next.action,expected,JSON.stringify(next));assert(!next.blocked,next.blocked);for(const f of next.fields.filter(f=>f.required!==false&&f.type==='select'))assert(form[f.key],f.key);return act({...next.command,...form});};
const test=(name,f)=>{f();pass++;console.log('PASS',name);};
function reset(kind='delivery',quantity=12){s=execute(emptyState(),owner,{type:'seed'}).state;p=s.products[0];src=s.warehouses[0];dst=s.warehouses[1];ex=s.resources[0];id=act({type:'create_request',requestType:kind,code:'GUIDED-'+kind,projectId:p.projectId,customerId:s.customers[0].id,destination:'Client',warehouseId:dst.id,sourceWarehouseId:src.id,sourceAddress:'Supplier address',supplierName:'Supplier',purchaseReference:'APPROVED-1',referenceCode:'SALE-1',notes:'Actual collection',documentAction:'sign',documentDescription:'Signed original',lines:[{productId:p.id,quantity}]}).id;go('submit');go('approve');}
function deliveryReady(){go('reserve');go('assign',{executorId:ex.id,carrierId:s.carriers[0].id});go('verify_documents');go('create_route',{code:'GUIDE-RT',name:'Guided route'});}
function allocate(kind='customer',quantity=12){go('op_plan',{quantity,destinationKind:kind,warehouseId:dst.id,customerId:s.customers[0].id,destination:'Client',executorId:ex.id});}
reset();deliveryReady();
test('Guided delivery prepares reservation, explicit assignee, optional evidence and route',()=>{assert.equal(step().action,'pickup_actual');assert.equal(step().max,12);assert(step().fields.find(f=>f.key==='quantity'));});
go('pickup_actual',{quantity:6});go('depart');go('arrive');go('deliver',{quantity:4,recipient:'Customer'});
test('Partial delivery asks actual remaining two, without requiring proof',()=>{assert.equal(step().action,'deliver');assert.equal(step().max,2);assert.equal(s.documents.length,0);});
let target=s.tasks.find(t=>t.requestId===id&&t.taskType==='delivery');let alternate=guidedStep(s,r(),target.id);assert.equal(alternate.max,2);act({...alternate.command,quantity:2,warehouseId:dst.id,reason:'Customer declined remainder'});
go('return_arrive',{quantity:2});
test('Courier drop-off advances immediately to keeper actual acceptance',()=>{assert.equal(step().action,'receive_return');assert.equal(step().role,'warehouse');assert.equal(step().max,2);assert.throws(()=>execute(s,{...owner,role:'contributor',function:'representative'},{...step().command,quantity:1,recipient:'Keeper'}));});
go('receive_return',{quantity:1,recipient:'Keeper'});
test('Partial return acceptance keeps actual remaining one in the current form',()=>{assert.equal(step().action,'receive_return');assert.equal(step().max,1);});
go('receive_return',{quantity:1,recipient:'Keeper'});
test('After custody settles, guide collects uncollected six rather than zero delivery',()=>{assert.equal(step().action,'pickup_actual');assert.equal(step().max,6);});
go('pickup_actual',{quantity:6});go('deliver',{quantity:6,recipient:'Customer'});go('close');
test('Guided partial pickup/delivery/return sequence reaches closed with no custody',()=>{assert.equal(r().status,'closed');assert.equal(balance(s,p.id).transit,0);assert.equal(step().action,'');});
reset('delivery',1);deliveryReady();go('pickup_actual',{quantity:1});go('depart');go('arrive');target=s.tasks.find(t=>t.requestId===id&&t.taskType==='delivery');alternate=guidedStep(s,r(),target.id);act({...alternate.command,quantity:1,warehouseId:dst.id,reason:'Return all'});go('return_arrive',{quantity:1});go('receive_return',{quantity:1,recipient:'Keeper'});
// Reproduce an old request whose actual return predates sourceTaskId linkage and task completion.
s.tasks.find(t=>t.id===target.id).status='planned';for(const x of s.returns)delete x.sourceTaskId;for(const t of s.tasks.filter(t=>t.taskType==='return'))delete t.sourceTaskId;
test('Screenshot: returned one, delivered zero, stale automatic task goes to completion',()=>{assert.equal(step().action,'complete_task');assert.equal(returnAmount(s,s.tasks.find(t=>t.id===target.id)),1);assert.equal(step().fields.length,0);});
const before=structuredClone(s.movements);go('complete_task');
test('Historical completion posts no stock and opens request closure directly',()=>{assert.deepEqual(s.movements,before);assert.equal(step().action,'close');});
go('close');
test('Ambiguous historical links and known different source tasks are never attributed',()=>{const copy=structuredClone(s),task=copy.tasks.find(t=>t.id===target.id);copy.tasks.push({...task,id:'ambiguous'});assert.equal(returnAmount(copy,task),0);copy.tasks.pop();copy.returns[0].sourceTaskId='different';assert.equal(returnAmount(copy,task),0);delete copy.returns[0].sourceTaskId;copy.returns[0].source='delivered';assert.equal(returnAmount(copy,task),0);copy.deliveries.push({id:'d',code:'d',reservationId:task.reservationId,quantity:1});assert.equal(taskDelivered(copy,task),1);copy.deliveries[0].taskId='different';assert.equal(taskDelivered(copy,task),0);});
reset('distribution');allocate();go('op_authorize');go('op_reserve');go('pickup_actual',{quantity:5});go('op_arrive');go('op_deliver',{quantity:5,recipient:'Client'});
test('Distribution partial pickup automatically returns to remaining pickup',()=>{assert.equal(step().action,'pickup_actual');assert.equal(step().max,7);});
go('pickup_actual',{quantity:7});go('op_deliver',{quantity:7,recipient:'Client'});go('op_close');
reset('warehouse_transfer');allocate('warehouse');go('op_authorize');go('op_reserve');go('pickup_actual',{quantity:8});go('op_present',{quantity:6});go('op_receive',{quantity:4,recipient:'Keeper'});
test('Transfer separates six presented from four accepted and shows two awaiting keeper',()=>{assert.equal(step().action,'op_receive');assert.equal(step().max,2);});
go('op_receive',{quantity:0,reason:'Rejected two'});assert.equal(step().action,'op_present');assert.equal(step().max,4);go('op_present',{quantity:4});go('op_receive',{quantity:4,recipient:'Keeper'});go('pickup_actual',{quantity:4});go('op_present',{quantity:4});go('op_receive',{quantity:4,recipient:'Keeper'});go('op_close');
test('Transfer resumes after refusal and completes only actual accepted quantity',()=>{assert.equal(balance(s,p.id,dst.id).onHand,12);assert.equal(balance(s,p.id).transit,0);});
for(const type of ['receipt_order','customer_return']){reset(type);allocate('warehouse');go('op_authorize');go('op_collect',{quantity:5,recipient:'Source',reason:'Partial collection'});test(type+': partial collection proceeds to actual drop-off without requiring full pickup',()=>{assert.equal(step().action,'op_present');assert.equal(step().max,5);});go('op_present',{quantity:5});go('op_receive',{quantity:5,recipient:'Keeper'});go('op_collect',{quantity:7,recipient:'Source',reason:'Remaining collection'});go('op_present',{quantity:7});go('op_receive',{quantity:7,recipient:'Keeper'});go('op_close');assert.equal(r().status,'closed');}
reset('documents');go('op_plan',{executorId:ex.id});go('op_authorize');go('op_document',{recipient:'Signer',reason:'Signed original returned'});go('op_close');
test('Document guide assigns existing numbered task then finishes without a forced attachment',()=>{assert.equal(r().status,'closed');assert.equal(s.tasks.filter(t=>t.requestId===id).length,1);assert.equal(s.documents.length,0);});
reset('purchase_receipt');go('assign_task',{executorId:ex.id});go('receive_purchase',{quantity:5,recipient:'Keeper',reason:'Actual five'});assert.equal(step().max,7);go('receive_purchase',{quantity:7,recipient:'Keeper',reason:'Actual seven'});go('close_receipt');
test('Direct receipt guide assigns keeper, receives actual batches and closes',()=>assert.equal(r().status,'closed'));
console.log(JSON.stringify({suite:'Guided current-action workflows',pass,fail:0}));
