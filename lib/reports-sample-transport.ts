import {execute} from './engine';
import {type Actor,type State,demand} from './model';
import {exportColumns,exportedRows,csvBytes,xlsxBytes} from './tabular-export';

/** Browser-only fixture adapter. It never delegates a request to a network transport. */
export function reportsSampleTransport(initial:State,origin:string){
 const actor:Actor={userId:'DEMO-reports-local-reviewer',name:'مستخدم التجربة المعزولة',role:'owner',function:'all',active:1,projectIds:null,warehouseIds:null,resourceIds:null};
 let state=structuredClone(initial),version=1;
 const datasetId='DEMO-reports-local-800-customers-2000-products-v1';
 const drafts=new Map<string,{revision:number;value:unknown}>();
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 const snapshot=()=>({dataset:{id:datasetId,name:'بيانات وهمية معزولة — لا بيانات تشغيل',version},state,actor,members:[actor],audit:[],backups:[],invitations:[],courierDirectory:state.resources,deleteConfigured:false,syncSeconds:20,serverTime:'2026-10-21T12:00:00Z'});
 const denied=()=>json({error:'هذه تجربة بيانات وهمية معزولة؛ لا اتصال بالنظام الفعلي. المتاح: التقارير والتصدير وتعديل الفروع داخل هذه الصفحة فقط.',code:'DEMO_ISOLATED'},403);
 const fetch:typeof globalThis.fetch=async(input,init={})=>{
  try{
   const request=input instanceof Request?input:null,url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,origin),method=(init.method||request?.method||'GET').toUpperCase();
   if(url.origin!==new URL(origin).origin)return denied();
   const body=async()=>JSON.parse(typeof init.body==='string'?init.body:request?await request.text():'{}');
   if(url.pathname==='/api/access-auth/status'&&method==='GET')return json({enabled:false});
   if(['/api/state','/api/command-center/state','/api/access/export-state'].includes(url.pathname)&&method==='GET')return json(snapshot());
   if(url.pathname==='/api/search'&&method==='GET')return json({results:[]});
   if(url.pathname==='/api/command-center/draft'){
    const key=url.searchParams.get('key')||'',prior=drafts.get(key)||{revision:0,value:null};
    if(method==='GET')return json(prior);
    if(method==='PUT'){const b=await body();demand(b.datasetId===datasetId&&b.expectedUserId===actor.userId,'مسودة خارج نطاق التجربة','FORBIDDEN',403);demand(b.revision===prior.revision,'تغيرت المسودة داخل التجربة','CONFLICT',409);const next={revision:prior.revision+1,value:b.value};drafts.set(key,next);return json(next);}
    if(method==='DELETE'){drafts.delete(key);return json({ok:true});}
   }
   if(['/api/command-center/action','/api/action'].includes(url.pathname)&&method==='POST'){
    const b=await body();
    // No seed/import/delete/auth/permission/stock/action operation is implemented here.
    if(b.command?.type!=='save_customer_site')return denied();
    demand(b.version===version,'تغيرت بيانات التجربة؛ حدّث الشاشة','CONFLICT',409);
    const result=execute(state,actor,b.command,'2026-10-21T12:00:00Z');state=result.state;version++;return json(result.result);
   }
   if(url.pathname==='/api/export'&&method==='POST'){
    const b=await body(),allowed=exportColumns[b.kind];demand(allowed,'جدول غير متاح للتصدير');
    demand(Array.isArray(b.columns)&&b.columns.length>0&&new Set(b.columns).size===b.columns.length&&b.columns.every((key:string)=>allowed.some(c=>c.key===key)),'أعمدة تصدير غير صحيحة');
    demand(['filtered','selected','all'].includes(b.scope),'نطاق تصدير غير صحيح');
    let rows=exportedRows(state,b.kind,b.scope==='all'?{}:b.filters||{});
    if(b.scope==='selected'){demand(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.every((id:string)=>rows.some(row=>row.id===id)),'سجل خارج نطاق التصدير');rows=rows.filter(row=>b.ids.includes(row.id));}
    if(b.preview)return json({count:rows.length,version,columns:b.columns,scope:b.scope});
    demand(b.version===version,'تغيرت بيانات التجربة؛ راجع العدد من جديد','CONFLICT',409);demand(['csv','xlsx'].includes(b.format),'صيغة تصدير غير صحيحة');
    const headers=b.columns.map((key:string)=>{const col=allowed.find(c=>c.key===key)!;return b.language==='en'?col.en:col.ar+' / '+col.en;}),values=rows.map(row=>b.columns.map((key:string)=>row[key]??null)),bytes=b.format==='xlsx'?xlsxBytes(headers,values):csvBytes(headers,values);
    return new Response(Uint8Array.from(bytes),{headers:{'Content-Type':b.format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8','X-DAF-Row-Count':String(rows.length)}});
   }
   return denied();
  }catch(error:any){return json({error:error?.message||'تعذرت العملية داخل التجربة',code:error?.code||'DEMO_INVALID'},Number.isInteger(error?.status)?error.status:400);}
 };
 return {fetch,snapshot,getState:()=>structuredClone(state),actor,datasetId};
}

/** Isolate even interface preferences from the operational site's browser storage. */
export function reportsSampleMemoryStorage():Storage{
 const values=new Map<string,string>();
 return {get length(){return values.size;},clear(){values.clear();},getItem(key){return values.get(String(key))??null;},key(index){return [...values.keys()][index]??null;},removeItem(key){values.delete(String(key));},setItem(key,value){values.set(String(key),String(value));}};
}
