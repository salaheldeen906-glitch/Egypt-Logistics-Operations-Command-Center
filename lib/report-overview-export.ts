import {demand, type Row, type State} from './model';
import {type Filters} from './insights';
import {filterColumns, type ColumnFilter} from './report-filters';
import {reportsOverview, type OverviewMetricKey} from './reports-overview';

export const overviewFieldKeys=['code','name','status','at','requestCodes','address','source','timingNote'];
export type OverviewExportSelection={metric:OverviewMetricKey;day:string;status:string;tableFilters:Record<string,ColumnFilter>};
const cairoDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'});

/** Date-only table filters use Cairo days; raw timestamps remain intact for display and export. */
export function overviewTableValues(rows:Row[]):Row[]{return rows.map(record=>{
 const atRaw=record.atRaw??record.at??'',value=typeof atRaw==='string'?atRaw:'',prefix=value.slice(0,10),date=new Date(value),calendar=new Date(prefix+'T00:00:00Z');
 const valid=!!value&&/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)&&Number.isFinite(date.getTime())&&Number.isFinite(calendar.getTime())&&calendar.toISOString().slice(0,10)===prefix;
 return {...record,atRaw,at:valid?(/^\d{4}-\d{2}-\d{2}$/.test(value)?value:cairoDate.format(date)):''};
});}

/** Recompute the exact selection from an authorized snapshot, never stale display rows. */
export function overviewExportRows(state:State,filters:Filters,selection:OverviewExportSelection):Row[]{
 const report=reportsOverview(state,filters),metric=report.metrics.find(m=>m.key===selection.metric);
 demand(metric&&metric.value!==null,'مصدر المؤشر غير مكتمل؛ لم يتم التصدير / The measure source is incomplete; export was cancelled');
 demand(typeof selection.day==='string'&&typeof selection.status==='string'&&!(selection.day&&selection.status),'اختيار الرسم غير صالح / Invalid chart selection');
 demand(!(selection.day||selection.status)||selection.metric==='requests','اختيار الرسم لا يطابق المؤشر / Chart selection does not match the measure');
 if(selection.day){
  const date=new Date(selection.day+'T00:00:00Z');
  demand(/^\d{4}-\d{2}-\d{2}$/.test(selection.day)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===selection.day,'تاريخ الرسم غير صالح / Invalid chart date');
 }
 const selectedIds=selection.day?report.activity.find(day=>day.day===selection.day)?.ids:selection.status?report.requestStatuses.find(status=>status.status===selection.status)?.ids:null;
 const selectedSet=new Set(selectedIds||[]);
 const rows=metric.rows.filter(row=>!selection.day&&!selection.status||selectedSet.has(row.id));
 const values=overviewTableValues(rows).map(row=>({...row,requestCodes:Array.isArray(row.requestCodes)?row.requestCodes.join(' · '):row.requestCodes||'—'}));
 return filterColumns(values,selection.tableFilters,overviewFieldKeys);
}

/** Live export requires a fresh authenticated, server-scoped snapshot supplied by the app. */
export async function loadOverviewExportRows({state,preview,loadExportState,filters,selection}:{state:State;preview:boolean;loadExportState?:(metric?:OverviewMetricKey)=>Promise<State>;filters:Filters;selection:OverviewExportSelection}):Promise<Row[]>{
 demand(preview||typeof loadExportState==='function','تعذّر التحقق من صلاحيات التصدير؛ لم يتم تحميل ملف / Export access could not be verified; no file was downloaded');
 const snapshot=preview?state:await loadExportState!(selection.metric);
 return overviewExportRows(snapshot,filters,selection);
}
