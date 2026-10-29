const assert=require('node:assert/strict');
const {emptyState,balance}=require('../.sites-runtime/test-external-transport/model.js');
const {executeExternalTransport,externalUnavailable,externalLineMetrics,externalCommandAllowed}=require('../.sites-runtime/test-external-transport/external-transport.js');
const now='2026-10-22T12:00:00.000Z';let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const no=(f,message)=>{assert.throws(f,message?new RegExp(message):undefined);checks++;};
const manager={userId:'dispatch',name:'Synthetic dispatcher',role:'manager',function:'dispatcher',active:1};
const keeper={userId:'keeper',name:'Synthetic keeper',role:'contributor',function:'warehouse',active:1,warehouseIds:['w']};
const courier={userId:'repuser',name:'Synthetic representative',role:'contributor',function:'representative',active:1,resourceIds:['rep']};
function fixture(status='issued'){
 const s=emptyState();s.projects.push({id:'p',code:'P',name:'Synthetic'});s.units.push({id:'u',code:'BOX',name:'Box'});s.warehouses.push({id:'w',code:'W',name:'Synthetic warehouse'});s.carriers.push({id:'c',code:'C',name:'Synthetic carrier'});s.resources.push({id:'rep',code:'REP',name:'Synthetic courier'});s.customers.push({id:'cust',code:'CU',name:'Synthetic customer'});
 s.products.push({id:'prod',code:'PR',name:'Synthetic product',projectId:'p',unitId:'u',tracked:true,expiry:true});s.batches.push({id:'b',code:'B',productId:'prod',expiryDate:'2028-01-01'});
 s.requests.push({id:'r',code:'REQ',projectId:'p',requestType:'delivery',status:status==='held'?'ready':'loaded',customerId:'cust',destination:'Synthetic destination'});s.lines.push({id:'ln',code:'LN',requestId:'r',productId:'prod',quantity:100});
 s.tasks.push({id:'t',code:'T',taskType:'delivery',requestId:'r',lineId:'ln',productId:'prod',quantity:100,executorId:'rep',destinationKind:'customer',destination:'Synthetic destination',status:'planned'});
 s.reservations.push({id:'res',code:'RES',requestId:'r',lineId:'ln',taskId:'t',productId:'prod',warehouseId:'w',batchId:'b',quantity:100,status,executorId:'rep'});
 s.assignments.push({id:'as',code:'AS',requestId:'r',reservationId:'res',warehouseId:'w',executorId:'rep'});
 s.documents.push({id:'doc',code:'DOC',requestId:'r',taskId:'t',objectKey:'synthetic-proof',purpose:'other'});
 s.movements.push({id:'op',code:'OP',productId:'prod',warehouseId:'w',batchId:'b',delta:100,type:'opening'});if(status==='issued')s.movements.push({id:'issue',code:'ISS',productId:'prod',warehouseId:'w',batchId:'b',requestId:'r',reservationId:'res',delta:-100,type:'issue'});return s;
}
let seq=0;
function run(s,c,a=manager){const work=structuredClone(s);const add=(kind,v)=>{const n=++seq,r={id:'new-'+n,code:'NEW-'+n,createdAt:now,createdBy:a.userId,...v};work[kind].push(r);return r;};const result=executeExternalTransport(work,a,c,now,add);assert(result);return {s:work,result};}
function save(s,q=100,extra={}){return run(s,{type:'external_shipment_save',code:'EXT-'+(++seq),carrierId:'c',lines:[{reservationId:'res',taskId:'t',quantity:q,packageCount:5,packaging:'cartons'}],declaredValue:'1700000.00',currency:'EGP',...extra});}
function line(s,id){return s.handoffs.find(h=>h.type==='external_shipment_line'&&h.shipmentId===id);}
function cmd(s,id,type,extra={}){return {type,shipmentId:id,shipmentLineId:line(s,id).id,documentId:'doc',quantity:100,recipient:'External recipient',senderName:'Internal sender',...extra};}

eq(externalCommandAllowed({...manager,role:'viewer'},'external_shipment_save'),false);
eq(externalCommandAllowed(manager,'external_warehouse_release'),false);
eq(externalCommandAllowed({...manager,function:'warehouse'},'external_warehouse_release'),true);
eq(externalCommandAllowed(courier,'external_deliver'),false);
{
 let {s,result}=save(fixture(),60);const id=result.id,l=line(s,id);eq(l.unitId,'u');eq(l.packageCount,5);eq(l.batchCode,'B');eq(l.expiryDate,'2028-01-01');eq(s.handoffs.find(h=>h.id===id).declaredValueMinor,170000000);eq(s.movements.length,2);eq(externalUnavailable(s,'res'),60);
 no(()=>save(s,41));const second=save(s,40);eq(externalUnavailable(second.s,'res'),100);
 no(()=>run(s,cmd(s,id,'external_handover',{quantity:61})));
 ({s}=run(s,cmd(s,id,'external_handover',{quantity:30}),courier));eq(s.movements.length,2);eq(externalLineMetrics(s,line(s,id)).custody,30);
 ({s}=run(s,cmd(s,id,'external_deliver',{quantity:10})));eq(externalUnavailable(s,'res'),50);eq(s.deliveries[0].performerType,'carrier');eq(s.deliveries[0].executorId,'');eq(externalLineMetrics(s,line(s,id)).custody,20);
 ({s}=run(s,cmd(s,id,'external_handover',{quantity:30}),courier));eq(externalLineMetrics(s,line(s,id)).custody,50);
 no(()=>run(s,{type:'external_shipment_cancel',shipmentId:id,reason:'Cannot cancel physical custody'}));
 no(()=>save(s,1,{shipmentId:id}));
 no(()=>run(s,cmd(s,id,'external_deliver',{quantity:51})));
 const presented=run(s,cmd(s,id,'external_return',{quantity:20,warehouseId:'w',reason:'Synthetic refusal',source:'custody'}));s=presented.s;eq(s.movements.length,2);eq(externalLineMetrics(s,line(s,id)).pendingReturn,20);no(()=>run(s,cmd(s,id,'external_deliver',{quantity:31})));
 ({s}=run(s,cmd(s,id,'external_return_accept',{quantity:20,externalReturnId:presented.result.id}),keeper));eq(s.movements.length,3);eq(balance(s,'prod','w','b').onHand,20);eq(externalUnavailable(s,'res'),30);eq(externalLineMetrics(s,line(s,id)).custody,30);
 no(()=>run(s,cmd(s,id,'external_return_accept',{quantity:1,externalReturnId:presented.result.id}),keeper));
 ({s}=run(s,cmd(s,id,'external_deliver',{quantity:30})));eq(s.handoffs.find(h=>h.id===id).status,'completed');eq(externalUnavailable(s,'res'),0);eq(externalLineMetrics(s,line(s,id)).delivered,40);
 const delivered=s.deliveries[0];const ret=run(s,cmd(s,id,'external_return',{quantity:5,warehouseId:'w',reason:'Customer return',source:'delivered',originalDeliveryId:delivered.id}));s=ret.s;eq(externalLineMetrics(s,line(s,id)).custody,5);eq(externalUnavailable(s,'res'),0);
 ({s}=run(s,cmd(s,id,'external_return_accept',{quantity:5,externalReturnId:ret.result.id}),keeper));eq(balance(s,'prod','w','b').onHand,25);eq(externalLineMetrics(s,line(s,id)).returnedCustomer,5);
}
{
 let {s,result}=save(fixture('held'));const id=result.id;
 no(()=>run(s,cmd(s,id,'external_handover')));
 let r=run(s,cmd(s,id,'external_warehouse_release',{quantity:0,reason:'No stock presented'}),keeper);s=r.s;eq(r.result.pending,true);eq(s.movements.length,1);
 r=run(s,cmd(s,id,'external_handover',{quantity:100,reason:'Carrier reports different quantity'}));s=r.s;eq(r.result.pending,true);eq(r.result.issued,0);eq(s.movements.length,1);
 no(()=>run(s,cmd(s,id,'external_warehouse_release'),keeper));
 r=run(s,cmd(s,id,'external_warehouse_release',{reason:'Corrected after recount'}),keeper);s=r.s;eq(s.handoffs.filter(h=>h.eventType==='warehouse_release').length,2);
 no(()=>run(s,cmd(s,id,'external_handover'),{...keeper,role:'owner'}));
 ({s}=run(s,cmd(s,id,'external_handover')));eq(s.movements.filter(m=>m.type==='issue').length,1);eq(s.reservations[0].status,'issued');eq(balance(s,'prod','w','b').onHand,0);
 no(()=>run(s,cmd(s,id,'external_handover')));eq(s.movements.filter(m=>m.type==='issue').length,1);
 ({s}=run(s,cmd(s,id,'external_deliver')));eq(s.handoffs.find(h=>h.id===id).status,'delivered');eq(externalUnavailable(s,'res'),0);
}
{
 let {s,result}=save(fixture());const id=result.id;
 no(()=>run(s,cmd(s,id,'external_handover',{documentId:undefined})));
 s.documents.push({id:'wrong',code:'WR',requestId:'other',objectKey:'not-this-request'});no(()=>run(s,cmd(s,id,'external_handover',{documentId:'wrong'})));
 ({s}=run(s,{type:'external_document',shipmentId:id,documentId:'doc',documentType:'waybill',number:'BOL-1'}));eq(s.handoffs.find(h=>h.type==='external_document').number,'BOL-1');
 ({s}=run(s,{type:'external_cost',shipmentId:id,costType:'freight',amount:'1250',currency:'EGP'}));eq(s.handoffs.find(h=>h.type==='external_cost').amountMinor,125000);eq(s.handoffs.find(h=>h.id===id).declaredValueMinor,170000000);
 ({s}=run(s,{type:'external_invoice',shipmentIds:[id],invoiceType:'transport',issuer:'Synthetic carrier',invoiceNumber:'678',issueDate:'2026-10-22',currency:'EGP',amount:'1250'}));
 no(()=>run(s,{type:'external_invoice',shipmentIds:[id],invoiceType:'transport',issuer:'Another issuer',invoiceNumber:'679',issueDate:'2026-10-22',currency:'EGP',amount:'1250'}));
 ({s}=run(s,{type:'external_invoice',shipmentIds:[id],invoiceType:'goods',issuer:'Synthetic goods issuer',invoiceNumber:'678',issueDate:'2026-10-22',currency:'EGP',amount:'1700000'}));eq(s.handoffs.filter(h=>h.type==='external_invoice').length,2);
 no(()=>run(s,{type:'external_invoice',shipmentIds:[id],invoiceType:'goods',issuer:'Synthetic goods issuer',invoiceNumber:'678',issueDate:'2026-10-22',currency:'EGP',amount:'1700000'}));
}
{
 const before=fixture();const r=save(before,100,{mode:'historical',projectId:'p',lines:[{description:'Historical description only',quantity:2000,unitLabel:'unknown unit',packaging:'cartons'}]});eq(r.s.movements,before.movements);eq(r.s.reservations,before.reservations);eq(r.s.handoffs.find(h=>h.id===r.result.id).status,'historical');eq(externalUnavailable(r.s,'res'),0);no(()=>run(r.s,cmd(r.s,r.result.id,'external_handover')));
 no(()=>save(fixture(),100,{plannedLoadAt:'2026-10-22T12:00'}));no(()=>save(fixture(),100,{plannedLoadAt:'2026-10-23',plannedDeliveryAt:'2026-10-22'}));
 const s=fixture();s.carriers[0].relationshipStatus='suspended';no(()=>save(s));
 const q=save(fixture());const cancelled=run(q.s,{type:'external_shipment_cancel',shipmentId:q.result.id,reason:'Cancelled before handover'});eq(externalUnavailable(cancelled.s,'res'),0);
}
{
 let {s,result}=save(fixture('held'));const id=result.id;s.requests[0].status='reserved';
 no(()=>run(s,cmd(s,id,'external_warehouse_release'),keeper));s.requests[0].status='ready';
 s.handoffs.push({id:'old-confirmation',code:'OC',type:'loading_confirmation',reservationId:'res',status:'mismatch'});
 no(()=>run(s,cmd(s,id,'external_warehouse_release'),keeper));
 s.handoffs.pop();s.requests[0].requestType='distribution';s.requests[0].status='reserved';
 no(()=>run(s,cmd(s,id,'external_warehouse_release'),keeper));s.requests[0].authorizationCode='AUTH-REQ';s.requests[0].authorizedBy='op';
 ({s}=run(s,cmd(s,id,'external_warehouse_release'),keeper));eq(s.handoffs.some(e=>e.eventType==='warehouse_release'),true);
}
{
 let {s,result}=save(fixture());const id=result.id;
 ({s}=run(s,{type:'external_document',shipmentId:id,documentId:'doc',documentType:'waybill',number:'BOL'}));
 no(()=>save(s,100,{shipmentId:id}));
 ({s}=run(s,{type:'external_cost',shipmentId:id,costType:'freight',amount:'100',currency:'EGP'}));
 no(()=>run(s,{type:'external_shipment_cancel',shipmentId:id,reason:'Cancelled'}));
 ({s}=run(s,cmd(s,id,'external_handover')));
 ({s}=run(s,cmd(s,id,'external_deliver')));s.requests[0].status='closed';
 const ret=run(s,cmd(s,id,'external_return',{quantity:10,source:'delivered',originalDeliveryId:s.deliveries[0].id,warehouseId:'w',reason:'Late customer return'}));
 ({s}=run(ret.s,cmd(ret.s,id,'external_return_accept',{quantity:10,externalReturnId:ret.result.id}),keeper));eq(s.requests[0].status,'closed');eq(balance(s,'prod','w','b').onHand,10);
}
{
 let s=fixture('held');s.requests[0].requestType='purchase_receipt';s.requests[0].status='closed';s.requests[0].distributionPlans=[{id:'dp',code:'DIST',status:'ready'}];
 Object.assign(s.tasks[0],{distributionPlanId:'dp',receiptMovementId:'receipt'});Object.assign(s.reservations[0],{distributionPlanId:'dp',receiptMovementId:'receipt'});
 s.movements[0].id='receipt';s.movements[0].requestId='r';s.movements[0].type='purchase_receipt';
 let out=save(s);s=out.s;const id=out.result.id;
 ({s}=run(s,cmd(s,id,'external_warehouse_release'),keeper));({s}=run(s,cmd(s,id,'external_handover')));eq(s.requests[0].status,'closed');eq(s.requests[0].distributionPlans[0].status,'in_transit');
 ({s}=run(s,cmd(s,id,'external_deliver')));eq(s.requests[0].status,'closed');eq(s.requests[0].distributionPlans[0].status,'completed');eq(s.tasks[0].status,'completed');eq(s.deliveries[0].distributionPlanId,'dp');
}
{
 const s=fixture();s.tasks[0].quantity=40;no(()=>save(s,41));
 const first=save(s,30);no(()=>save(first.s,11));const second=save(first.s,10);eq(externalUnavailable(second.s,'res'),40);
 no(()=>save(fixture(),100,{lines:[{reservationId:'res',taskId:'t',quantity:100,packageCount:1.5}]}));
}
console.log(JSON.stringify({suite:'external transport domain',checks,status:'PASS'}));
