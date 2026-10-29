import {execute} from '@/lib/engine';
import {scopedState} from '@/lib/access';
import {type Actor,type Command,type State,demand} from '@/lib/model';
import {csvBytes,exportColumns,exportedRows,xlsxBytes} from '@/lib/tabular-export';
import {REVIEW_NOW} from './quantity-review-fixture';

/** No network delegate exists: all requests terminate in this in-memory adapter. */
export function quantityReviewTransport(initial:State,actors:Record<string,Actor>,origin:string){
 let state=structuredClone(initial),actor=actors.courier,version=1;
 const datasetId='QUANTITY-REVIEW-20261022-MEMORY';
 const drafts=new Map<string,{revision:number;value:unknown}>(),operations=new Map<string,{hash:string;result:unknown}>(),audit:any[]=[],files=new Map<string,{blob:Blob;url:string}>();
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 const snapshot=()=>({dataset:{id:datasetId,name:'تجربة كميات معزولة — ذاكرة فقط',version},state:scopedState(state,actor),actor,members:Object.values(actors),audit,backups:[],invitations:[],courierDirectory:state.resources,deleteConfigured:false,syncSeconds:20,serverTime:REVIEW_NOW});
 const denied=()=>json({error:'غير متاح داخل المعاينة المعزولة. لا اتصال ببيانات التشغيل أو خدمة خارجية.',code:'REVIEW_ISOLATED'},403);
 const fetch:typeof globalThis.fetch=async(input,init={})=>{
  try{
   const request=input instanceof Request?input:null,url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,origin),method=(init.method||request?.method||'GET').toUpperCase();
   if(url.origin!==new URL(origin).origin)return denied();
   const body=async()=>JSON.parse(typeof init.body==='string'?init.body:request?await request.text():'{}');
   if(url.pathname==='/api/access-auth/status'&&method==='GET')return json({enabled:false});
   if(['/api/state','/api/command-center/state','/api/access/export-state'].includes(url.pathname)&&method==='GET')return json(snapshot());
   if(url.pathname==='/api/search'&&method==='GET')return json({results:[]});
   if(url.pathname==='/api/command-center/draft'){
    const key=actor.userId+':'+(url.searchParams.get('key')||''),prior=drafts.get(key)||{revision:0,value:null};
    if(method==='GET')return json(prior);
    if(method==='PUT'){const b=await body();demand(b.datasetId===datasetId&&b.expectedUserId===actor.userId,'مسودة خارج الحساب التجريبي','FORBIDDEN',403);demand(b.revision===prior.revision,'تغيرت المسودة؛ أعد المحاولة','CONFLICT',409);const next={revision:prior.revision+1,value:b.value};drafts.set(key,next);return json(next);}
    if(method==='DELETE'){drafts.delete(key);return json({ok:true});}
   }
   if(['/api/command-center/action','/api/action'].includes(url.pathname)&&method==='POST'){
    const b=await body(),command=b.command as Command;
    demand(command&&typeof command.type==='string','الإجراء مطلوب');
    if(['seed','reset','restore','member','invite','revoke_invite','revoke_invites','backup','delete','undo_import','import'].includes(command.type))return denied();
    const key=actor.userId+':'+String(b.operationId||''),hash=JSON.stringify(command),prior=operations.get(key);
    if(prior){demand(prior.hash===hash,'معرّف العملية مستخدم لإجراء آخر','CONFLICT',409);return json(prior.result);}
    demand(Number.isInteger(b.version)&&b.version===version,'تغيرت بيانات التجربة؛ حدّث وأعد المحاولة','CONFLICT',409);
    const out=execute(state,actor,command,new Date().toISOString());state=out.state;version++;
    const result={...out.result,version};operations.set(key,{hash,result});audit.unshift({id:crypto.randomUUID(),user_id:actor.userId,actor:actor.name,action:command.type,record_id:command.requestId||out.result.id,reason:command.reason||'',channel:'isolated-review',at:new Date().toISOString()});
    return json(result);
   }
   if(url.pathname==='/api/upload'&&method==='POST'){
    const form=init.body instanceof FormData?init.body:request?await request.formData():null;demand(form,'ملف مطلوب');const file=form.get('file'),requestId=String(form.get('requestId')||''),taskId=String(form.get('taskId')||'');
    demand(file instanceof File&&file.size>0&&file.size<=10*1024*1024,'اختر ملفًا لا يزيد عن 10 ميجابايت');demand(scopedState(state,actor).requests.some(r=>r.id===requestId),'الطلب خارج الحساب التجريبي','FORBIDDEN',403);demand(Number(form.get('version'))===version,'تغيرت بيانات التجربة؛ أعد رفع الملف','CONFLICT',409);
    const id=crypto.randomUUID(),url=URL.createObjectURL(file);files.set(id,{blob:file,url});
    state.documents.push({id,code:'REVIEW-DOC-'+id.slice(0,8),name:file.name,requestId,taskId,purpose:String(form.get('purpose')||'other'),mime:file.type,size:file.size,createdBy:actor.userId,createdAt:new Date().toISOString(),synthetic:true,previewUrl:url});version++;return json({id,version});
   }
   if(url.pathname==='/api/export'&&method==='POST'){
    const b=await body(),allowed=exportColumns[b.kind];demand(allowed,'جدول غير متاح للتصدير');demand(Array.isArray(b.columns)&&b.columns.length>0&&b.columns.every((key:string)=>allowed.some(c=>c.key===key)),'أعمدة غير صحيحة');
    let rows=exportedRows(scopedState(state,actor),b.kind,b.scope==='all'?{}:b.filters||{});if(b.scope==='selected')rows=rows.filter(row=>b.ids?.includes(row.id));
    if(b.preview)return json({count:rows.length,version,columns:b.columns,scope:b.scope});demand(b.version===version,'تغيرت بيانات التجربة؛ راجع التصدير','CONFLICT',409);
    const headers=b.columns.map((key:string)=>{const col=allowed.find(c=>c.key===key)!;return b.language==='en'?col.en:col.ar+' / '+col.en;}),values=rows.map(row=>b.columns.map((key:string)=>row[key]??null)),bytes=b.format==='xlsx'?xlsxBytes(headers,values):csvBytes(headers,values);
    return new Response(Uint8Array.from(bytes),{headers:{'Content-Type':b.format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8','X-DAF-Row-Count':String(rows.length)}});
   }
   return denied();
  }catch(error:any){return json({error:error?.message||'تعذرت العملية داخل المعاينة',code:error?.code||'REVIEW_INVALID'},Number.isInteger(error?.status)?error.status:400);}
 };
 return {fetch,snapshot,getState:()=>structuredClone(state),getActor:()=>actor,setActor:(key:string)=>{demand(actors[key],'دور تجربة غير معروف');actor=actors[key];},datasetId,getFileUrl:(id:string)=>files.get(id)?.url};
}
