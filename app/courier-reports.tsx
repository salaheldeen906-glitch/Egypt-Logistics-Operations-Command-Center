'use client';
import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {type Actor,type Command,type Row,type State} from '@/lib/model';
import {type Filters,filterRequests} from '@/lib/insights';
import {type ColumnFilter} from '@/lib/report-filters';
import {exportColumns,exportedRows} from '@/lib/tabular-export';
import {canReadTracking} from '@/lib/gps';
import GridTable,{TableScope,type GridColumn} from './grid-table';
import {ExportPanel} from './file-workspace';
import {GpsTracking} from './gps-tracking';
import {EvidenceTable} from './evidence-table';
import './travel.css';

export type TravelWorkspaceProps={s:State;actor:Actor;ar:boolean;run:(c:Command)=>Promise<any>;onOpenRequest:(id:string)=>void;requestIds?:string[];from?:string;to?:string;filters?:Filters};
type Level='summary'|'journeys'|'visits'|'events';
type ReportContext={level:Level;executorId:string;journeyId:string;visitId:string;from:string;to:string;search:string;columns:Record<string,Record<string,ColumnFilter>>};
const levelKinds:Record<Level,string>={summary:'courier_summary',journeys:'journey_details',visits:'visit_details',events:'travel_events'};
const defaultKeys:Record<Level,string[]>={
 summary:['executor','startedJourneys','completedJourneys','clientVisits','warehouseVisits','uniquePlaces','delivered','returned','custody','unit'],
 journeys:['code','executor','statusLabel','startedAt','endedAt','requestCodes','visits','uniquePlaces'],
 visits:['code','placeKind','customer','site','address','arrivedAt','departedAt','outcomeLabel'],
 events:['code','request','task','action','product','batch','quantity','unit','at','recipient','proof'],
};
const statusLabels:Record<string,[string,string]>={planned:['مخططة','Planned'],in_transit:['بدأت — في الطريق','Started — in transit'],completed:['مكتملة','Completed'],cancelled:['ملغاة','Cancelled'],arrived:['داخل الموقع','At location'],partial:['تنفيذ جزئي','Partial'],failed:['تعذر التنفيذ','Failed'],customer:['عميل','Customer'],warehouse:['مخزن','Warehouse'],supplier:['مورد','Supplier'],courier:['مندوب','Courier'],other:['مكان آخر','Other'],explicit:['زيارة مسجلة','Explicit visit'],operational:['وصول تشغيلي مسجل','Recorded operational arrival'],legacy:['سجل سابق — مستنتج من التوقيت','Historical timestamp-derived'],unknown:['النتيجة غير مسجلة مستقلًا','Outcome not recorded separately'],customer_delivery:['تسليم عميل','Customer delivery'],warehouse_receipt:['قبول مخزن','Warehouse receipt'],return_collected:['جمع مرتجع','Collected return'],return_presented:['تقديم مرتجع للمخزن','Presented return'],return_accepted:['مرتجع قبله المخزن','Warehouse accepted return'],source_collected:['استلام من المصدر','Source collection'],warehouse_presented:['تقديم للمخزن','Warehouse presentation']};
export function travelLabel(value:unknown,ar:boolean){const str=String(value??'');if(str==='document_completed')return ar?'تنفيذ مهمة مستندية':'Document task completed';return statusLabels[str]?.[ar?0:1]||str||'—';}
export function travelTime(value:unknown,ar:boolean){if(!value)return ar?'لم يسجل':'Not recorded';const date=new Date(String(value));return Number.isFinite(date.getTime())?date.toLocaleString(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo'}):String(value);}
function initialContext(from='',to=''):ReportContext{return {level:'summary',executorId:'',journeyId:'',visitId:'',from,to,search:'',columns:{}};}
function cleanContext(raw:any,from='',to=''):ReportContext{
 const base=initialContext(from,to);if(!raw||typeof raw!=='object')return base;
 const restored={...base,level:['summary','journeys','visits','events'].includes(raw.level)?raw.level:'summary',...Object.fromEntries(['executorId','journeyId','visitId','from','to','search'].map(k=>[k,typeof raw[k]==='string'?raw[k].slice(0,180):(base as any)[k]])),columns:raw.columns&&typeof raw.columns==='object'?raw.columns:{}} as ReportContext;
 for(const key of ['from','to'] as const)if(restored[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(restored[key]))restored[key]='';return restored;
}

/** A single report context stays mounted while drilling down, retaining each table's filters and sort. */
export function CourierReports({s,actor,ar,onOpenRequest,requestIds,from='',to='',filters}:TravelWorkspaceProps){
 const scope=useContext(TableScope),storage=`daf-travel-report-v1:${scope}:${actor.userId}`,l=(a:string,b:string)=>ar?a:b;
 const [ctx,C]=useState<ReportContext>(()=>initialContext(from,to)),[loaded,L]=useState(''),[visible,V]=useState<Record<string,string[]>>({}),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{let saved;try{saved=JSON.parse(localStorage.getItem(storage)||'null');}catch{}C(cleanContext(saved,from,to));L(storage);},[storage]);
 useEffect(()=>{if(loaded!==storage)return;try{localStorage.setItem(storage,JSON.stringify(ctx));}catch{}},[storage,loaded,ctx]);
 const incomingPeriod=useRef({from,to});
 useEffect(()=>{if(incomingPeriod.current.from===from&&incomingPeriod.current.to===to)return;incomingPeriod.current={from,to};C(c=>({...c,from,to}));},[from,to]);
 const filterScope:Filters={project:'all',warehouse:'all',query:'',queue:'all',...filters,from:'',to:''};
 // Date is the actual journey/visit/event period, not the creation date of its parent request.
 const permittedRequests=requestIds||filterRequests(s,filterScope).map(r=>r.id),requestSignature=[...permittedRequests].sort().join('|');
 const periodError=!!(ctx.from&&ctx.to&&ctx.from>ctx.to);
 const reports=useMemo(()=>{
  const input={...filterScope,requestIds:permittedRequests,from:ctx.from,to:ctx.to};
  // The same read-only projection powers both the visible tables and secured server export.
  return {summary:periodError?[]:exportedRows(s,'courier_summary',input),journeys:periodError?[]:exportedRows(s,'journey_details',input),visits:periodError?[]:exportedRows(s,'visit_details',input),events:periodError?[]:exportedRows(s,'travel_events',input)};
 },[s,requestSignature,ctx.from,ctx.to,JSON.stringify(filterScope)]);
 const executor=s.resources.find(r=>r.id===ctx.executorId),journey=reports.journeys.find((r:Row)=>r.id===ctx.journeyId),storedJourney=s.journey_runs.find(r=>r.id===ctx.journeyId),visit=reports.visits.find((r:Row)=>r.id===ctx.visitId),courierSummary=reports.summary.find((r:Row)=>r.executorId===ctx.executorId);
 const go=(level:Level,extra:Partial<ReportContext>={})=>{C(c=>({...c,level,...extra}));requestAnimationFrame(()=>heading.current?.focus());};
 const scopedRows=(level:Level):Row[]=>{
  const rows=(reports as any)[level] as Row[];
  return rows.filter(r=>(level==='summary'||!ctx.executorId||r.executorId===ctx.executorId)&&(level==='summary'||level==='journeys'||!ctx.journeyId||r.journeyId===ctx.journeyId)&&(level!=='events'||!ctx.visitId||r.visitId===ctx.visitId)&&(!ctx.search||JSON.stringify(r).toLocaleLowerCase().includes(ctx.search.toLocaleLowerCase())));
 };
 const requestButtons=(ids:unknown)=>Array.isArray(ids)?ids.filter(id=>s.requests.some(r=>r.id===id)).map(id=><Button key={id} size="sm" variant="outline" onClick={()=>onOpenRequest(id)}>{s.requests.find(r=>r.id===id)?.code}</Button>):null;
 const columnsFor=(level:Level):GridColumn[]=>{
  const defs=exportColumns[levelKinds[level]]||[];
  return [...defs.map(d=>({key:d.key,label:ar?d.ar:d.en,type:d.type,value:(r:Row)=>r[d.key],render:['status','outcome','placeKind','source','action'].includes(d.key)?(r:Row)=>travelLabel(r[d.key],ar):['startedAt','endedAt','arrivedAt','departedAt','createdAt','at'].includes(d.key)?(r:Row)=>travelTime(r[d.key],ar):d.key==='address'?(r:Row)=><span className="travel-full-address">{r[d.key]||'—'}</span>:d.key==='proof'?(r:Row)=>r[d.key]?<span>{String(r[d.key])}</span>:<span>{l('لا يوجد إثبات مرتبط','No linked proof')}</span>:undefined})),{key:'__details',label:l('التفاصيل','Details'),required:true,filterable:false,render:(r:Row)=>level==='summary'?<Button variant="outline" size="sm" onClick={()=>go('journeys',{executorId:r.executorId,journeyId:'',visitId:''})}>{l('عرض الرحلات والأماكن','Open trips & places')}</Button>:level==='journeys'?<Button variant="outline" size="sm" onClick={()=>go('visits',{executorId:r.executorId,journeyId:r.id,visitId:''})}>{l('عرض الزيارات','Open visits')}</Button>:level==='visits'?<Button variant="outline" size="sm" onClick={()=>go('events',{executorId:r.executorId,journeyId:r.journeyId,visitId:r.id})}>{l('التنفيذ والطلبات','Execution & requests')}</Button>:requestButtons(r.requestIds?.length?r.requestIds:r.requestId?[r.requestId]:[])}];
 };
 const names:Record<Level,string>={summary:l('ملخص مجهود المناديب','Courier workload summary'),journeys:l('رحلات المندوب','Courier journeys'),visits:l('الأماكن والزيارات الفعلية','Places & actual visits'),events:l('المهام والوقائع والإثباتات','Tasks, events & proof')};
 const currentLevel=ctx.level,rows=scopedRows(currentLevel),error=periodError,proofIds=new Set(scopedRows('events').map(r=>r.documentId).filter(Boolean)),proofDocuments=s.documents.filter(d=>proofIds.has(d.id));
 return <section className="panel travel-workspace travel-reports" aria-labelledby="travel-report-heading">
  <div className="section-heading"><div><p className="travel-eyebrow">{l('التقارير ← مجهود المناديب','Reports → Courier workload')}</p><h2 id="travel-report-heading" ref={heading} tabIndex={-1}>{names[currentLevel]}</h2></div>{currentLevel!=='summary'&&<Button variant="outline" onClick={()=>go(currentLevel==='events'?'visits':currentLevel==='visits'&&ctx.journeyId?'journeys':'summary')}>{l('رجوع للمستوى السابق','Back one level')}</Button>}</div>
  <nav className="travel-breadcrumb" aria-label={l('مكانك داخل التقرير','Report location')}><button type="button" onClick={()=>go('summary')}>{l('كل المناديب','All couriers')}</button>{ctx.executorId&&<><span aria-hidden="true">/</span><button type="button" onClick={()=>go('journeys',{journeyId:'',visitId:''})}>{executor?.name||l('المندوب المحدد','Selected courier')}</button></>}{ctx.journeyId&&<><span aria-hidden="true">/</span><button type="button" onClick={()=>go('visits',{visitId:''})}>{journey?.code||l('الرحلة المحددة','Selected journey')}</button></>}{currentLevel==='events'&&<><span aria-hidden="true">/</span><span>{visit?.address||l('الزيارة المحددة','Selected visit')}</span></>}</nav>
  <div className="travel-filter-row"><label>{l('الفترة الفعلية — من','Actual period — from')}<input type="date" value={ctx.from} onChange={e=>C(c=>({...c,from:e.target.value}))}/></label><label>{l('إلى','To')}<input type="date" value={ctx.to} onChange={e=>C(c=>({...c,to:e.target.value}))}/></label><label className="travel-grow">{l('ابحث في بيانات هذا المستوى','Search the current level')}<input type="search" value={ctx.search} onChange={e=>C(c=>({...c,search:e.target.value}))} maxLength={180}/></label><Button variant="outline" onClick={()=>C(c=>({...initialContext(),level:c.level,executorId:c.executorId,journeyId:c.journeyId,visitId:c.visitId}))}>{l('مسح فلاتر العرض','Clear view filters')}</Button></div>
  {error&&<p className="error" role="alert">{l('تاريخ البداية يجب ألا يتجاوز النهاية.','The start date must not exceed the end date.')}</p>}
  {currentLevel==='summary'&&<div className="travel-explainer"><b>{l('عدد الرحلات وحده لا يقيّم المندوب.','Trip count alone does not rate a courier.')}</b><p>{l('المخطط منفصل عن الذي بدأ أو اكتمل. زيارة المكان تُحسب بعد وصول مسجل، والرجوع إليه يُسجّل زيارة جديدة. عدة منتجات في نفس الزيارة لا تضاعف عددها.','Planned, started and completed journeys are separate. Visits require recorded arrival; returning creates a new visit. Multiple products do not multiply the visit count.')}</p><p>{l('العهدة المعروضة هي الرصيد الحالي في نطاق الطلبات، وليست رصيد نهاية الفترة التاريخي. الوحدات المختلفة لا تجمع في رقم واحد.','Custody is the current balance for the scoped requests, not a historical period-end balance. Different units are not added together.')}</p></div>}
  {currentLevel==='journeys'&&<><p className="travel-context">{l('المندوب','Courier')}: <b>{executor?.name||'—'}</b> · <Button size="sm" variant="ghost" onClick={()=>go('visits',{journeyId:'',visitId:''})}>{l('عرض كل الأماكن التي زارها','View all visited places')}</Button> · <Button size="sm" variant="ghost" onClick={()=>go('events',{journeyId:'',visitId:''})}>{l('كل الوقائع، بما فيها غير المرتبطة بزيارة','All events, including unlinked events')}</Button></p>{courierSummary&&courierSummary.quantityByUnit?.length>0&&<details className="travel-linked-tasks"><summary>{l('الكميات حسب الوحدة — دون جمع وحدات مختلفة','Quantities by unit — no mixed-unit totals')}</summary><GridTable tableId="travel:courier-units" rows={courierSummary.quantityByUnit.map((u:any)=>({...u,id:u.unitId}))} columns={[{key:'unit',label:l('الوحدة','Unit')},{key:'delivered',label:l('المسلم للعميل','Customer delivered'),type:'number'},{key:'returned',label:l('جمعه مرتجعًا','Collected return'),type:'number'},{key:'returnAccepted',label:l('قبله المخزن مرتجعًا','Warehouse accepted return'),type:'number'},{key:'custody',label:l('العهدة الحالية','Current custody'),type:'number'}]}/></details>}</>}
  {currentLevel==='visits'&&journey&&<div className="travel-context"><b>{journey.code}</b> · {travelLabel(journey.status,ar)}<div className="inline-actions">{requestButtons(journey.requestIds)}</div></div>}
  {currentLevel==='visits'&&storedJourney&&!storedJourney.scopeReadOnly&&canReadTracking(s,actor,{id:'visibility',code:'GPS',journeyId:storedJourney.id})&&<details className="travel-linked-tasks"><summary>{l('موقع هذه الرحلة وآخر تحديث — عند مشاركة المندوب','Journey location & last update — if shared by courier')}</summary><GpsTracking key={storedJourney.id} s={s} actor={actor} journey={storedJourney} ar={ar}/></details>}
  {currentLevel==='events'&&visit&&<div className="travel-place-card"><span>{travelLabel(visit.placeKind,ar)}</span><h3>{visit.customer||visit.warehouse||visit.site||l('مكان الزيارة','Visit place')}</h3><p className="travel-full-address">{visit.address}</p><p>{l('وصول','Arrival')}: {travelTime(visit.arrivedAt,ar)} · {l('مغادرة','Departure')}: {travelTime(visit.departedAt,ar)}</p><p>{travelLabel(visit.outcome,ar)}{visit.reason?' · '+visit.reason:''}</p><div className="inline-actions">{requestButtons(visit.requestIds)}</div></div>}
  <p className="travel-context" role="status">{rows.length} {l('سجل في المستوى الحالي؛ التفاصيل محفوظة عند الرجوع.','records at this level; returning preserves your context.')}</p>
  {(['summary','journeys','visits','events'] as Level[]).map(level=>{
   const cols=columnsFor(level),kind=levelKinds[level],data=scopedRows(level),active=ctx.columns[level]||{};
   const exportableActive=Object.fromEntries(Object.entries(active).filter(([key])=>exportColumns[kind]?.some(c=>c.key===key)));
   const baseFilters:Record<string,ColumnFilter>={...exportableActive,...(level!=='summary'&&ctx.executorId?{executorId:{op:'equals' as const,value:ctx.executorId}}:{}),...((level==='visits'||level==='events')&&ctx.journeyId?{journeyId:{op:'equals' as const,value:ctx.journeyId}}:{}),...(level==='events'&&ctx.visitId?{visitId:{op:'equals' as const,value:ctx.visitId}}:{})};
   const exportFilters={...filterScope,requestIds:permittedRequests,from:ctx.from,to:ctx.to,travelQuery:ctx.search,columnFilters:baseFilters};
   return <div key={level} hidden={level!==currentLevel} className="travel-report-level"><GridTable tableId={'travel:'+level} columns={cols} rows={error?[]:data} defaultHidden={cols.filter(c=>!defaultKeys[level].includes(c.key)&&c.key!=='__details').map(c=>c.key)} columnFilters={active} onColumnFilters={value=>C(c=>({...c,columns:{...c.columns,[level]:value}}))} onVisibleColumns={value=>V(v=>v[level]?.join('|')===value.join('|')?v:{...v,[level]:value})} empty={l('لا توجد وقائع مطابقة. تخطيط محطة وحده لا يثبت زيارتها.','No matching records. A planned stop does not prove an actual visit.')}/>{!error&&exportColumns[kind]&&<ExportPanel ar={ar} kind={kind} filters={exportFilters} visibleColumns={(visible[level]||[]).filter(k=>k!=='__details')}/>}</div>;
  })}
  {currentLevel==='events'&&proofDocuments.length>0&&<details className="travel-linked-tasks"><summary>{l('معاينة الإثباتات المرتبطة بهذه الوقائع وتنزيلها','Preview & download linked event evidence')} · {proofDocuments.length}</summary><EvidenceTable s={s} docs={proofDocuments} ar={ar} openRequest={onOpenRequest}/></details>}
  {ctx.executorId&&currentLevel==='summary'&&<Button variant="outline" onClick={()=>go('journeys')}>{l('استكمال تفاصيل آخر مندوب','Continue last courier details')}</Button>}
 </section>;
}
