import {emptyState,kinds,type Row,type State} from './model';

/** Synthetic, deterministic fixtures only. This module has no transport, storage or seed command. */
export const REPORTS_SAMPLE_MANIFEST={
 id:'DEMO-REPORTS-20261021-v1',synthetic:true,operationalUse:false,
 customersPerProject:200,productsPerProject:500,requestsPerProject:500,
 projectCount:4,customerCount:800,productCount:2000,requestCount:2000,
 governorateCount:14,from:'2026-10-01',to:'2026-10-21',currency:'EGP',
 source:'deterministic-synthetic-report-fixtures',
 statuses:['closed','delivered','delivering','in_transit','draft','review','approved','failed'] as const,
};
export const REPORTS_SAMPLE_GOVERNORATES=[
 ['cairo','القاهرة',['مدينة نصر','المعادي','شبرا']],
 ['giza','الجيزة',['الدقي','الهرم','الشيخ زايد']],
 ['alexandria','الإسكندرية',['سموحة','سيدي جابر','المنتزه']],
 ['qalyubia','القليوبية',['بنها','شبرا الخيمة','قليوب']],
 ['sharqia','الشرقية',['الزقازيق','العاشر من رمضان','بلبيس']],
 ['daqahlia','الدقهلية',['المنصورة','طلخا','ميت غمر']],
 ['gharbia','الغربية',['طنطا','المحلة الكبرى','زفتى']],
 ['monufia','المنوفية',['شبين الكوم','قويسنا','السادات']],
 ['beheira','البحيرة',['دمنهور','كفر الدوار','رشيد']],
 ['kafr-elsheikh','كفر الشيخ',['دسوق','بيلا','فوه']],
 ['damietta','دمياط',['دمياط الجديدة','رأس البر','فارسكور']],
 ['port-said','بورسعيد',['الشرق','الضواحي','بورفؤاد']],
 ['ismailia','الإسماعيلية',['القنطرة','فايد','التل الكبير']],
 ['suez','السويس',['الأربعين','عتاقة','فيصل']],
] as const;
const projects=[['DENTAL','Dental · الأسنان','مستلزم أسنان'],['IVF','IVF · الحقن المجهري','مستلزم حقن مجهري'],['ONCOLOGY','Oncology · الأورام','مستلزم أورام'],['DEVICES','Devices · الأجهزة','جهاز طبي']] as const;
const serial=(n:number)=>String(n+1).padStart(3,'0');
const unitBox='DEMO-UNIT-BOX',unitDevice='DEMO-UNIT-DEVICE';
const timestamp=(day:number,hour=9)=>`2026-10-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00Z`;
const dayFor=(index:number)=>1+index%19;
const row=(id:string,fields:Record<string,unknown>):Row=>({id,code:id,synthetic:true,demoDatasetId:REPORTS_SAMPLE_MANIFEST.id,...fields});

export function createReportsSampleState():State{
 const s=emptyState();
 s.units=[row(unitBox,{name:'صندوق'}),row(unitDevice,{name:'جهاز'})];
 for(const [projectIndex,[projectCode,name,productLabel]] of projects.entries()){
  const projectId='DEMO-PROJECT-'+projectCode,warehouseId='DEMO-WAREHOUSE-'+projectCode,carrierId='DEMO-CARRIER-'+projectCode;
  s.projects.push(row(projectId,{name,active:true}));
  s.warehouses.push(row(warehouseId,{name:'مخزن تجريبي · '+name,projectId}));
  s.carriers.push(row(carrierId,{name:'ناقل تجريبي · '+name}));
  for(let c=0;c<8;c++)s.resources.push(row(`DEMO-COURIER-${projectCode}-${serial(c)}`,{name:`مندوب تجريبي ${c+1} · ${projectCode}`,resourceType:'courier',active:true}));
  for(let c=0;c<200;c++){
   const customerId=`DEMO-CUSTOMER-${projectCode}-${serial(c)}`,gov=REPORTS_SAMPLE_GOVERNORATES[c%14],area=gov[2][Math.floor(c/14)%3];
   s.customers.push(row(customerId,{name:`عميل تجريبي ${serial(c)} · ${projectCode}`,projectId,active:true,address:`عنوان تجريبي — ${gov[1]}، ${area}`,governorate:gov[0]}));
   // A second branch provides a deliberately distinct operational destination, not a second customer.
   for(let branch=0;branch<(c%5===0?2:1);branch++){
    const branchGov=REPORTS_SAMPLE_GOVERNORATES[(c+branch*3)%14],branchArea=branchGov[2][(Math.floor(c/14)+branch)%3];
    s.customer_sites.push(row(`DEMO-SITE-${projectCode}-${serial(c)}-${branch+1}`,{customerId,projectId,name:`فرع تجريبي ${branch+1} — ${branchArea}`,governorate:branchGov[0],area:branchArea,address:`عنوان تجريبي — ${branchGov[1]}، ${branchArea}، مبنى اختبار ${c+1} / ${branch+1}`,active:true}));
   }
  }
  for(let i=0;i<500;i++){
   const number=serial(i),productId=`DEMO-PRODUCT-${projectCode}-${number}`,requestId=`DEMO-REQ-${projectCode}-${number}`,lineId=`DEMO-LINE-${projectCode}-${number}`;
   const customerIndex=i%200,customerId=`DEMO-CUSTOMER-${projectCode}-${serial(customerIndex)}`,primarySite=s.customer_sites.find(site=>site.id===`DEMO-SITE-${projectCode}-${serial(customerIndex)}-1`)!;
   const unitId=i%5===0?unitDevice:unitBox,tracked=i%4!==3,expiry=tracked&&i%5!==0,batchId=tracked?`DEMO-BATCH-${projectCode}-${number}-A`:'',status=REPORTS_SAMPLE_MANIFEST.statuses[i%8];
   const quantity=20+(i%11)*4,day=dayFor(i),createdAt=timestamp(day),priceMinor=i%17===0?null:i%19===0?0:10000+projectIndex*2500+(i%37)*125;
   const metadata={unitPrice:priceMinor===null?null:(priceMinor/100).toFixed(2),priceMinor,currency:'EGP',free:priceMinor===0};
   s.products.push(row(productId,{name:`${productLabel} تجريبي ${number}`,projectId,unitId,tracked,expiry,active:true}));
   if(tracked)s.batches.push(row(batchId,{name:`تشغيلة تجريبية ${number}-A`,productId,expiryDate:expiry?'2027-12-31':'',active:true}));
   // Stock is a separate explicit opening movement. Creating a product is never a stock event.
   s.movements.push(row(`DEMO-OPEN-${projectCode}-${number}`,{type:'opening',productId,warehouseId,batchId,delta:200,postedAt:timestamp(1,6),reason:'رصيد افتتاحي وهمي للمعاينة المعزولة فقط',reference:REPORTS_SAMPLE_MANIFEST.id}));
   const multi=i%10===0,sites=multi?[primarySite,s.customer_sites.find(site=>site.id===`DEMO-SITE-${projectCode}-${serial(customerIndex)}-2`)!]:[primarySite];
   s.requests.push(row(requestId,{requestType:'delivery',projectId,customerId,warehouseId,status,priority:i%9===0?'high':'normal',destination:sites.map(site=>site.address).join(' / '),governorate:multi?null:primarySite.governorate,createdAt,dueDate:`2026-10-${String(Math.min(21,day+1)).padStart(2,'0')}`,notes:'طلب وهمي للمعاينة والتحليل فقط'}));
   s.lines.push(row(lineId,{requestId,productId,unitId,quantity,...metadata}));
   const activeStage=['closed','delivered','delivering','in_transit','failed'].includes(status);
   for(const [destinationIndex,site] of sites.entries()){
    const suffix=`${projectCode}-${number}-${destinationIndex+1}`,needId=`DEMO-NEED-${suffix}`,taskId=`DEMO-TASK-${suffix}`,reservationId=`DEMO-RES-${suffix}`,executorId=`DEMO-COURIER-${projectCode}-${serial((i+destinationIndex)%8)}`;
    const planned=quantity/sites.length,actual=status==='delivering'?planned/2:['closed','delivered'].includes(status)?planned:0;
    const destinationMetadata={...metadata,governorate:site.governorate,siteId:site.id,customerId,projectId,addressSnapshot:site.address};
    s.delivery_needs.push(row(needId,{requestId,lineId,productId,unitId,quantity:planned,...destinationMetadata,active:true,status:['draft','review'].includes(status)?'draft':'approved'}));
    // Unapproved examples intentionally have needs but no warehouse/courier assignment or stock issue.
    if(!activeStage)continue;
    s.reservations.push(row(reservationId,{requestId,lineId,needId,productId,unitId,warehouseId,batchId,quantity:planned,status:'issued',executorId,...destinationMetadata}));
    s.tasks.push(row(taskId,{requestId,lineId,needId,reservationId,productId,unitId,quantity:planned,taskType:'delivery',destinationKind:'customer',destination:site.address,executorId,status:actual===planned?'completed':actual>0?'in_progress':status==='failed'?'failed':'in_transit',...destinationMetadata}));
    s.assignments.push(row(`DEMO-ASSIGN-${suffix}`,{requestId,taskId,reservationId,productId,warehouseId,executorId,carrierId,quantity:planned}));
    s.movements.push(row(`DEMO-ISSUE-${suffix}`,{type:'issue',requestId,lineId,taskId,reservationId,productId,warehouseId,batchId,delta:-planned,postedAt:timestamp(day,10),reason:'صرف وهمي مرتبط بطلب المعاينة'}));
    if(status==='failed')s.exceptions.push(row(`DEMO-FAILED-${suffix}`,{requestId,taskId,customerId,executorId,failed:true,outcome:'refused',reason:'سبب رفض تجريبي — عدم جاهزية المستلم',createdAt:timestamp(day,12),arrivedAt:timestamp(day,11),plannedQuantity:planned,loadedQuantity:planned,remainingQuantity:planned,destination:site.address}));
    if(!actual)continue;
    // Some tracked examples use two actual batches for one destination.
    const splitBatch=tracked&&i%20===0,parts=splitBatch?[actual/2,actual/2]:[actual];
    if(splitBatch&&!s.batches.some(batch=>batch.id===`DEMO-BATCH-${projectCode}-${number}-B`))s.batches.push(row(`DEMO-BATCH-${projectCode}-${number}-B`,{name:`تشغيلة تجريبية ${number}-B`,productId,expiryDate:expiry?'2028-03-31':'',active:true}));
    for(const [partIndex,part] of parts.entries()){
     const deliveryId=`DEMO-DELIVERY-${suffix}-${partIndex+1}`,deliveryBatchId=partIndex?`DEMO-BATCH-${projectCode}-${number}-B`:batchId;
     // Second-batch stock and issue are explicit, with the reservation split for quantity/custody integrity.
     const actualReservationId=partIndex?`DEMO-RES-${suffix}-B`:reservationId;
     if(splitBatch&&partIndex===0){s.reservations.find(res=>res.id===reservationId)!.quantity=planned/2;s.movements.find(m=>m.id===`DEMO-ISSUE-${suffix}`)!.delta=-planned/2;}
     if(partIndex){s.reservations.push(row(actualReservationId,{requestId,lineId,needId,productId,unitId,warehouseId,batchId:deliveryBatchId,quantity:planned/2,status:'issued',executorId,...destinationMetadata}));s.movements.push(row(`DEMO-OPEN-${suffix}-B`,{type:'opening',productId,warehouseId,batchId:deliveryBatchId,delta:100,postedAt:timestamp(1,6),reason:'رصيد تشغيلة وهمية للمعاينة',reference:REPORTS_SAMPLE_MANIFEST.id}),row(`DEMO-ISSUE-${suffix}-B`,{type:'issue',requestId,lineId,taskId,reservationId:actualReservationId,productId,warehouseId,batchId:deliveryBatchId,delta:-planned/2,postedAt:timestamp(day,10),reason:'صرف تشغيلة وهمية مرتبط بطلب المعاينة'}));}
     s.deliveries.push(row(deliveryId,{requestId,lineId,needId,taskId,reservationId:actualReservationId,productId,unitId,batchId:deliveryBatchId,quantity:part,plannedQuantity:planned,destinationKind:'customer',executorId,recipient:'مستلم تجريبي '+serial(customerIndex),createdAt:timestamp(day+1,11),...destinationMetadata}));
     if(i%8===0&&partIndex===0){
      const returned=2,returnTaskId=`DEMO-RETURN-TASK-${suffix}`,returnPlanId=`DEMO-RETURN-PLAN-${suffix}`,returnId=`DEMO-RETURN-${suffix}`;
      s.tasks.push(row(returnTaskId,{requestId,lineId,productId,unitId,taskType:'return',destinationKind:'warehouse',destination:'مخزن المرتجع التجريبي',quantity:returned,presentedQuantity:returned,executorId,warehouseId,status:'completed',reason:'مرتجع تجريبي — عبوة تالفة'}));
      s.handoffs.push(row(returnPlanId,{type:'return_plan',requestId,lineId,productId,unitId,taskId:returnTaskId,sourceTaskId:taskId,source:'delivered',originalDeliveryId:deliveryId,reservationId:actualReservationId,warehouseId,batchId:deliveryBatchId,quantity:returned,executorId,createdAt:timestamp(day+1,14)}));
      s.returns.push(row(returnId,{requestId,lineId,productId,unitId,taskId:returnTaskId,sourceTaskId:taskId,source:'delivered',returnPlanId,originalDeliveryId:deliveryId,reservationId:actualReservationId,warehouseId,batchId:deliveryBatchId,quantity:returned,recipient:'أمين مخزن تجريبي',receivedAt:timestamp(day+2,10),createdAt:timestamp(day+2,10)}));
      s.movements.push(row(`DEMO-RETURN-MOVEMENT-${suffix}`,{type:'return',requestId,lineId,taskId:returnTaskId,productId,warehouseId,batchId:deliveryBatchId,delta:returned,postedAt:timestamp(day+2,10),reason:'قبول مرتجع وهمي مرتبط بالتسليم الأصلي'}));
     }
    }
   }
  }
 }
 return s;
}

/** Raw control totals are deliberately independent of report projections. Monetary units are minor EGP. */
export function describeReportsSampleState(s:State){
 const countByKind=Object.fromEntries(kinds.map(kind=>[kind,s[kind].length]));
 const projects=s.projects.map(project=>{
  const requests=s.requests.filter(request=>request.projectId===project.id),requestIds=new Set(requests.map(r=>r.id)),deliveries=s.deliveries.filter(d=>requestIds.has(d.requestId)),returns=s.returns.filter(r=>requestIds.has(r.requestId));
  const quantities=new Map<string,{unitId:string;delivered:number;accepted:number;net:number}>();
  for(const d of deliveries){if(!quantities.has(d.unitId))quantities.set(d.unitId,{unitId:d.unitId,delivered:0,accepted:0,net:0});quantities.get(d.unitId)!.delivered+=d.quantity;}
  for(const r of returns){if(!quantities.has(r.unitId))quantities.set(r.unitId,{unitId:r.unitId,delivered:0,accepted:0,net:0});quantities.get(r.unitId)!.accepted+=r.quantity;}
  for(const quantity of quantities.values())quantity.net=quantity.delivered-quantity.accepted;
  const grossMinor=deliveries.reduce((n,d)=>n+(d.priceMinor===null?0:d.quantity*d.priceMinor),0),acceptedMinor=returns.reduce((n,r)=>{const d=deliveries.find(d=>d.id===r.originalDeliveryId);return n+(d?.priceMinor===null||!d?0:r.quantity*d.priceMinor);},0);
  return {projectId:project.id,name:project.name,customers:s.customers.filter(c=>c.projectId===project.id).length,products:s.products.filter(p=>p.projectId===project.id).length,requests:requests.length,sites:s.customer_sites.filter(site=>site.projectId===project.id).length,governorates:[...new Set(s.customer_sites.filter(site=>site.projectId===project.id).map(site=>site.governorate))],statuses:Object.fromEntries(REPORTS_SAMPLE_MANIFEST.statuses.map(status=>[status,requests.filter(r=>r.status===status).length])),deliveries:deliveries.length,acceptedReturns:returns.length,grossMinor,acceptedMinor,netMinor:grossMinor-acceptedMinor,missingPriceFacts:deliveries.filter(d=>d.priceMinor===null).length+returns.filter(r=>deliveries.find(d=>d.id===r.originalDeliveryId)?.priceMinor===null).length,quantities:[...quantities.values()]};
 });
 return {...REPORTS_SAMPLE_MANIFEST,countByKind,projects};
}
