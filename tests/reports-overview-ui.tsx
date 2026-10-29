import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import ReportsOverview,{overviewTableValues} from '../app/reports-overview';
import {TableScope} from '../app/grid-table';
import {emptyState,type State} from '../lib/model';
import {filterColumns} from '../lib/report-filters';
import {csvBytes} from '../lib/tabular-export';
import {loadOverviewExportRows,overviewExportRows} from '../lib/report-overview-export';

const filters={project:'all',warehouse:'all',from:'2026-10-01',to:'2026-10-31',query:'',queue:'all'};
const s=emptyState();
s.projects=[{id:'project-one',code:'P-ONE',name:'First project'},{id:'project-two',code:'P-TWO',name:'Second project'}];
s.requests=[{id:'req-one',code:'REQ-OVERVIEW-ONE',projectId:'project-one',status:'draft',createdAt:'2026-10-19T08:00:00Z',destination:'عنوان التنفيذ المسموح',requestType:'delivery'},{id:'req-two',code:'REQ-OVERVIEW-TWO',projectId:'project-two',status:'approved',createdAt:'2026-10-18T08:00:00Z',destination:'Second project address',requestType:'delivery'}];
const render=(state:State=s,ar=true,preview=true,extra={},loadExportState?:(()=>Promise<State>))=>renderToStaticMarkup(<TableScope.Provider value="test-dataset:test-actor"><ReportsOverview s={state} ar={ar} preview={preview} filters={{...filters,...extra}} onOpenRequest={()=>{}} loadExportState={loadExportState}/></TableScope.Provider>);
let checks=0;
function check(name:string,run:()=>void){run();console.log('PASS',name);checks++;}
const before=JSON.stringify(s),html=render();
check('One first report group is open by default with semantic state and control target',()=>{assert.match(html,/<button[^>]*aria-expanded="true"[^>]*aria-controls="[^"]+-content"/);assert.match(html,/ملخص التشغيل/);assert(!/<div[^>]*id="[^"]+-content"[^>]*hidden/.test(html));});
check('The four independently named metric buttons are present',()=>{assert.equal((html.match(/class="ro-metric"/g)||[]).length,4);assert.equal((html.match(/aria-describedby="[^"]+-definition-/g)||[]).length,4);});
check('Both charts expose real table alternatives and daily and status record links',()=>{assert(html.includes('جدول بديل للرسم اليومي'));assert(html.includes('جدول بديل لحالات الطلبات'));assert(html.includes('class="ro-mini-table"'));assert(html.includes('role="button" tabindex="0"'));});
check('Data source and individual counting definitions are inspectable',()=>{assert(html.includes('مصدر البيانات وطريقة حساب المؤشرات'));assert(html.includes('بتوقيت القاهرة'));assert(html.includes('ليست تقييمًا للأداء'));});
check('Independent export selection and explicit same-display option are available',()=>{assert(html.includes('أعمدة تصدير هذا الملخص'));assert(html.includes('نفس أعمدة العرض'));assert(html.includes('ليس الصفحة الحالية فقط'));assert(html.includes('تصدير CSV المفلتر'));});
check('Existing GridTable column order and filters remain available',()=>{assert(html.includes('فلترة أي عمود'));assert(html.includes('تقديم عمود'));assert(html.includes('تأخير عمود'));assert(html.includes('استعادة العرض الافتراضي'));});
check('Project filtering applies to the cards, chart and backing records together',()=>{const scoped=render(s,true,true,{project:'project-one'});assert(scoped.includes('REQ-OVERVIEW-ONE'));assert(!scoped.includes('REQ-OVERVIEW-TWO'));});
check('Preview labelling is opt-in and English layout retains clear controls',()=>{assert(html.includes('معاينة للمراجعة'));const live=render(s,false,false);assert(!live.includes('Review preview'));assert(live.includes('dir="ltr"'));assert(live.includes('Hide details'));assert(live.includes('Operations overview'));});
check('No data or operational status is changed while rendering',()=>{assert.equal(JSON.stringify(s),before);assert(!html.includes('create_request'));assert(!html.includes('tracking_start'));});
check('Invalid date ranges show an alert and unavailable measures without falling back to broader data',()=>{const invalid=render(s,true,true,{from:'2026-10-31',to:'2026-10-01'});assert(invalid.includes('role="alert"'));assert(invalid.includes('لم يُستخدم نطاق بديل'));assert(invalid.includes('غير متاح'));assert(!invalid.includes('REQ-OVERVIEW-ONE'));assert(!invalid.includes('REQ-OVERVIEW-TWO'));});
check('Impossible calendar dates are handled without blanking the application',()=>{const invalid=render(s,false,true,{from:'2026-02-30',to:'2026-10-31'});assert(invalid.includes('role="alert"'));assert(invalid.includes('Unavailable'));assert(!invalid.includes('REQ-OVERVIEW-ONE'));});
check('Cairo date-only column filters include the previous UTC evening and preserve original export timestamps',()=>{
 const original=[{id:'midnight',code:'MIDNIGHT',at:'2026-10-18T21:05:00Z',status:'draft',address:'Preserved address'},{id:'previous',code:'PREVIOUS',at:'2026-10-18T20:50:00Z',status:'approved'},{id:'invalid',code:'INVALID',at:'2026-02-30T08:00:00Z',name:'Preserved name'}];
 const before=JSON.stringify(original),values=overviewTableValues(original),filtered=filterColumns(values,{at:{op:'range',min:'2026-10-19',max:'2026-10-19'}},['at']);
 assert.deepEqual(filtered.map(row=>row.id),['midnight']);assert.equal(values[0].at,'2026-10-19');assert.equal(values[0].atRaw,'2026-10-18T21:05:00Z');assert.equal(values[0].address,'Preserved address');assert.equal(values[2].at,'');assert.equal(values[2].name,'Preserved name');assert.equal(JSON.stringify(original),before);
 const exported=new TextDecoder().decode(csvBytes(['Metric date'],filtered.map(row=>[row.atRaw])));assert(exported.includes('2026-10-18T21:05:00Z'));assert(!exported.includes('2026-10-19'));
});
check('Live export has no preview badge and requires the fresh authenticated snapshot callback',()=>{
 const unavailable=render(s,false,false),enabled=render(s,false,false,{},async()=>s);
 assert(unavailable.includes('Export access for this overview could not be verified'));
 assert.match(unavailable,/<button[^>]*disabled=""[^>]*>[^<]*<svg[\s\S]*?Export filtered CSV/);
 assert(!enabled.includes('Export access for this overview could not be verified'));
 assert(!enabled.includes('Review preview'));
 assert.match(enabled,/<button[^>]*aria-busy="false"[^>]*>[\s\S]*?Export filtered CSV/);
});
check('Fresh export applies chart selection and every column filter across all rows without changing source data',()=>{
 const fresh=emptyState();fresh.projects=s.projects;
 fresh.requests=Array.from({length:42},(_,i)=>({id:'fresh-'+i,code:'FRESH-'+i,projectId:i<35?'project-one':'project-two',status:i%2?'approved':'draft',createdAt:'2026-10-19T08:00:00Z',destination:'Fresh location'}));
 const before=JSON.stringify(fresh),selection={metric:'requests' as const,day:'2026-10-19',status:'',tableFilters:{status:{op:'equals' as const,value:'approved'}}};
 const rows=overviewExportRows(fresh,{...filters,project:'project-one'},selection);
 assert.equal(rows.length,17);assert(rows.every(row=>row.code.startsWith('FRESH-')&&row.status==='approved'));
 assert.equal(JSON.stringify(fresh),before);
 const noDay=overviewExportRows(fresh,{...filters,project:'project-one'},{...selection,day:'2026-10-20'});assert.equal(noDay.length,0);
 const statusRows=overviewExportRows(fresh,filters,{...selection,day:'',status:'draft',tableFilters:{}});assert.equal(statusRows.length,21);
});
check('Invalid fresh export filters, unsupported columns and unavailable measures fail closed',()=>{
 const selection={metric:'requests' as const,day:'',status:'',tableFilters:{}};
 assert.throws(()=>overviewExportRows(s,{...filters,from:'2026-10-31',to:'2026-10-01'},selection),/range/);
 assert.throws(()=>overviewExportRows(s,filters,{...selection,tableFilters:{secret:{op:'contains',value:'x'}}}),/Restricted filter column/);
 assert.throws(()=>overviewExportRows(s,filters,{...selection,tableFilters:{at:{op:'range',min:'2026-02-30'}}}),/Invalid range bound/);
 assert.throws(()=>overviewExportRows({} as State,filters,selection),/incomplete/);
 assert.throws(()=>overviewExportRows(s,filters,{...selection,metric:'tasks',day:'2026-10-19'}),/does not match/);
 assert.throws(()=>overviewExportRows(s,filters,{...selection,day:'2026-02-30'}),/Invalid chart date/);
});
async function checkAsync(name:string,run:()=>Promise<void>){await run();console.log('PASS',name);checks++;}
async function verifyFreshExports(){
 const selection={metric:'requests' as const,day:'',status:'',tableFilters:{}};
 await checkAsync('Live export loads fresh scoped records and never falls back to cached records',async()=>{
  const fresh=emptyState();fresh.projects=s.projects;fresh.requests=[{...s.requests[0],id:'new-request',code:'FRESH-AUTHORIZED'}];
  let calls=0;const rows=await loadOverviewExportRows({state:s,preview:false,loadExportState:async()=>{calls++;return fresh;},filters,selection});
  assert.equal(calls,1);assert.deepEqual(rows.map(row=>row.code),['FRESH-AUTHORIZED']);
  await assert.rejects(()=>loadOverviewExportRows({state:s,preview:false,filters,selection}),/could not be verified/);
  await assert.rejects(()=>loadOverviewExportRows({state:s,preview:false,loadExportState:async()=>{throw new Error('Access denied');},filters,selection}),/Access denied/);
 });
 await checkAsync('Fresh permission narrowing retains the chosen project and can return no rows',async()=>{
  const fresh=emptyState();fresh.projects=[s.projects[1]];fresh.requests=[s.requests[1]];
  const rows=await loadOverviewExportRows({state:s,preview:false,loadExportState:async()=>fresh,filters:{...filters,project:'project-one'},selection});
  assert.equal(rows.length,0);
 });
 await checkAsync('Offline review remains local and does not call the live loader',async()=>{
  let called=false;const rows=await loadOverviewExportRows({state:s,preview:true,loadExportState:async()=>{called=true;throw new Error('Must not load live state');},filters,selection});
  assert.equal(called,false);assert.equal(rows.length,2);
 });
 console.log(`${checks} report overview UI and fresh-export checks passed`);
}
verifyFreshExports().catch(error=>{console.error(error);process.exitCode=1;});
