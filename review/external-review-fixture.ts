import {execute} from '@/lib/engine';
import {emptyState,type Actor,type Command,type State} from '@/lib/model';

/** Synthetic fixtures for a disposable, network-denied review. Never loaded by the live app. */
export const EXTERNAL_REVIEW_NOW='2026-10-22T09:00:00Z';
export function createExternalReview(options:{prepared?:boolean}={}){
 let state=emptyState();
 const owner:Actor={userId:'EXT-REVIEW-OWNER',name:'مالك تجريبي — ليس حساب التشغيل',role:'owner',function:'all',active:1,projectIds:null,warehouseIds:null,resourceIds:null};
 const act=(command:Command,actor=owner)=>{const out=execute(state,actor,command,EXTERNAL_REVIEW_NOW);state=out.state;return out.result;};
 const master=(kind:string,code:string,name:string,extra:Record<string,unknown>={})=>act({type:'master',kind,data:{code,name,...extra}}).id as string;
 const unitId=master('units','EXT-REVIEW-BOX','صندوق');
 const projectIds=[master('projects','EXT-REVIEW-DENTAL','الأسنان — مشروع اختبار'),master('projects','EXT-REVIEW-DEVICES','الأجهزة — مشروع اختبار')];
 const warehouseId=master('warehouses','EXT-REVIEW-WH','مخزن تجريبي — القاهرة');
 const executorId=master('resources','EXT-REVIEW-COURIER','مندوب داخلي تجريبي');
 const carrierId=master('carriers','EXT-REVIEW-CARRIER','ناقل خارجي تجريبي');
 const customerId=master('customers','EXT-REVIEW-CLIENT','عميل الاختبار فقط',{address:'عنوان تجريبي في الجيزة',governorate:'giza'});
 const products=projectIds.map((projectId,index)=>master('products','EXT-REVIEW-PRODUCT-'+index,'منتج وهمي '+(index+1),{projectId,unitId,tracked:true,expiry:true}));
 const batchIds=products.map((productId,index)=>master('batches','EXT-REVIEW-BATCH-'+index,'باتش تجريبي '+(index+1),{productId,expiryDate:'2027-12-31'}));
 products.forEach((productId,index)=>act({type:'opening',productCode:state.products.find(p=>p.id===productId)!.code,warehouseId,batchId:batchIds[index],quantity:500,reason:'بيانات وهمية داخل ذاكرة المعاينة فقط'}));
 const actors:Record<string,Actor>={
  owner,
  warehouse:{userId:'EXT-REVIEW-KEEPER',name:'مسؤول مخزن تجريبي',role:'contributor',function:'warehouse',active:1,projectIds,warehouseIds:[warehouseId],resourceIds:null},
  courier:{userId:'EXT-REVIEW-COURIER-USER',name:'مندوب داخلي تجريبي',role:'contributor',function:'representative',active:1,projectIds,warehouseIds:null,resourceIds:[executorId]},
  dispatcher:{userId:'EXT-REVIEW-DISPATCH',name:'مدير حركة تجريبي',role:'contributor',function:'dispatcher',active:1,projectIds,warehouseIds:null,resourceIds:null},
  scoped_dispatcher:{userId:'EXT-REVIEW-SCOPED',name:'مدير حركة — مشروع الأسنان فقط',role:'contributor',function:'dispatcher',active:1,projectIds:[projectIds[0]],warehouseIds:null,resourceIds:null},
  viewer:{userId:'EXT-REVIEW-VIEWER',name:'قارئ تجريبي — دون كتابة',role:'viewer',function:'all',active:1,projectIds,warehouseIds:null,resourceIds:null},
 };
 function ready(index:number){
  const requestId=act({type:'create_request',code:'EXT-REVIEW-REQ-'+(index+1),requestType:'delivery',loadingProtocol:'dual',projectId:projectIds[index],customerId,destination:index?'الإسكندرية — عنوان عميل تجريبي':'الجيزة — عنوان عميل تجريبي',governorate:index?'alexandria':'giza',dueDate:'2026-10-30',lines:[{productId:products[index],quantity:100,unitPrice:'125.00',currency:'EGP'}]}).id as string;
  act({type:'submit',requestId});act({type:'approve',requestId});
  const line=state.lines.find(l=>l.requestId===requestId)!;
  act({type:'reserve',requestId,batchRows:[{lineId:line.id,warehouseId,batchId:batchIds[index],quantity:100}]});
  const reservation=state.reservations.find(r=>r.requestId===requestId)!;
  act({type:'assign',requestId,reservationId:reservation.id,executorId,carrierId});
  act({type:'verify_documents',requestId});
  act({type:'create_route',code:'EXT-REVIEW-ROUTE-'+index,name:'رحلة وهمية '+index,requestIds:[requestId]});
  const documentId='EXT-REVIEW-PROOF-'+index;
  state.documents.push({id:documentId,code:documentId,name:'إثبات تجريبي '+(index+1)+'.pdf',requestId,purpose:'other',mime:'application/pdf',size:1024,objectKey:'synthetic-only/'+documentId,createdBy:actors.warehouse.userId,createdAt:EXTERNAL_REVIEW_NOW,synthetic:true});
  return {requestId,reservationId:reservation.id,taskId:reservation.taskId||state.tasks.find(t=>t.reservationId===reservation.id)?.id||'',documentId,productId:products[index],batchId:batchIds[index]};
 }
 const held=ready(0),issued=ready(1);
 const release=act({type:'warehouse_release',requestId:issued.requestId,reservationId:issued.reservationId,quantity:100},actors.warehouse);
 act({type:'courier_collect',requestId:issued.requestId,loadingId:release.loadingId,quantity:100},actors.courier);
 const shipmentIds:string[]=[];
 if(options.prepared)for(const [index,source] of [held,issued].entries())shipmentIds.push(act({type:'external_shipment_save',code:'EXT-REVIEW-SHIPMENT-'+(index+1),carrierId,driverName:'سائق خارجي تجريبي',driverPhone:'01000000000',vehicleType:'سيارة اختبار',plateNumber:'1234',plateLetters:'أ ب ج',participantRole:'driver',participantName:'سائق خارجي تجريبي',origin:'مخزن القاهرة — تجريبي',originAddress:'القاهرة — عنوان تجريبي',originGovernorate:'cairo',destination:index?'الإسكندرية — عميل تجريبي':'الجيزة — عميل تجريبي',destinationAddress:'عنوان عميل وهمي '+(index+1),destinationGovernorate:index?'alexandria':'giza',plannedLoadAt:'2026-10-22T09:00:00Z',plannedDeliveryAt:'2026-10-30T09:00:00Z',declaredValue:'12500.00',currency:'EGP',lines:[{reservationId:source.reservationId,taskId:source.taskId,quantity:100,packageCount:10,packaging:'كراتين اختبار'}]},actors.dispatcher).id);
 for(const kind of Object.keys(state) as (keyof State)[])state[kind].forEach(row=>{row.synthetic=true;row.demoDatasetId='EXTERNAL-REVIEW-20261022';});
 return {state,actors,held,issued,shipmentIds,projectIds,warehouseId,executorId,carrierId,unitId};
}
