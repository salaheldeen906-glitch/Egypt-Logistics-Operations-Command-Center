'use client';

import {useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,ClipboardList,ListChecks,Route,MapPin,ArrowUpRight,Download,Table2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {statusAr,type Row,type State} from '@/lib/model';
import {type Filters} from '@/lib/insights';
import {filterColumns,type ColumnFilter} from '@/lib/report-filters';
import {csvBytes,xlsxBytes} from '@/lib/tabular-export';
import {reportsOverview} from '@/lib/reports-overview';
import {loadOverviewExportRows,overviewFieldKeys,overviewTableValues} from '@/lib/report-overview-export';
import GridTable,{TableScope,type GridColumn} from './grid-table';
import './reports-overview.css';

type MetricKey='requests'|'tasks'|'journeys'|'visits';
type OverviewPreferences={open:boolean;metric:MetricKey;day:string;status:string;tableFilters:Record<string,ColumnFilter>;exportKeys:string[];sameView:boolean};
const fieldKeys=overviewFieldKeys;
const icons={requests:ClipboardList,tasks:ListChecks,journeys:Route,visits:MapPin};
const defaultPreferences:OverviewPreferences={open:true,metric:'requests',day:'',status:'',tableFilters:{},exportKeys:['code','name','status','at','requestCodes','address'],sameView:false};
function preferences(raw:any):OverviewPreferences{
 if(!raw||typeof raw!=='object')return {...defaultPreferences};
 return {open:raw.open!==false,metric:['requests','tasks','journeys','visits'].includes(raw.metric)?raw.metric:'requests',day:typeof raw.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.day)?raw.day:'',status:typeof raw.status==='string'?raw.status.slice(0,100):'',tableFilters:raw.tableFilters&&typeof raw.tableFilters==='object'&&!Array.isArray(raw.tableFilters)?raw.tableFilters:{},exportKeys:Array.isArray(raw.exportKeys)?raw.exportKeys.filter((k:unknown,index:number,all:unknown[])=>typeof k==='string'&&fieldKeys.includes(k)&&all.indexOf(k)===index):[...defaultPreferences.exportKeys],sameView:raw.sameView===true};
}
function displayDate(value:unknown,ar:boolean){
 if(!value)return ar?'غير مسجل':'Not recorded';
 const date=new Date(String(value));return Number.isFinite(date.getTime())?date.toLocaleString(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}):String(value);
}
function dateLabel(day:string,ar:boolean){const date=new Date(day+'T12:00:00Z');return Number.isFinite(date.getTime())?date.toLocaleDateString(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo',day:'numeric',month:'short'}):day;}
function labelStatus(value:unknown,ar:boolean){const str=String(value??'');return ar?({unknown:'غير مسجل',partial:'تنفيذ جزئي',cancelled:'ملغاة'}[str]||statusAr[str]||str||'غير مسجل'):(str==='unknown'?'Not recorded':str.replace(/_/g,' ')||'Not recorded');}
export {overviewTableValues} from '@/lib/report-overview-export';

/** Read-only analytics over the server-scoped state. No operational action is executed here. */
export function ReportsOverview({s,ar,filters,onOpenRequest,preview=false,loadExportState}:{s:State;ar:boolean;filters:Filters;onOpenRequest?:(id:string)=>void;preview?:boolean;loadExportState?:(metric?:MetricKey)=>Promise<State>}){
 const scope=useContext(TableScope),key='daf-report-overview-v1:'+scope,id=useId().replace(/:/g,''),l=(arabic:string,english:string)=>ar?arabic:english;
 const [prefs,setPrefs]=useState<OverviewPreferences>(()=>({...defaultPreferences})),[loaded,setLoaded]=useState(''),[visibleColumns,setVisibleColumns]=useState<string[]>(fieldKeys),[exportNotice,setExportNotice]=useState(''),[exportError,setExportError]=useState(''),[exportBusy,setExportBusy]=useState(false);
 const exportInProgress=useRef(false);
 const detailHeading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{let raw;try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch{}setPrefs(preferences(raw));setLoaded(key);},[key]);
 useEffect(()=>{if(loaded!==key)return;try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}},[loaded,key,prefs]);
 const active=loaded===key?prefs:defaultPreferences;
 const projection=useMemo(()=>{try{return {report:reportsOverview(s,filters),error:''};}catch(error){return {report:reportsOverview({},{project:'all',warehouse:'all',query:'',from:'',to:'',queue:'all'}),error:error instanceof Error?error.message:'Invalid report filters'};}},[s,filters.project,filters.warehouse,filters.query,filters.from,filters.to,filters.queue]);
 const report=projection.report,metric=report.metrics.find(m=>m.key===active.metric)||report.metrics[0];
 const requestMetric=report.metrics.find(m=>m.key==='requests');
 const selectionIds=active.day?report.activity.find(a=>a.day===active.day)?.ids:active.status?report.requestStatuses.find(a=>a.status===active.status)?.ids:null;
 const selectionSet=new Set(selectionIds||[]),selectedRows=metric.rows.filter(row=>!active.day&&!active.status||selectionSet.has(row.id));
 const fields:GridColumn[]=[
  {key:'code',label:l('رقم السجل','Record')},
  {key:'name',label:l('الاسم / البيان','Name / description')},
  {key:'status',label:l('الحالة','Status'),type:'choice',render:(r:Row)=>labelStatus(r.status,ar)},
  {key:'at',label:l('تاريخ المؤشر','Metric date'),type:'date',render:(r:Row)=>displayDate(r.atRaw||r.at,ar)},
  {key:'requestCodes',label:l('الطلبات المرتبطة','Linked requests'),value:(r:Row)=>Array.isArray(r.requestCodes)?r.requestCodes.join(' · '):r.requestCodes||'—'},
  {key:'address',label:l('المكان / عنوان التنفيذ','Place / execution address'),render:(r:Row)=><span className="ro-full-address">{r.address||l('غير مسجل','Not recorded')}</span>},
  {key:'source',label:l('مصدر إثبات الرحلة / الزيارة','Journey / visit evidence source'),render:(r:Row)=>r.source==='legacy'?l('سجل تشغيلي سابق','Legacy operational record'):r.source==='explicit'?l('سجل رحلة / زيارة مباشر','Explicit journey / visit record'):r.source||'—'},
  {key:'timingNote',label:l('حدود دقة التوقيت','Timing limitations'),render:(r:Row)=><span className="ro-full-address">{r.timingNote||'—'}</span>},
  ...(onOpenRequest?[{key:'__request',label:l('التفاصيل','Details'),filterable:false,render:(r:Row)=>{const ids=active.metric==='requests'?[r.id]:Array.isArray(r.requestIds)?r.requestIds:r.requestId?[r.requestId]:[];return <div className="ro-request-links">{ids.filter((requestId:string)=>s.requests.some(q=>q.id===requestId)).map((requestId:string)=><Button key={requestId} type="button" size="sm" variant="ghost" onClick={()=>onOpenRequest(requestId)}>{s.requests.find(q=>q.id===requestId)?.code}<ArrowUpRight size={14}/></Button>)}</div>;}}]:[]),
 ];
 const values=overviewTableValues(selectedRows).map(r=>({...r,requestCodes:Array.isArray(r.requestCodes)?r.requestCodes.join(' · '):r.requestCodes||'—'}));
 let exportRows:Row[]=[],filterError='';try{exportRows=filterColumns(values,active.tableFilters,fields.map(c=>c.key));}catch(e){filterError=e instanceof Error?e.message:l('راجع فلاتر الأعمدة','Check column filters');}
 const choose=(metricKey:MetricKey,extra:{day?:string;status?:string}={})=>{setPrefs(p=>({...p,metric:metricKey,day:extra.day||'',status:extra.status||'',tableFilters:{}}));setExportNotice('');requestAnimationFrame(()=>detailHeading.current?.focus());};
 const maxActivity=Math.max(1,...report.activity.map(a=>a.count)),maxStatus=Math.max(1,...report.requestStatuses.map(a=>a.count)),plotWidth=Math.max(480,report.activity.length*16),plotHeight=126,pad=16;
 const activityStart=Date.parse((report.activity[0]?.day||'1970-01-01')+'T00:00:00Z'),activityEnd=Date.parse((report.activity[report.activity.length-1]?.day||'1970-01-01')+'T00:00:00Z');
 const activityX=(index:number)=>pad+(activityEnd===activityStart?(plotWidth-pad*2)/2:(Date.parse(report.activity[index].day+'T00:00:00Z')-activityStart)/(activityEnd-activityStart)*(plotWidth-pad*2));
 const activityY=(count:number)=>plotHeight-pad-count/maxActivity*(plotHeight-pad*2);
 const activityPath=report.activity.map((a,index)=>(index?'L':'M')+activityX(index)+','+activityY(a.count)).join(' ');
 const exportedKeys=(active.sameView?visibleColumns:active.exportKeys).filter(k=>fieldKeys.includes(k));
 const canExport=preview||typeof loadExportState==='function';
 const exportData=async(format:'csv'|'xlsx')=>{
  if(exportInProgress.current||!canExport||!exportedKeys.length||filterError||projection.error)return;
  exportInProgress.current=true;setExportBusy(true);setExportNotice('');setExportError('');
  try{
   const rows=await loadOverviewExportRows({state:s,preview,loadExportState,filters,selection:active});
   if(!rows.length){setExportNotice(l('لا توجد نتائج مطابقة في البيانات الحالية؛ لم يتم تحميل ملف.','No matching results remain in the current data; no file was downloaded.'));return;}
   const headers=exportedKeys.map(k=>fields.find(c=>c.key===k)?.label||k),values=rows.map(r=>exportedKeys.map(k=>k==='status'?labelStatus(r[k],ar):k==='at'?r.atRaw:r[k]));
   const bytes=format==='xlsx'?xlsxBytes(headers,values):csvBytes(headers,values);
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8;'}));
   try{const anchor=document.createElement('a');anchor.href=url;anchor.download='DAF-report-'+active.metric+'.'+format;anchor.click();}finally{URL.revokeObjectURL(url);}
   setExportNotice(l('تم تصدير كل النتائج المفلترة، عبر جميع الصفحات.','All filtered results were exported across every page.')+' '+rows.length);
  }catch(error){setExportError(error instanceof Error?error.message:l('تعذّر التصدير؛ لم يتم تحميل ملف. حاول مرة أخرى.','Export failed; no file was downloaded. Try again.'));}
  finally{exportInProgress.current=false;setExportBusy(false);}
 };
 const exportCsv=()=>exportData('csv');
 const exportExcel=()=>exportData('xlsx');
 const sourceSummary=l('من الطلبات والمهام وسجل الرحلات والزيارات المسموح لحسابك برؤيتها. كل مؤشر يُعدّ مستقلًا.','From the requests, tasks, journeys and visits your account may view. Each measure is counted separately.');
 return <section className="panel reports-overview" aria-labelledby={id+'-title'} dir={ar?'rtl':'ltr'}>
  <div className="ro-group-header"><div><div className="ro-heading-line"><h2 id={id+'-title'}>{l('ملخص التشغيل','Operations overview')}</h2>{preview&&<span className="ro-preview">{l('معاينة للمراجعة','Review preview')}</span>}</div><p>{l('المؤشرات الأساسية، ثم السجلات التي تكوّن كل رقم.','The key measures, followed by the records behind every figure.')}</p></div><button className="ro-toggle" type="button" aria-label={l('ملخص التشغيل — ','Operations overview — ')+(active.open?l('إخفاء التفاصيل','Hide details'):l('عرض التفاصيل','Show details'))} aria-expanded={active.open} aria-controls={id+'-content'} onClick={()=>setPrefs(p=>({...p,open:!p.open}))}>{active.open?<ChevronUp aria-hidden="true" size={22}/>:<ChevronDown aria-hidden="true" size={22}/>}</button></div>
  <div id={id+'-content'} hidden={!active.open} className="ro-content">
   <Button type="button" variant="outline" size="sm" disabled={!canExport||exportBusy||!exportedKeys.length||!!filterError||!!projection.error||metric.value===null||!exportRows.length} onClick={exportExcel}><Download size={15} aria-hidden="true"/>Excel · {exportRows.length}</Button>
   {projection.error&&<p className="ro-filter-error" role="alert">{l('تعذّر عرض الملخص. راجع الفترة والفلاتر أعلى الصفحة؛ لم يُستخدم نطاق بديل.','The overview could not be shown. Check the page period and filters; no alternative data scope was used.')} <span>{projection.error}</span></p>}
   <div className="ro-period"><span>{l('النطاق الحالي','Current scope')}: <b>{filters.from||l('من البداية','From beginning')} — {filters.to||l('حتى الآن','Through now')}</b></span><span>{l('التواريخ بتوقيت القاهرة · الفلاتر أعلى الصفحة تطبّق هنا','Cairo dates · The page filters apply here')}</span></div>
   <div className="ro-metrics">{report.metrics.map(m=>{const Icon=icons[m.key as MetricKey],selected=active.metric===m.key&&!active.day&&!active.status;return <button type="button" key={m.key} className="ro-metric" aria-pressed={selected} onClick={()=>choose(m.key as MetricKey)} aria-describedby={id+'-definition-'+m.key}><span className="ro-metric-label"><Icon size={18} aria-hidden="true"/>{ar?m.labelAr:m.labelEn}</span><strong>{m.value===null?l('غير متاح','Unavailable'):m.value.toLocaleString(ar?'ar-EG':'en-GB')}</strong><span className="ro-metric-bottom">{m.value===null?l('راجع المصدر والتواريخ','Check source & dates'):l('عرض السجلات','View records')}<ArrowUpRight size={14} aria-hidden="true"/></span></button>;})}</div>
   <p className="ro-source">{sourceSummary}</p>
   {report.warnings.length>0&&<div className="ro-warnings" role="status">{report.warnings.map((warning,index)=><p key={index}>{ar?warning.ar:warning.en}</p>)}</div>}
   <div className="ro-charts">
    <article className="ro-chart" aria-labelledby={id+'-trend'}><div className="ro-chart-heading"><div><h3 id={id+'-trend'}>{l('نشاط إنشاء الطلبات','Request creation activity')}</h3><p>{l('الأيام التي سجلت طلبات بتاريخ معروف فقط؛ اختر نقطة لعرض طلباتها.','Only days with requests and known dates; select a point to view its records.')}</p></div><span className="ro-chart-total" aria-label={l('إجمالي الطلبات ذات التاريخ المعروف في الرسم','Total dated requests in the chart')}>{requestMetric?.value===null?l('غير متاح','Unavailable'):report.activity.reduce((total,day)=>total+day.count,0).toLocaleString(ar?'ar-EG':'en-GB')}</span></div>
     {requestMetric?.value===null?<p className="ro-empty">{l('الرسم غير متاح حتى يكتمل مصدر بيانات الطلبات وتواريخها.','The chart is unavailable until the request source and dates are complete.')}</p>:report.activity.length?<div className="ro-line-scroll"><svg className="ro-line-chart" viewBox={'0 0 '+plotWidth+' '+plotHeight} style={{minWidth:plotWidth}} aria-label={l('طلبات جديدة حسب يوم الإنشاء؛ استخدم نقاط الرسم أو الجدول البديل.','New requests by creation day; use the chart points or table alternative.')} role="group"><line x1={pad} y1={plotHeight-pad} x2={plotWidth-pad} y2={plotHeight-pad} className="ro-axis"/><line x1={pad} y1={activityY(maxActivity)} x2={plotWidth-pad} y2={activityY(maxActivity)} className="ro-grid-line"/><path d={activityPath} className="ro-line"/>{report.activity.map((a,index)=><g key={a.day}><circle cx={activityX(index)} cy={activityY(a.count)} r={active.day===a.day?5:3} className="ro-point"/><circle cx={activityX(index)} cy={activityY(a.count)} r={9} className="ro-point-target" role="button" tabIndex={0} aria-label={dateLabel(a.day,ar)+' · '+a.count+' '+l('طلب؛ عرض السجلات','requests; view records')} aria-pressed={active.day===a.day} onClick={()=>choose('requests',{day:a.day})} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose('requests',{day:a.day});}}}><title>{a.day+': '+a.count}</title></circle></g>)}</svg><div className="ro-axis-labels"><span>{dateLabel(report.activity[0].day,ar)}</span><span>{l('أعلى يوم','Peak day')}: {maxActivity.toLocaleString(ar?'ar-EG':'en-GB')}</span><span>{dateLabel(report.activity[report.activity.length-1].day,ar)}</span></div></div>:<p className="ro-empty">{l('لا توجد طلبات مطابقة في هذه الفترة.','No matching requests in this period.')}</p>}
     <details className="ro-chart-table"><summary><Table2 size={15} aria-hidden="true"/>{l('جدول بديل للرسم اليومي','Daily chart table alternative')}</summary><div className="ro-mini-table"><table><thead><tr><th>{l('اليوم','Day')}</th><th>{l('طلبات جديدة','New requests')}</th><th>{l('السجلات','Records')}</th></tr></thead><tbody>{requestMetric?.value!==null&&report.activity.map(a=><tr key={a.day}><td>{a.day}</td><td>{a.count}</td><td><button type="button" onClick={()=>choose('requests',{day:a.day})}>{l('عرض','View')}</button></td></tr>)}</tbody></table>{requestMetric?.value===null&&<p>{l('غير متاح','Unavailable')}</p>}{requestMetric?.value!==null&&!report.activity.length&&<p>{l('لا توجد بيانات مطابقة','No matching data')}</p>}</div></details>
    </article>
    <article className="ro-chart" aria-labelledby={id+'-status'}><div className="ro-chart-heading"><div><h3 id={id+'-status'}>{l('حالات الطلبات','Request statuses')}</h3><p>{l('حالة كل طلب الآن، ضمن طلبات الفترة المحددة.','Current status of each request created in the chosen period.')}</p></div></div>
     {requestMetric?.value===null?<p className="ro-empty">{l('توزيع الحالات غير متاح لمصدر غير مكتمل.','Status distribution is unavailable for an incomplete source.')}</p>:report.requestStatuses.length?<div className="ro-status-bars">{report.requestStatuses.map(a=><button key={a.status} type="button" className="ro-status-row" aria-pressed={active.status===a.status} onClick={()=>choose('requests',{status:a.status})}><span className="ro-status-name">{labelStatus(a.status,ar)}</span><span className="ro-bar-track" aria-hidden="true"><span className={'ro-bar ro-state-'+(a.status||'unknown').replace(/[^a-z_]/g,'')} style={{width:(a.count/maxStatus*100)+'%'}}/></span><b>{a.count.toLocaleString(ar?'ar-EG':'en-GB')}</b></button>)}</div>:<p className="ro-empty">{l('لا توجد طلبات مطابقة.','No matching requests.')}</p>}
     <details className="ro-chart-table"><summary><Table2 size={15} aria-hidden="true"/>{l('جدول بديل لحالات الطلبات','Status chart table alternative')}</summary><div className="ro-mini-table"><table><thead><tr><th>{l('الحالة','Status')}</th><th>{l('العدد','Count')}</th><th>{l('السجلات','Records')}</th></tr></thead><tbody>{requestMetric?.value!==null&&report.requestStatuses.map(a=><tr key={a.status}><td>{labelStatus(a.status,ar)}</td><td>{a.count}</td><td><button type="button" onClick={()=>choose('requests',{status:a.status})}>{l('عرض','View')}</button></td></tr>)}</tbody></table>{requestMetric?.value===null&&<p>{l('غير متاح','Unavailable')}</p>}{requestMetric?.value!==null&&!report.requestStatuses.length&&<p>{l('لا توجد بيانات مطابقة','No matching data')}</p>}</div></details>
    </article>
   </div>
   <details className="ro-definitions"><summary>{l('مصدر البيانات وطريقة حساب المؤشرات','Data sources & measure definitions')}</summary><p>{sourceSummary}</p><dl>{report.metrics.map(m=><div key={m.key} id={id+'-definition-'+m.key}><dt>{ar?m.labelAr:m.labelEn}</dt><dd>{ar?m.definitionAr:m.definitionEn}<span>{ar?m.dateBasisAr:m.dateBasisEn}</span>{m.unknownDates>0&&<span>{l('سجلات بلا تاريخ صالح','Records without a valid date')}: {m.unknownDates}</span>}</dd></div>)}</dl><p>{l('الأرقام ليست تقييمًا للأداء أو أساسًا لحساب أجر. البيانات غير المسجلة لا تستبدل بأرقام تجريبية.','These counts do not set performance ratings or compensation. Unrecorded data is never replaced with demo figures.')}</p></details>
   <div className="ro-detail"><div className="ro-detail-heading"><div><h3 ref={detailHeading} tabIndex={-1}>{l('السجلات المكوّنة للمؤشر','Records behind the measure')} · {ar?metric.labelAr:metric.labelEn}</h3><p role="status">{exportRows.length.toLocaleString(ar?'ar-EG':'en-GB')} {l('سجل بعد فلاتر العرض','records after view filters')}{active.day?' · '+dateLabel(active.day,ar):''}{active.status?' · '+labelStatus(active.status,ar):''}</p></div>{(active.day||active.status)&&<Button type="button" size="sm" variant="outline" onClick={()=>choose('requests')}>{l('مسح اختيار الرسم','Clear chart selection')}</Button>}</div>
    <GridTable tableId="reports-overview-records" columns={fields} rows={values} defaultHidden={['name','address','source','timingNote']} columnFilters={active.tableFilters} onColumnFilters={value=>setPrefs(p=>({...p,tableFilters:value}))} onVisibleColumns={value=>setVisibleColumns(old=>old.join('|')===value.join('|')?old:value)} empty={metric.value===null?l('المؤشر غير مكتمل؛ لا توجد سجلات قابلة للعرض لهذا الاختيار.','The measure is incomplete; no displayable records for this selection.'):l('لا توجد سجلات تطابق الاختيار والفلاتر.','No records match the selection and filters.')}/>
    <div className="ro-export"><details><summary>{l('أعمدة تصدير هذا الملخص','Overview export columns')}</summary><p>{l('مستقلة عن أعمدة العرض. التصدير يشمل كل النتائج المفلترة، وليس الصفحة الحالية فقط.','Independent of display columns. Export includes all filtered results, across every page.')}</p><label className="ro-check"><input type="checkbox" checked={active.sameView} onChange={event=>setPrefs(p=>({...p,sameView:event.target.checked}))}/>{l('نفس أعمدة العرض','Same as displayed columns')}</label><div className="ro-export-columns">{[...active.exportKeys,...fieldKeys.filter(k=>!active.exportKeys.includes(k))].map(k=>{const index=active.exportKeys.indexOf(k),move=(delta:number)=>setPrefs(p=>{const keys=[...p.exportKeys],position=keys.indexOf(k),next=position+delta;if(position<0||next<0||next>=keys.length)return p;[keys[position],keys[next]]=[keys[next],keys[position]];return {...p,exportKeys:keys};});return <div className="ro-export-option" key={k}><label className="ro-check"><input type="checkbox" disabled={active.sameView} checked={exportedKeys.includes(k)} onChange={event=>setPrefs(p=>({...p,exportKeys:event.target.checked?[...p.exportKeys,k]:p.exportKeys.filter(v=>v!==k)}))}/>{fields.find(c=>c.key===k)?.label}</label><button type="button" disabled={active.sameView||index<=0} aria-label={l('تقديم عمود التصدير: ','Move export column earlier: ')+(fields.find(c=>c.key===k)?.label||k)} onClick={()=>move(-1)}>↑</button><button type="button" disabled={active.sameView||index<0||index>=active.exportKeys.length-1} aria-label={l('تأخير عمود التصدير: ','Move export column later: ')+(fields.find(c=>c.key===k)?.label||k)} onClick={()=>move(1)}>↓</button></div>;})}</div></details><Button type="button" variant="outline" size="sm" disabled={!canExport||exportBusy||!exportedKeys.length||!!filterError||!!projection.error||metric.value===null||!exportRows.length} aria-busy={exportBusy} onClick={exportCsv}><Download size={15} aria-hidden="true"/>{exportBusy?l('جارٍ التصدير…','Exporting…'):l('تصدير CSV المفلتر','Export filtered CSV')} · {exportRows.length}</Button></div>{!canExport&&<p className="ro-export-limit">{l('تعذّر التحقق من صلاحيات تصدير هذا الملخص. استخدم أدوات التصدير الحالية أو أعد فتح الصفحة.','Export access for this overview could not be verified. Use the existing export tools or reopen the page.')}</p>}{exportError&&<p className="ro-filter-error" role="alert">{exportError}</p>}{exportNotice&&<p className="ro-export-notice" role="status">{exportNotice}</p>}
   </div>
  </div>
 </section>;
}

export default ReportsOverview;
