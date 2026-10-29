import {type Row,type State,demand} from './model';

const stockKey=(r:Row)=>JSON.stringify([r.productId||'',r.warehouseId||'',r.batchId||'']);
const signature=(r:Row,kind:'movements'|'reservations')=>JSON.stringify([stockKey(r),kind==='movements'?r.delta:r.status==='held'?r.quantity:0]);

/** Last transaction boundary for every stock path, including batched commands.
 * Existing history is never clamped, repaired or balanced here. Unrelated legacy
 * buckets are left readable; a stock-changing command must leave each affected
 * product/warehouse/batch with physical stock covering all remaining holds.
 */
export function assertStockTransition(before:State,after:State){
 const changed=new Set<string>();
 for(const kind of ['movements','reservations'] as const){
  const previous=new Map(before[kind].map(r=>[r.id,r]));
  for(const r of after[kind]){const old=previous.get(r.id);if(!old||signature(old,kind)!==signature(r,kind)){if(old)changed.add(stockKey(old));changed.add(stockKey(r));}previous.delete(r.id);}
  for(const old of previous.values())changed.add(stockKey(old));
 }
 if(!changed.size)return;
 const totals=new Map([...changed].map(key=>[key,{physical:0,held:0}]));
 const amount=(value:unknown)=>{demand(typeof value==='number'&&Number.isFinite(value),'كمية مخزنية غير صالحة؛ راجع الحركة الأصلية','STOCK',409);const raw=value*1000,scaled=Math.round(raw);demand(Number.isSafeInteger(scaled)&&Math.abs(raw-scaled)<=Number.EPSILON*Math.max(1,Math.abs(raw))*4,'كمية مخزنية خارج الحد أو الدقة المسموحين','STOCK',409);return scaled;};
 for(const m of after.movements){const t=totals.get(stockKey(m));if(t)t.physical+=amount(m.delta);}
 for(const r of after.reservations){const t=totals.get(stockKey(r));if(t&&r.status==='held'){const q=amount(r.quantity);demand(q>=0,'الحجز المخزني لا يقبل كمية سالبة','STOCK',409);t.held+=q;}}
 for(const [key,t] of totals){
  const [productId,warehouseId,batchId]=JSON.parse(key) as string[];
  const label=[after.products.find(p=>p.id===productId)?.code,after.warehouses.find(w=>w.id===warehouseId)?.name,after.batches.find(b=>b.id===batchId)?.code].filter(Boolean).join(' · ');
  demand(Number.isSafeInteger(t.physical)&&Number.isSafeInteger(t.held)&&t.physical>=0&&t.physical-t.held>=0,`لا يمكن تنفيذ الحركة: رصيد المخزن لا يسمح بكمية سالبة أو باستهلاك حجوزات أخرى${label?' — '+label:''}. راجع الرصيد أو اختر مخزنًا آخر.`, 'STOCK',409);
 }
}
