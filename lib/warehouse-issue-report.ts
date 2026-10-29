import {type Row,type State} from './model';
import {cairoDay,matchesQueue,type Filters} from './insights';

export type WarehouseIssueFilters=Partial<Filters>&{user?:string;product?:string;batch?:string;requestIds?:string[]};
export type ActorNames=Record<string,string>;
const distinct=(rows:Row[])=>[...new Map(rows.map(row=>[row.id,row])).values()];
const round=(n:number)=>Math.round(n*1000)/1000;
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const sum=(rows:Row[],key:string)=>round(rows.reduce((n,row)=>n+(finite(row[key])??0),0));
const date=(value:unknown)=>value&&Number.isFinite(Date.parse(String(value)))?cairoDay(String(value)):'';
const missing=(ar:boolean)=>ar?'غير متاح':'Unavailable';

/** One output row per actual issue movement. Approvals and case events are dimensions, never facts to sum. */
export function warehouseIssueReport(s:State,filters:WarehouseIssueFilters={},actorNames:ActorNames={},ar=true){
 const name=(kind:keyof State,id:unknown)=>s[kind].find(row=>row.id===id)?.name||'';
 const code=(kind:keyof State,id:unknown)=>s[kind].find(row=>row.id===id)?.code||'';
 const person=(id:unknown,snapshot:unknown)=>typeof snapshot==='string'&&snapshot.trim()?snapshot:typeof id==='string'&&actorNames[id]?actorNames[id]:missing(ar);
 const quantityApprovals=distinct(s.approvals.filter(row=>row.type==='quantity_increase'));
 const cases=distinct(s.exceptions.filter(row=>row.type==='loading_difference'));
 const inScope=(row:Row,request:Row|undefined,product:Row|undefined,at:unknown)=>{
  const day=date(at),projectId=row.projectId||request?.projectId||product?.projectId;
  return (!filters.project||filters.project==='all'||projectId===filters.project)
   &&(!filters.warehouse||filters.warehouse==='all'||row.warehouseId===filters.warehouse)
   &&(!filters.product||filters.product==='all'||row.productId===filters.product)
   &&(!filters.batch||filters.batch==='all'||row.batchId===filters.batch)
   &&(!filters.requestIds||!!request&&filters.requestIds.includes(request.id))
   &&(!filters.queue||filters.queue==='all'||!!request&&matchesQueue(s,request,filters.queue))
   &&(!filters.from||!!day&&day>=filters.from)&&(!filters.to||!!day&&day<=filters.to);
 };
 const rows=distinct(s.movements).filter(movement=>movement.type==='issue'&&typeof movement.delta==='number'&&movement.delta<0).flatMap(movement=>{
  const request=s.requests.find(row=>row.id===movement.requestId),reservation=s.reservations.find(row=>row.id===movement.reservationId);
  const line=s.lines.find(row=>row.id===(movement.lineId||reservation?.lineId)),task=s.tasks.find(row=>row.id===(movement.taskId||reservation?.taskId));
  const product=s.products.find(row=>row.id===movement.productId),batch=s.batches.find(row=>row.id===movement.batchId);
  const at=movement.postedAt||movement.createdAt;
  if(!inScope(movement,request,product,at))return [];
  // Older rows have no loadingId. A signature is used only when its issued reservation/movement proves the link.
  const loading=s.handoffs.find(row=>row.type==='loading_confirmation'&&(!!movement.loadingId&&row.id===movement.loadingId||row.movementId===movement.id||!!movement.reservationId&&row.issuedReservationId===movement.reservationId));
  const relatedApprovals=quantityApprovals.filter(row=>row.requestId===request?.id&&row.lineId===line?.id);
  const approved=relatedApprovals.filter(row=>row.status==='approved').sort((a,b)=>String(a.reviewedAt||a.approvedAt||a.createdAt).localeCompare(String(b.reviewedAt||b.approvedAt||b.createdAt)));
  const orderedApprovals=[...relatedApprovals].sort((a,b)=>String(a.requestedAt||a.createdAt).localeCompare(String(b.requestedAt||b.createdAt)));
  const linkedCases=cases.filter(row=>!!loading&&row.loadingId===loading.id||row.movementId===movement.id||!!row.resolutionId&&row.resolutionId===movement.resolutionId);
  const latestCase=[...linkedCases].sort((a,b)=>String(b.lastReviewedAt||b.resolvedAt||b.updatedAt||b.createdAt).localeCompare(String(a.lastReviewedAt||a.resolvedAt||a.updatedAt||a.createdAt)))[0];
  const keeperId=movement.warehouseUserId||loading?.warehouseUserId||movement.warehousePerformedBy||movement.actionPerformedBy||'';
  const courierId=movement.courierUserId||loading?.courierUserId||'';
  const posterId=movement.createdBy||movement.postedBy||'';
  const approvedIncrease=sum(approved,'increase'),originalQuantity=finite(line?.requestedQuantity)??finite(line?.originalQuantity)??finite(orderedApprovals[0]?.originalQuantity)??finite(line?.quantity);
  const row:Row={
   id:movement.id,code:movement.code,requestId:request?.id||movement.requestId||'',request:request?.code||'',taskId:task?.id||movement.taskId||'',task:task?.code||'',
   projectId:movement.projectId||request?.projectId||product?.projectId||'',project:name('projects',movement.projectId||request?.projectId||product?.projectId),
   warehouseId:movement.warehouseId,warehouse:name('warehouses',movement.warehouseId),productId:movement.productId,product:product?.code||'',productName:product?.name||'',
   batchId:movement.batchId||'',batch:batch?.code||'',expiryDate:batch?.expiryDate||'',unitId:product?.unitId||'',unit:name('units',product?.unitId),
   issuedQuantity:round(-movement.delta),postedAt:at||'',postedDay:date(at),requestedQuantity:originalQuantity,approvedQuantity:finite(line?.quantity),approvedIncrease,
   approvedQuantityAtIssue:finite(movement.approvedQuantityAtIssue),
   requestCreatorId:request?.createdBy||'',requestCreator:person(request?.createdBy,request?.createdByName),
   requestApproverId:request?.reviewedBy||request?.approvedBy||'',requestApprover:person(request?.reviewedBy||request?.approvedBy,request?.reviewedByName||request?.approvedByName),
   actionPerformedById:keeperId,actionPerformedBy:person(keeperId,movement.warehouseUserName||loading?.warehouseUserName||movement.warehousePerformedByName||movement.actionPerformedByName),
   actionIdentitySource:keeperId?(ar?'تأكيد صرف المخزن':'Warehouse release signature'):(ar?'لم تسجل هوية صرف مستقلة':'Independent warehouse identity not recorded'),
   movementPostedById:posterId,movementPostedBy:person(posterId,movement.createdByName||movement.postedByName),
   courierConfirmedById:courierId,courierConfirmedBy:person(courierId,movement.courierUserName||loading?.courierUserName),
   increaseApproverIds:[...new Set(approved.map(row=>row.approvedBy||row.reviewedBy).filter(Boolean))].join(' / '),
   increaseApprovers:[...new Set(approved.map(row=>person(row.approvedBy||row.reviewedBy,row.approvedByName||row.reviewedByName)))].join(' / '),
   warehouseDeclared:finite(loading?.warehouseQuantity),courierDeclared:finite(loading?.courierQuantity),declaredDifference:finite(loading?.difference),
   baselineQuantity:finite(latestCase?.baselineQuantity),observedQuantity:finite(latestCase?.observedQuantity),
   differenceCases:linkedCases.length,pendingDifferenceCases:linkedCases.filter(row=>row.status!=='resolved'||row.stockAdjustmentRequired).length,
   differenceStatus:latestCase?.status||loading?.status||'',differenceHandledById:latestCase?.resolvedBy||latestCase?.lastReviewedBy||latestCase?.reviewedBy||'',
   differenceHandledBy:person(latestCase?.resolvedBy||latestCase?.lastReviewedBy||latestCase?.reviewedBy,latestCase?.resolvedByName||latestCase?.lastReviewedByName||latestCase?.reviewedByName),
   settledQuantity:finite(latestCase?.acceptedQuantity)??finite(loading?.acceptedQuantity),underSettlementQuantity:finite(latestCase?.underSettlementQuantity),stockAdjustmentRequired:!!latestCase?.stockAdjustmentRequired,
   differenceCaseCodes:linkedCases.map(row=>row.code).join(' / '),quantityApprovalCodes:approved.map(row=>row.code).join(' / '),
   documentId:movement.documentId||loading?.warehouseDocumentId||'',loadingId:loading?.id||'',reason:movement.reason||'',
  };
  const involved=[row.requestCreatorId,row.requestApproverId,row.actionPerformedById,row.movementPostedById,row.courierConfirmedById,row.differenceHandledById,...approved.map(item=>item.approvedBy||item.reviewedBy)];
  if(filters.user&&filters.user!=='all'&&!involved.includes(filters.user))return [];
  if(filters.query&&!Object.values(row).some(value=>String(value??'').toLocaleLowerCase().includes(filters.query!.toLocaleLowerCase())))return [];
  return [row];
 });
 const pendingDifferences=cases.filter(item=>item.status!=='resolved'||item.stockAdjustmentRequired).flatMap(item=>{
  const request=s.requests.find(row=>row.id===item.requestId),product=s.products.find(row=>row.id===item.productId);
  if(!inScope(item,request,product,item.discoveredAt||item.createdAt))return [];
  const resolvedById=item.resolvedBy||item.lastReviewedBy||item.reviewedBy||'',discoveredById=item.discoveredBy||item.createdBy||'';
  const row:Row={...item,request:request?.code||'',project:name('projects',item.projectId||request?.projectId||product?.projectId),warehouse:name('warehouses',item.warehouseId),product:code('products',item.productId),productName:product?.name||'',batch:code('batches',item.batchId),task:code('tasks',item.taskId),unit:name('units',product?.unitId),discoveredByName:person(discoveredById,item.discoveredByName||item.createdByName),handledByName:person(resolvedById,item.resolvedByName||item.lastReviewedByName||item.reviewedByName),postedQuantity:rows.filter(row=>!!item.loadingId&&row.loadingId===item.loadingId||row.id===item.movementId||row.id===item.originalMovementId).reduce((total,row)=>round(total+row.issuedQuantity),0)};
  if(filters.user&&filters.user!=='all'&&![discoveredById,resolvedById].includes(filters.user))return [];
  if(filters.query&&!Object.values(row).some(value=>String(value??'').toLocaleLowerCase().includes(filters.query!.toLocaleLowerCase())))return [];
  return [row];
 });
 const totalsByUnit=[...new Set(rows.map(row=>row.unitId))].map(unitId=>({unitId,unit:name('units',unitId),quantity:round(rows.filter(row=>row.unitId===unitId).reduce((n,row)=>n+row.issuedQuantity,0))}));
 return {rows,pendingDifferences,totalsByUnit,movementCount:rows.length};
}
