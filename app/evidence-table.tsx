'use client';
import {useEffect,useState} from 'react';
import {type State,type Row} from '@/lib/model';
import {documentTasks} from '@/lib/task-trace';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import GridTable from './grid-table';
export function EvidenceTable({s,docs,ar,training=false,openRequest}:{s:State;docs:Row[];ar:boolean;training?:boolean;openRequest?:(id:string)=>void}){
 const l=(a:string,b:string)=>ar?a:b,[preview,setPreview]=useState<Row|null>(null),[url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let live=true,objectUrl='';setUrl('');setError('');if(preview&&!training){fetch('/api/file?id='+encodeURIComponent(preview.id)+'&preview=1',{cache:'no-store'}).then(async r=>{if(!r.ok){const d:any=await r.json();throw new Error(d.error||'Preview failed');}return r.blob();}).then(blob=>{if(live){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(e=>{if(live)setError(e.message);});}return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[preview?.id,training]);
 return <><GridTable tableId="evidence" empty={l('لم تُرفع مستندات بعد','No documents uploaded')} rows={docs} columns={[
 {key:'name',label:l('المستند','Document'),render:d=><><b>{d.name}</b><small dir="ltr">{d.code}</small><small>{d.mime} · {Number(d.size||0).toLocaleString()} bytes</small></>},
 {key:'request',label:l('الطلب','Request'),render:d=>{const r=s.requests.find(r=>r.id===d.requestId);return openRequest?<button className="text-link" onClick={()=>openRequest(d.requestId)}>{r?.code}</button>:r?.code;}},
 {key:'task',label:l('رقم المهمة / التوزيعة','Task / allocation number'),render:d=>documentTasks(s,d).map(t=>t.code).join(' / ')||l('مستند عام للطلب','Request document')},
 {key:'destination',label:l('الوجهة','Destination'),render:d=>documentTasks(s,d).map(t=>t.destination).join(' / ')||'—'},
 {key:'execution',label:l('تسجيل التنفيذ','Recorded execution'),render:d=>d.verified?l('تم التسجيل بنفس المستند','Recorded with this document'):l('مرفوع — بانتظار التسجيل','Uploaded — awaiting confirmation')},
 {key:'uploader',label:l('رفعه','Uploaded by'),render:d=>d.uploadedByName||s.resources.find(r=>r.id===d.createdBy)?.name||l('راجع سجل التدقيق','See audit history')},
 {key:'uploaded',label:l('وقت الرفع','Uploaded at'),render:d=>d.createdAt?new Date(d.createdAt).toLocaleString(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo'}):'—'},
 {key:'actions',label:l('المعاينة والتنزيل','Preview and download'),required:true,render:d=>training?<span>{l('مرفق تدريبي','Training attachment')}</span>:<div className="inline-actions">{['image/png','image/jpeg','application/pdf'].includes(d.mime)&&<Button size="sm" variant="outline" onClick={()=>setPreview(d)}>{l('معاينة','Preview')}</Button>}<a className="text-link" href={'/api/file?id='+encodeURIComponent(d.id)}>{l('تنزيل','Download')}</a></div>}
 ]}/><Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="enhancement-dialog proof-preview"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{l('معاينة الملف المحفوظ؛ تسجيل تنفيذ العملية يظهر منفصلًا في الجدول.','Preview of the saved file; operational confirmation is shown separately in the table.')}</DialogDescription></DialogHeader>{error?<p role="alert">{error}</p>:!url?<p role="status">{l('جارٍ تحميل المعاينة…','Loading preview…')}</p>:preview?.mime==='application/pdf'?<iframe title={preview.name} src={url} sandbox=""/>:<img alt={l('إثبات مرفوع: ','Uploaded evidence: ')+preview?.name} src={url}/>}<Button variant="outline" onClick={()=>setPreview(null)}>{l('إغلاق المعاينة','Close preview')}</Button></DialogContent></Dialog></>;
}
