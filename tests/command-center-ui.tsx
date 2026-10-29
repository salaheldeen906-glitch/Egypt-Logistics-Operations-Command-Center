import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuidedAction} from '../app/guided-action';
import {LoadingSummary} from '../app/loading-summary';
import {execute} from '../lib/engine';
import {emptyState,type Actor,type Command,type Row} from '../lib/model';
import {guidedStep} from '../lib/guided-step';

const now='2026-10-13T12:00:00Z';
const owner:Actor={userId:'cc-ui-owner',name:'Test owner',role:'owner',function:'all',active:1};
const noRun=async()=>({}),noUpload=async()=>undefined;
let passed=0;
function test(name:string,fn:()=>void){fn();passed++;console.log('PASS',name);}

function fixture(){
 let state=execute(emptyState(),owner,{type:'seed'},now).state;
 const act=(command:Command,actor=owner)=>{const out=execute(state,actor,command,now);state=out.state;return out.result;};
 const [cairo,giza]=state.warehouses,executor=state.resources[0];
 const keeper:Actor={userId:'cc-ui-cairo',name:'Cairo keeper',role:'contributor',function:'warehouse',active:1,warehouseIds:[cairo.id]};
 const secondKeeper:Actor={...keeper,userId:'cc-ui-giza',name:'Giza keeper',warehouseIds:[giza.id]};
 const courier:Actor={userId:'cc-ui-courier',name:'Assigned courier',role:'contributor',function:'representative',active:1,resourceIds:[executor.id]};
 const productId=act({type:'master',kind:'products',data:{code:'CC-TRACKED',name:'Tracked UI fixture',projectId:state.projects[0].id,unitId:state.units[0].id,tracked:true,expiry:true}}).id;
 const product=state.products.find(p=>p.id===productId)!;
 const firstBatch=act({type:'master',kind:'batches',data:{code:'CC-LOT-2030',name:'First source batch',productId,expiryDate:'2030-03-01'}}).id;
 const secondBatch=act({type:'master',kind:'batches',data:{code:'CC-LOT-2031',name:'Second source batch',productId,expiryDate:'2031-09-01'}}).id;
 act({type:'opening',productCode:product.code,warehouseId:cairo.id,batchId:firstBatch,quantity:80,reason:'Isolated UI fixture'});
 act({type:'opening',productCode:product.code,warehouseId:giza.id,batchId:secondBatch,quantity:70,reason:'Isolated UI fixture'});
 const requestId=act({type:'create_request',requestType:'delivery',loadingProtocol:'dual',code:'CC-UI-DUAL',projectId:product.projectId,customerId:state.customers[0].id,destination:'Test client site',lines:[{productId,quantity:100}]}).id;
 act({type:'submit',requestId});act({type:'approve',requestId});
 const line=state.lines.find(l=>l.requestId===requestId)!;
 act({type:'reserve',requestId,batchRows:[{lineId:line.id,warehouseId:cairo.id,batchId:firstBatch,quantity:60},{lineId:line.id,warehouseId:giza.id,batchId:secondBatch,quantity:40}]});
 const [first,second]=state.reservations.filter(res=>res.requestId===requestId);
 for(const res of [first,second])act({type:'assign',requestId,reservationId:res.id,executorId:executor.id,carrierId:state.carriers[0].id});
 act({type:'verify_documents',requestId});
 const routeId=act({type:'create_route',code:'CC-UI-RT',name:'Two source test route',requestIds:[requestId]}).id;
 const request=()=>state.requests.find(r=>r.id===requestId)!;
 const render=(actor:Actor,ar=true)=>renderToStaticMarkup(<GuidedAction s={state} r={request()} actor={actor} ar={ar} run={noRun} upload={noUpload} onDetails={()=>{}}/>);
 const summary=(ar=true)=>renderToStaticMarkup(<LoadingSummary s={state} r={request()} ar={ar}/>);
 const release=(reservation:Row,quantity:number,actor=keeper)=>act({type:'warehouse_release',requestId,reservationId:reservation.id,quantity,reason:'Actual partial source release'},actor);
 const collect=(loadingId:string,quantity:number)=>act({type:'courier_collect',requestId,loadingId,quantity,reason:'Independently counted actual receipt'},courier);
 return {get state(){return state;},act,request,render,summary,release,collect,keeper,secondKeeper,courier,cairo,giza,first,second,requestId,routeId};
}
function currentQuantityInput(html:string,label:string){
 const input=[...html.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]).find(tag=>tag.includes(`aria-label="${label}"`));
 assert(input,`Expected explicitly labelled current-quantity input: ${label}`);
 return input;
}
const form='aria-label="تنفيذ الخطوة الحالية"';

let f=fixture();
test('Keeper receives the actual warehouse release form linked to its source batch and task',()=>{
 const html=f.render(f.keeper),step=guidedStep(f.state,f.request());
 assert.equal(step.action,'warehouse_release');assert.equal(step.command.reservationId,f.first.id);
 assert(html.includes(form));assert(html.includes('سلّمت كام للمندوب فعلًا؟'));
 assert(html.includes('تسجيل تسليم المخزن — انتظار تأكيد المندوب'));
 assert(html.includes('CC-LOT-2030'));assert(html.includes('2030-03-01'));
 assert(currentQuantityInput(html,'سلّمت كام للمندوب فعلًا؟').includes('value=""'));
});
test('Courier waits for the keeper and has no form before the source has a release confirmation',()=>{
 const html=f.render(f.courier);assert(html.includes('guided-wait'));assert(html.includes('أمين المخزن'));assert(!html.includes(form));
});
test('Loading ledger displays two source rows with their own warehouses, planned quantities and expiry',()=>{
 const html=f.summary();assert.equal((html.match(/<tbody><tr>|<\/tr><tr>/g)||[]).length,2);
 assert(html.includes(f.cairo.name));assert(html.includes(f.giza.name));
 assert(html.includes('CC-LOT-2030'));assert(html.includes('2030-03-01'));assert(html.includes('CC-LOT-2031'));assert(html.includes('2031-09-01'));
 assert(html.includes('المحجوز المخطط'));assert(html.includes('سلّمه المخزن'));assert(html.includes('استلمه المندوب'));assert(html.includes('غير المحمل'));
 assert(html.includes('<td>60</td>'));assert(html.includes('<td>40</td>'));
});

const first=f.release(f.first,50);
test('After warehouse recording the keeper sees an explicit courier wait instead of a second release form',()=>{
 const html=f.render(f.keeper);assert(html.includes('guided-wait'));assert(html.includes('المندوب'));assert(!html.includes(form));assert(html.includes('ينتظر تأكيد المندوب'));
});
test('Courier has an independent empty input and can see the keeper reported fifty without prefilling it',()=>{
 const html=f.render(f.courier),input=currentQuantityInput(html,'استلمت كام من المخزن فعلًا؟');
 assert(html.includes(form));assert(html.includes('المخزن أكد تسليم 50'));
 assert(html.includes('تأكيد استلامي الفعلي ومراجعة الاتفاق'));assert(input.includes('value=""'));assert(!input.includes('value="50"'));assert(input.includes('max="60"'));
});
test('Owner with all functions cannot supply the courier signature through the guided screen',()=>{
 const html=f.render(owner);assert(!html.includes(form));assert(html.includes('guided-wait'));assert(html.includes('المندوب'));
});

f.collect(first.loadingId,50);
test('Posted partial loading ledger keeps the held remainder visible and suppresses the child issue duplicate',()=>{
 const html=f.summary();assert.equal((html.match(/<tbody><tr>|<\/tr><tr>/g)||[]).length,2);
 assert(html.includes('تم تحميل جزئي؛ المتبقي محجوز'));assert(html.includes('<td>10</td>'));assert(html.includes('<td>60</td>'));
 assert(html.includes('CC-LOT-2030'));assert(html.includes('CC-LOT-2031'));
});
test('After the first source the next guided form names the second source and preserves its expiry',()=>{
 const step=guidedStep(f.state,f.request()),html=f.render(f.secondKeeper);
 assert.equal(step.action,'warehouse_release');assert.equal(step.command.reservationId,f.second.id);
 assert.equal(step.source,f.giza.name);assert.equal(step.max,40);
 assert(html.includes(form));assert(html.includes('CC-LOT-2031'));assert(html.includes('2031-09-01'));
});

f=fixture();const differing=f.release(f.first,55);f.collect(differing.loadingId,50);
test('A mismatch shows both independent counts and the unposted reason with no executable form',()=>{
 const html=f.render(owner),step=guidedStep(f.state,f.request());
 assert.equal(step.action,'loading_mismatch');assert(html.includes('سبب التوقف'));
 assert(html.includes('المخزن سلّم 55 والمندوب أكد 50'));assert(html.includes('لم تُرحّل للعهدة'));assert(html.includes('قاعدة حسم الفرق تحتاج اعتمادًا'));
 assert(!html.includes(form));assert(f.summary().includes('فرق 5 — مراجعة العمليات'));
});

f=fixture();const returnable=f.release(f.first,50);f.collect(returnable.loadingId,50);
const sourceTask=f.state.tasks.find(t=>t.id===f.state.reservations.find(res=>res.id===f.first.id)?.taskId)!;
const returnTask=f.act({type:'plan_return',requestId:f.requestId,taskId:sourceTask.id,quantity:5,warehouseId:f.cairo.id,reason:'Actual undelivered remainder'},f.courier);
test('Pending return opens the courier drop-off step ahead of the other source loading step',()=>{
 const step=guidedStep(f.state,f.request()),html=f.render(f.courier);
 assert.equal(step.action,'return_arrive');assert.equal(step.command.taskId,returnTask.id);
 assert(html.includes(form));assert(html.includes('المندوب: قدّمت للمخزن كام؟'));assert(!html.includes('تسجيل تسليم المخزن — انتظار تأكيد المندوب'));
 assert(html.includes('خط سير المرتجع'));assert(html.includes('CC-LOT-2030'));
});
f.act({type:'return_arrive',requestId:f.requestId,taskId:returnTask.id,quantity:5},f.courier);
test('Presented return leads directly to keeper acceptance while the source-loading ledger stays available',()=>{
 const keeperHtml=f.render(f.keeper),courierHtml=f.render(f.courier),step=guidedStep(f.state,f.request());
 assert.equal(step.action,'receive_return');assert(keeperHtml.includes('تأكيد المقبول وإضافة الرصيد'));assert(keeperHtml.includes(form));
 assert(keeperHtml.includes('خط سير التحميل — المخزن ثم المندوب'));assert(keeperHtml.includes('CC-LOT-2031'));
 assert(!courierHtml.includes(form));assert(courierHtml.includes('guided-wait'));
});
test('English rendering preserves the source-specific ledger meaning and current acceptance action',()=>{
 const html=f.render(f.keeper,false);assert(html.includes('Warehouse: actual acceptance'));assert(html.includes('Warehouse / batch'));
 assert(html.includes('Keeper released'));assert(html.includes('Courier received'));assert(html.includes('Not loaded'));assert(html.includes('Execute current step'));
});
console.log(JSON.stringify({suite:'Command Center server-rendered loading and return screens (not browser QA)',pass:passed,fail:0}));
