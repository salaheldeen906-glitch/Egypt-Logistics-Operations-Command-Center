import {assertReadPermission,permissionDecision} from '@/lib/access-policy';
import {actor,dataset,loadState,originCheck,readJson,json,failure} from '@/lib/server';
import {scopedState} from '@/lib/access';
import {demand} from '@/lib/model';
import {exportColumns,exportedRows,csvBytes,xlsxBytes} from '@/lib/tabular-export';
export async function POST(req:Request){try{
 originCheck(req);const a=await actor(),d=await dataset(),b=await readJson(req,100000),s=scopedState(await loadState(d.id),a),kind=b.kind||'requests';
 assertReadPermission(a,kind,'export');
 if(a.access?.enabled)demand(permissionDecision(a,'reports.export').allowed,'Export permission required / صلاحية التصدير مطلوبة','FORBIDDEN',403);
 const allowed=exportColumns[kind];demand(allowed,'Invalid export table');
 demand(Array.isArray(b.columns)&&b.columns.length>0&&new Set(b.columns).size===b.columns.length&&b.columns.every((key:string)=>allowed.some(c=>c.key===key)),'Invalid or restricted export columns / أعمدة تصدير غير مسموحة','FORBIDDEN',403);
 demand(['filtered','selected','all'].includes(b.scope),'Choose export scope / اختر نطاق التصدير');
 const rows=exportedRows(s,kind,b.scope==='all'?{}:b.filters||{});
 let chosen=rows;
 if(b.scope==='selected'){
  demand(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.length<=10000&&new Set(b.ids).size===b.ids.length,'Choose records to export');
  demand(b.ids.every((id:string)=>rows.some(r=>r.id===id)),'Selected record is outside your scope or filters / سجل محدد خارج نطاقك أو الفلاتر','FORBIDDEN',403);
  chosen=rows.filter(r=>b.ids.includes(r.id));
 }
 demand(chosen.length<=10000,'Narrow the filters to at most 10,000 rows / ضيّق الفلاتر إلى 10 آلاف صف');
 if(b.preview)return json({count:chosen.length,version:d.version,columns:b.columns,scope:b.scope});
 demand(Number.isInteger(b.version)&&b.version===d.version,'Data changed; review export count again / تغيّرت البيانات؛ راجع عدد التصدير مجددًا','CONFLICT',409);
 demand(['csv','xlsx'].includes(b.format),'Choose CSV or XLSX');
 const headers=b.columns.map((key:string)=>{const c=allowed.find(c=>c.key===key)!;return b.language==='en'?c.en:c.ar+' / '+c.en;}),values=chosen.map(r=>b.columns.map((key:string)=>{const value=r[key]??'';return ['dueDate','createdAt','postedAt','deliveredAt','returnedAt','acceptedAt','expiryDate','date','startedAt','endedAt','cancelledAt','arrivedAt','departedAt','at','plannedLoadAt','actualLoadAt','plannedDeliveryAt','actualDeliveryAt','issueDate','dueAt'].includes(key)&&value&&Number.isFinite(Date.parse(value))?new Date(value):value;})),bytes=b.format==='xlsx'?xlsxBytes(headers,values):csvBytes(headers,values);
 return new Response(bytes as unknown as BodyInit,{headers:{'Content-Type':b.format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="DAF_${kind.toUpperCase()}_${new Date().toISOString().slice(0,10)}.${b.format}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-DAF-Row-Count':String(chosen.length)}});
}catch(e){return failure(e);}}
