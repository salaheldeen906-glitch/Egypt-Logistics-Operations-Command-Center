import {execute} from '@/lib/engine';
import {emptyState,type Actor,type Command,type State} from '@/lib/model';

/** Entirely synthetic, browser-memory-only fixture. Never imported by the live app. */
export const REVIEW_NOW='2026-10-22T09:00:00Z';
export function createQuantityReview(){
 let state=emptyState();
 const owner:Actor={userId:'REVIEW-OWNER',name:'مالك التجربة المعزولة',role:'owner',function:'all',active:1,projectIds:null,warehouseIds:null,resourceIds:null};
 const act=(command:Command,actor=owner)=>{const out=execute(state,actor,command,REVIEW_NOW);state=out.state;return out.result;};
 const master=(kind:string,code:string,name:string,extra:Record<string,unknown>={})=>act({type:'master',kind,data:{code,name,...extra}}).id as string;
 const unitId=master('units','REVIEW-BOX','صندوق');
 const projectNames=[['DENTAL','الأسنان · Dental'],['IVF','الحقن المجهري · IVF'],['ONCOLOGY','الأورام · Oncology'],['DEVICES','الأجهزة · Devices']];
 const projectIds=projectNames.map(([code,name])=>master('projects','REVIEW-'+code,name));
 const warehouses=[master('warehouses','REVIEW-WH-CAI','مخزن القاهرة — تجريبي'),master('warehouses','REVIEW-WH-GIZ','مخزن الجيزة — تجريبي')];
 const executorId=master('resources','REVIEW-COURIER','أحمد — مندوب تجريبي');
 const carrierId=master('carriers','REVIEW-FLEET','أسطول داف — تجريبي');
 const customerId=master('customers','REVIEW-CUSTOMER','مركز طبي — عميل تجريبي',{address:'القاهرة، مدينة نصر، عنوان تجريبي',governorate:'cairo'});
 const projectId=projectIds[0];
 const p=master('products','REVIEW-LOAD-PRODUCT','طقم أسنان — تجريبي',{projectId,unitId,tracked:true,expiry:true});
 const batchId=master('batches','REVIEW-BATCH-A','تشغيلة تجريبية A',{productId:p,expiryDate:'2027-12-31'});
 act({type:'opening',productCode:'REVIEW-LOAD-PRODUCT',warehouseId:warehouses[0],batchId,quantity:1000,reason:'رصيد وهمي — معاينة معزولة فقط',reference:'REVIEW-20261022'});
 const shortageProduct=master('products','REVIEW-SHORTAGE-PRODUCT','مستهلكات — اختبار العجز',{projectId,unitId});
 for(const [warehouseId,quantity] of [[warehouses[0],600],[warehouses[1],400]] as const)act({type:'opening',productCode:'REVIEW-SHORTAGE-PRODUCT',warehouseId,quantity,reason:'رصيد وهمي لكشف العجز بين مخزنين',reference:'REVIEW-20261022'});
 // The remaining projects exist as scope records, never as fabricated operational history.
 projectIds.slice(1).forEach((id,index)=>master('products','REVIEW-OTHER-'+index,'منتج تجريبي · '+projectNames[index+1][1],{projectId:id,unitId}));
 const actors:Record<string,Actor>={
  warehouse:{userId:'REVIEW-KEEPER',name:'محمود — مسؤول المخزن',role:'contributor',function:'warehouse',active:1,projectIds:[projectId],warehouseIds:[warehouses[0]],resourceIds:null},
  courier:{userId:'REVIEW-COURIER-USER',name:'أحمد — حساب المندوب',role:'contributor',function:'representative',active:1,projectIds:[projectId],warehouseIds:null,resourceIds:[executorId]},
  dispatcher:{userId:'REVIEW-DISPATCH',name:'سارة — مدير الحركة',role:'contributor',function:'dispatcher',active:1,projectIds,warehouseIds:null,resourceIds:null},
  project_manager:{userId:'REVIEW-PM',name:'علي — مدير المشروع',role:'contributor',function:'project_manager',active:1,projectIds,warehouseIds:null,resourceIds:null},
  owner,
 };
 const draft=(code:string,productId:string,quantity:number)=>act({type:'create_request',code,requestType:'delivery',loadingProtocol:'dual',projectId,customerId,destination:'القاهرة، مدينة نصر — وجهة تجريبية',governorate:'cairo',dueDate:'2026-10-30',lines:[{productId,quantity,unitPrice:'125.00',currency:'EGP'}]}).id as string;
 function ready(code:string,quantity=100){
  const requestId=draft(code,p,quantity);act({type:'submit',requestId});act({type:'approve',requestId});
  const line=state.lines.find(l=>l.requestId===requestId)!;
  act({type:'reserve',requestId,batchRows:[{lineId:line.id,warehouseId:warehouses[0],batchId,quantity}]});
  const res=state.reservations.find(x=>x.requestId===requestId)!;
  act({type:'assign',requestId,reservationId:res.id,executorId,carrierId});act({type:'verify_documents',requestId});
  act({type:'create_route',code:code+'-TRIP',name:'رحلة تجريبية '+code,requestIds:[requestId]});
  return {requestId,reservationId:res.id,lineId:line.id};
 }
 const receive=ready('REVIEW-RECEIVE');
 act({type:'warehouse_release',requestId:receive.requestId,reservationId:receive.reservationId,quantity:100},actors.warehouse);
 const difference=ready('REVIEW-DIFF');
 const release=act({type:'warehouse_release',requestId:difference.requestId,reservationId:difference.reservationId,quantity:100},actors.warehouse);
 act({type:'courier_collect',requestId:difference.requestId,loadingId:release.loadingId,quantity:95,reason:'عدّ المندوب 95 صندوقًا فقط — فرق تجريبي'},actors.courier);
 const increase=ready('REVIEW-INCREASE');
 // The source implementation, not a precomputed fake approval, creates this scenario.
 act({type:'propose_quantity_increase',requestId:increase.requestId,lineId:increase.lineId,reservationId:increase.reservationId,newQuantity:120,reason:'طلب العميل إضافة 20 صندوقًا — حالة مراجعة تجريبية'},actors.project_manager);
 const completed=ready('REVIEW-ISSUED');
 const completeRelease=act({type:'warehouse_release',requestId:completed.requestId,reservationId:completed.reservationId,quantity:100},actors.warehouse);
 act({type:'courier_collect',requestId:completed.requestId,loadingId:completeRelease.loadingId,quantity:100},actors.courier);
 const shortage=draft('REVIEW-SHORTAGE',shortageProduct,1000);
 for(const kind of Object.keys(state) as (keyof State)[])state[kind].forEach(row=>{row.synthetic=true;row.demoDatasetId='QUANTITY-REVIEW-20261022';});
 return {state,actors,shortcuts:{receive:receive.requestId,difference:difference.requestId,increase:increase.requestId,issued:completed.requestId,shortage},projectIds,warehouses,executorId};
}
