import {type State} from './model';
import {execute} from './engine';
const owner={userId:'training',name:'مستخدم التدريب',role:'owner' as const,function:'all',active:1};
export function addOperationExamples(original:State){
 let s=original;const run=(c:any)=>{const out=execute(s,owner,c);s=out.state;return out.result;};
 if(!s.warehouses.some(w=>w.code==='WH-ALEX-DEMO'))run({type:'master',kind:'warehouses',data:{code:'WH-ALEX-DEMO',name:'مخزن الإسكندرية — تدريب'}});
 const p=s.products[0];
 for(const [requestType,code,notes] of [['distribution','DIST-DEMO-12','وزّع 12: أربعة لمخزن، وثلاثة لمخزن آخر، وخمسة لعميل.'],['warehouse_transfer','TRANSFER-DEMO-01','حوّل البضاعة إلى مخزن آخر.'],['receipt_order','COLLECT-DEMO-01','استلم من المورد ثم سلّم للمخزن.'],['customer_return','RETURN-DEMO-01','مرتجع تجريبي سليم ومغلق العبوة.'],['documents','DOC-DEMO-01','استلم توقيع العميل على أصل المستند.']]){
  if(s.requests.some(r=>r.code===code))continue;
  run({type:'create_request',requestType,code,projectId:p.projectId,sourceWarehouseId:s.warehouses[0].id,sourceAddress:'عنوان المصدر التجريبي',supplierName:'مورد تجريبي',purchaseReference:'PO-DEMO-001',customerId:s.customers[0].id,referenceCode:'DEL-DEMO-001',notes,destination:'مقر العميل التجريبي',documentAction:'sign',documentDescription:'أصل فاتورة للتوقيع',lines:[{productId:p.id,quantity:12}]});
 }
 return s;
}
