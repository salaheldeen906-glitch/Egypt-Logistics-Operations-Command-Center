import {type State,type Row,balance} from './model';
import {eligibleLimit} from './batch-selection';

const round=(n:number)=>Math.round(n*1000)/1000;
export type StockAvailabilityInput={projectId:string;productId:string;quantity:number;warehouseId?:string;requestId?:string;lineId?:string;taskId?:string;reservationId?:string;includeLineHeld?:boolean;requestType?:string;plannedElsewhere?:number;now?:string};
export type StockBatchAvailability={batchId:string;batchCode:string;expiryDate:string;physical:number;reserved:number;available:number;eligible:number;reason:string};
export type WarehouseAvailability={warehouseId:string;warehouseCode:string;warehouseName:string;physical:number;reserved:number;available:number;eligible:number;batches:StockBatchAvailability[]};
export type StockAvailability={known:boolean;productId:string;productName:string;unit:string;quantity:number;physical:number;reserved:number;available:number;eligible:number;coveredHeld:number;plannedElsewhere:number;shortfall:number;covered:number;selectedWarehouseId:string;warehouses:WarehouseAvailability[];alternatives:WarehouseAvailability[];totalEligible:number;totalShortfall:number};

/** Read-only, advisory projection of the already permission-scoped snapshot.
 * A draft is demand, not a reservation. The server rechecks eligibility and balances
 * in its existing optimistic transaction when the user actually reserves stock.
 */
export function stockAvailability(s:State,input:StockAvailabilityInput):StockAvailability{
 const quantity=Number.isFinite(Number(input.quantity))?Math.max(0,round(Number(input.quantity))):0;
 const product=s.products.find(p=>p.id===input.productId&&p.projectId===input.projectId);
 const plannedElsewhere=Number.isFinite(Number(input.plannedElsewhere))?Math.max(0,round(Number(input.plannedElsewhere))):0;
 const result:StockAvailability={known:!!product,productId:input.productId,productName:product?.name||'',unit:product?s.units.find(u=>u.id===product.unitId)?.name||'—':'—',quantity,physical:0,reserved:0,available:0,eligible:0,coveredHeld:0,plannedElsewhere,shortfall:quantity,covered:0,selectedWarehouseId:input.warehouseId||'',warehouses:[],alternatives:[],totalEligible:0,totalShortfall:quantity};
 if(!product)return result;
 const existingRequest=input.requestId?s.requests.find(r=>r.id===input.requestId&&r.projectId===input.projectId):undefined;
 // Never borrow another request's near-expiry approval for a new draft.
 const request:Row=existingRequest||{id:'__availability_draft__',code:'DRAFT',projectId:input.projectId,requestType:input.requestType||'delivery'};
 const line:Row=existingRequest?s.lines.find(l=>l.id===input.lineId&&l.requestId===existingRequest.id&&l.productId===product.id)||s.lines.find(l=>l.requestId===existingRequest.id&&l.productId===product.id)||{id:'__availability_line__',code:'LINE',requestId:request.id,productId:product.id,quantity}: {id:'__availability_line__',code:'LINE',requestId:request.id,productId:product.id,quantity};
 const now=input.now||new Date().toISOString();
 // Credit an existing hold only to its exact persisted row. Aggregate request
 // cards may explicitly request line-level credit once per product. A new draft
 // allocation row never borrows the holds assigned to another task.
 const ownHolds=existingRequest&&input.lineId&&(input.taskId||input.reservationId||input.includeLineHeld)?s.reservations.filter(x=>x.requestId===existingRequest.id&&x.lineId===line.id&&x.productId===product.id&&x.status==='held'&&(!input.taskId||x.taskId===input.taskId)&&(!input.reservationId||x.id===input.reservationId)&&(!input.warehouseId||x.warehouseId===input.warehouseId)):[];
 const ownIds=new Set(ownHolds.map(x=>x.id)),heldState=ownIds.size?{...s,reservations:s.reservations.filter(x=>!ownIds.has(x.id))}:s,heldApprovalUsed=new Map<string,number>();
 // Resolve eligibility once in FEFO order across warehouses so a shared batch's
 // near-expiry approval quantity cannot be counted in every warehouse.
 const approvalUsed=new Map<string,number>();
 const candidates=s.warehouses.flatMap(w=>{
  const ids=[...new Set(s.movements.filter(m=>m.productId===product.id&&m.warehouseId===w.id).map(m=>m.batchId||''))];
  return ids.map(batchId=>({w,batchId,batch:s.batches.find(b=>b.id===batchId)}));
 }).sort((a,b)=>(a.batch?.expiryDate||'9999-12-31').localeCompare(b.batch?.expiryDate||'9999-12-31')||(a.w.id===input.warehouseId?-1:b.w.id===input.warehouseId?1:a.w.id.localeCompare(b.w.id)));
 const warehouseRows=new Map<string,WarehouseAvailability>();
 for(const {w,batchId,batch} of candidates){
  const stock=balance(s,product.id,w.id,batchId),available=Math.max(0,stock.available);
  const nearExpiry=product.expiry&&batch&&Number.isFinite(Date.parse(batch.expiryDate))&&(Date.parse(batch.expiryDate)-Date.parse(now.slice(0,10)))/86400000<=90;
  const already=nearExpiry?approvalUsed.get(batchId)||0:0,eligible=eligibleLimit(s,request,line,batch,available+already,now),limit=Math.max(0,round(eligible.limit-already));
  if(nearExpiry)approvalUsed.set(batchId,round(already+limit));
  const ownHeld=round(ownHolds.filter(x=>x.warehouseId===w.id&&(x.batchId||'')===batchId).reduce((n,x)=>n+x.quantity,0));
  if(ownHeld>0){const heldAvailable=Math.max(0,Math.min(ownHeld,stock.onHand-(stock.reserved-ownHeld))),alreadyHeld=nearExpiry?heldApprovalUsed.get(batchId)||0:0,heldEligibility=eligibleLimit(heldState,request,line,batch,heldAvailable+alreadyHeld,now),coveredHeld=Math.max(0,round(heldEligibility.limit-alreadyHeld));result.coveredHeld=round(result.coveredHeld+coveredHeld);if(nearExpiry)heldApprovalUsed.set(batchId,round(alreadyHeld+coveredHeld));}
  let row=warehouseRows.get(w.id);if(!row){row={warehouseId:w.id,warehouseCode:w.code,warehouseName:w.name||w.code,physical:0,reserved:0,available:0,eligible:0,batches:[]};warehouseRows.set(w.id,row);}
  row.batches.push({batchId,batchCode:batch?.code||'',expiryDate:batch?.expiryDate||'',physical:round(stock.onHand),reserved:round(stock.reserved),available:round(available),eligible:limit,reason:eligible.reason});
  row.physical=round(row.physical+stock.onHand);row.reserved=round(row.reserved+stock.reserved);row.available=round(row.available+available);row.eligible=round(row.eligible+limit);
 }
 result.warehouses=[...warehouseRows.values()];
 const selected=input.warehouseId?result.warehouses.filter(w=>w.warehouseId===input.warehouseId):result.warehouses;
 for(const w of selected){result.physical=round(result.physical+w.physical);result.reserved=round(result.reserved+w.reserved);result.available=round(result.available+w.available);result.eligible=round(result.eligible+w.eligible);}
 result.totalEligible=round(result.warehouses.reduce((n,w)=>n+w.eligible,0));const remainingEligible=round(result.coveredHeld+Math.max(0,round(result.eligible-plannedElsewhere)));result.covered=Math.min(quantity,remainingEligible);result.shortfall=Math.max(0,round(quantity-remainingEligible));result.totalShortfall=Math.max(0,round(quantity+plannedElsewhere-result.totalEligible-result.coveredHeld));
 result.alternatives=result.warehouses.filter(w=>w.warehouseId!==input.warehouseId&&w.eligible>0).sort((a,b)=>b.eligible-a.eligible||a.warehouseCode.localeCompare(b.warehouseCode));
 return result;
}
