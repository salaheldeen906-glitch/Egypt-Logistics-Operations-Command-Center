const assert=require('node:assert/strict');
const {execute}=require('../.sites-runtime/test-stock-integrity/engine.js');
const {emptyState,balance}=require('../.sites-runtime/test-stock-integrity/model.js');
const {assertStockTransition}=require('../.sites-runtime/test-stock-integrity/stock-integrity.js');
const owner={userId:'stock-owner',name:'Stock owner',role:'owner',function:'all',active:1};
const now='2026-10-22T12:00:00Z';
let s,requestId,res,product,warehouse,pass=0;
const act=c=>{const out=execute(s,owner,c,now);s=out.state;return out.result;};
const test=(name,fn)=>{fn();pass++;console.log('PASS',name);};
function fixture(quantity=100){
 s=execute(emptyState(),owner,{type:'seed'},now).state;product=s.products[0];warehouse=s.warehouses[0];
 requestId=act({type:'create_request',requestType:'delivery',code:'STOCK-SAFETY',projectId:product.projectId,customerId:s.customers[0].id,destination:'Synthetic customer',lines:[{productId:product.id,quantity}]}).id;
 act({type:'submit',requestId});act({type:'approve',requestId});act({type:'reserve',requestId});
 res=s.reservations.find(r=>r.requestId===requestId);
 act({type:'assign',requestId,reservationId:res.id,executorId:s.resources[0].id,carrierId:s.carriers[0].id});
 act({type:'verify_documents',requestId});act({type:'create_route',code:'STOCK-SAFETY-RT',name:'Stock safety route',requestIds:[requestId]});
}
fixture();
test('Posting cannot consume stock backing another held reservation in an inconsistent imported snapshot',()=>{
 // Reproduce a stale snapshot: each individual hold fits physical120, but together100+30 do not.
 // There must be no success/partial issue merely because the pickup checks physical stock only.
 s.reservations.push({...res,id:'legacy-other-hold',code:'LEGACY-OTHER-HOLD',quantity:30});
 const before=structuredClone(s);
 assert.throws(()=>act({type:'pickup_actual',requestId,reservationId:res.id,quantity:100}),e=>e.code==='STOCK');
 assert.deepEqual(s,before);
});
fixture(120);
test('A legitimate issue may drain physical and free stock exactly to zero',()=>{
 act({type:'pickup_actual',requestId,reservationId:res.id,quantity:120});
 const b=balance(s,product.id,warehouse.id,'');assert.equal(b.onHand,0);assert.equal(b.reserved,0);assert.equal(b.available,0);
 assert.throws(()=>act({type:'pickup_actual',requestId,reservationId:res.id,quantity:1}));
 assert.equal(s.movements.filter(m=>m.requestId===requestId&&m.type==='issue').length,1);
});
fixture();
test('Insufficient physical stock fails atomically without rewriting the requested quantity',()=>{
 s.movements.find(m=>m.productId===product.id&&m.warehouseId===warehouse.id).delta=90;
 const before=structuredClone(s);assert.throws(()=>act({type:'load',requestId}));assert.deepEqual(s,before);
 assert.equal(s.lines.find(l=>l.requestId===requestId).quantity,100);
});
function buckets(){
 const state=emptyState();state.products=[{id:'p',code:'P'}];state.warehouses=[{id:'a',code:'A',name:'Warehouse A'},{id:'b',code:'B',name:'Warehouse B'}];state.batches=[{id:'lot1',code:'LOT1'},{id:'lot2',code:'LOT2'}];
 state.movements=[{id:'m1',code:'M1',productId:'p',warehouseId:'a',batchId:'lot1',delta:10},{id:'m2',code:'M2',productId:'p',warehouseId:'a',batchId:'lot2',delta:100},{id:'m3',code:'M3',productId:'p',warehouseId:'b',batchId:'lot1',delta:100}];return state;
}
test('Warehouse and batch stock cannot be netted together to hide a negative source',()=>{
 const before=buckets(),after=structuredClone(before);after.movements.push({id:'bad-issue',code:'BAD',productId:'p',warehouseId:'a',batchId:'lot1',delta:-11});
 assert.throws(()=>assertStockTransition(before,after),e=>e.code==='STOCK');
});
test('An incoming transfer does not balance an invalid source in a different warehouse',()=>{
 const before=buckets(),after=structuredClone(before);after.movements.push({id:'out',code:'OUT',productId:'p',warehouseId:'a',batchId:'lot1',delta:-11},{id:'in',code:'IN',productId:'p',warehouseId:'b',batchId:'lot1',delta:11});
 assert.throws(()=>assertStockTransition(before,after),e=>e.code==='STOCK');
});
test('A new hold cannot make free stock negative even when physical stock remains positive',()=>{
 const before=buckets(),after=structuredClone(before);after.reservations.push({id:'hold',code:'H',productId:'p',warehouseId:'a',batchId:'lot1',quantity:11,status:'held'});
 assert.throws(()=>assertStockTransition(before,after),e=>e.code==='STOCK');
});
test('Hold and movement mutations are checked at the final transaction state',()=>{
 const before=buckets();before.reservations.push({id:'hold',code:'H',productId:'p',warehouseId:'a',batchId:'lot1',quantity:10,status:'held'});
 const after=structuredClone(before);after.movements.push({id:'out',code:'OUT',productId:'p',warehouseId:'a',batchId:'lot1',delta:-6});after.reservations[0].quantity=4;
 assert.doesNotThrow(()=>assertStockTransition(before,after));
});
test('Three-decimal arithmetic allows exact zero without floating-point false negatives',()=>{
 const before=buckets();before.movements[0].delta=0.3;const after=structuredClone(before);after.movements.push({id:'out1',code:'OUT1',productId:'p',warehouseId:'a',batchId:'lot1',delta:-0.1},{id:'out2',code:'OUT2',productId:'p',warehouseId:'a',batchId:'lot1',delta:-0.2});
 assert.doesNotThrow(()=>assertStockTransition(before,after));
});
test('Nonfinite or overprecise movement amounts are not clamped into apparently valid stock',()=>{
 for(const delta of [NaN,Infinity,-0.0001]){const before=buckets(),after=structuredClone(before);after.movements.push({id:'invalid',code:'INVALID',productId:'p',warehouseId:'a',batchId:'lot1',delta});assert.throws(()=>assertStockTransition(before,after),e=>e.code==='STOCK');}
});
test('Removing an opening that backs stock is detected like a negative movement',()=>{
 const before=buckets();before.movements.push({id:'prior-issue',code:'PRIOR',productId:'p',warehouseId:'a',batchId:'lot1',delta:-5});const after=structuredClone(before);after.movements=after.movements.filter(m=>m.id!=='m1');
 assert.throws(()=>assertStockTransition(before,after),e=>e.code==='STOCK');
});
test('The guard does not rewrite or hide unrelated legacy negative history during a non-stock change',()=>{
 const before=buckets();before.movements[0].delta=-5;const after=structuredClone(before);after.products[0].name='Renamed';const snapshot=structuredClone(after);
 assert.doesNotThrow(()=>assertStockTransition(before,after));assert.deepEqual(after,snapshot);assert.equal(balance(after,'p','a','lot1').onHand,-5);
});
console.log(`${pass} stock-integrity checks passed`);
