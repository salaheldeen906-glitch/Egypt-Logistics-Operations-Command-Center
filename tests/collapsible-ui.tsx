import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {useState,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CollapsiblePanel} from '../app/collapsible-panel';
import {CommandCenter,InventorySummary} from '../app/enhancements';
import {EgyptDashboard} from '../app/egypt-dashboard';
import {TableScope} from '../app/grid-table';
import {emptyState,type State} from '../lib/model';
import {cairoDay} from '../lib/insights';

const {PilotPanels}=require('virtual:pilot-collapsible-panels') as {PilotPanels:(props:{s:State;ar:boolean;project?:string;warehouse?:string;from?:string;to?:string})=>ReactNode};
let pass=0;
function check(name:string,run:()=>void){run();pass++;console.log('PASS',name);}
const noop=()=>{};
function fixture(){
 const s=emptyState();
 s.projects=[{id:'collapse-project',code:'CP',name:'مشروع الاختبار / Test project'}];
 s.warehouses=[{id:'collapse-warehouse',code:'CW',name:'مخزن القاهرة / Cairo warehouse'}];
 s.units=[{id:'collapse-unit',code:'BOX',name:'صندوق / Box'}];
 s.products=[{id:'collapse-product',code:'COLLAPSE-PRODUCT',name:'منتج الاختبار / Test product',projectId:s.projects[0].id,unitId:s.units[0].id,tracked:true,expiry:true}];
 s.batches=[{id:'collapse-batch',code:'BATCH-2030',name:'BATCH-2030',productId:s.products[0].id,expiryDate:'2030-03-01'}];
 s.requests=[{id:'collapse-request',code:'REQ-COLLAPSE-ONE',projectId:s.projects[0].id,status:'draft',createdAt:new Date().toISOString(),stageEnteredAt:new Date().toISOString(),dueDate:'2099-01-01',destination:'القاهرة — عنوان محفوظ / Cairo saved address',requestType:'delivery'}];
 s.lines=[{id:'collapse-line',code:'LINE',requestId:s.requests[0].id,productId:s.products[0].id,quantity:7}];
 s.movements=[{id:'collapse-movement',code:'MOVE-COLLAPSE',productId:s.products[0].id,warehouseId:s.warehouses[0].id,batchId:s.batches[0].id,delta:37,type:'receipt',postedAt:new Date().toISOString()}];
 s.routes=[{id:'collapse-route',code:'RT-COLLAPSE',name:'رحلة اليوم / Today route',date:cairoDay(),status:'planned'}];
 s.stops=[{id:'collapse-stop',code:'STOP',routeId:s.routes[0].id,requestId:s.requests[0].id,status:'planned',destination:s.requests[0].destination,sequence:1}];
 return s;
}
function panel(markup:string,id:string){
 const marker=`data-section-id="${id}"`,index=markup.indexOf(marker);assert(index>=0,`Missing section ${id}`);
 const start=markup.lastIndexOf('<section',index),tags=/<\/?section\b[^>]*>/g;tags.lastIndex=start;
 let depth=0;
 for(let tag=tags.exec(markup);tag;tag=tags.exec(markup)){depth+=tag[0].startsWith('</')?-1:1;if(!depth)return markup.slice(start,tags.lastIndex);}
 throw new Error('Unclosed section '+id);
}
function decoded(value:string){return value.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');}
function attr(tag:string,name:string){const value=tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];return value===undefined?undefined:decoded(value);}
function toggle(markup:string){const button=[...markup.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]).filter(tag=>attr(tag,'class')?.split(' ').includes('collapse-toggle'));assert.equal(button.length,1,'Each section has exactly one direct collapse control');return button[0];}
function verifyDisclosure(markup:string,title:string,ar:boolean,open=true){
 const button=toggle(markup),id=attr(button,'aria-controls');assert(id,'Button controls an explicit body id');
 assert.equal(attr(button,'type'),'button','Display preference cannot submit surrounding forms');
 assert.equal(attr(button,'aria-expanded'),String(open));
 assert.equal(attr(button,'aria-label'),`${title} — ${ar?(open?'إخفاء التفاصيل':'عرض التفاصيل'):(open?'Hide details':'Show details')}`);
 const body=[...markup.matchAll(/<div\b[^>]*>/g)].map(m=>m[0]).find(tag=>attr(tag,'id')===id);assert(body,'Control target exists in markup');
 assert.equal(/\bhidden(?:="")?(?=[\s>])/.test(body),!open,'Visibility agrees with accessible expanded state');
 assert([...markup.matchAll(/<h2\b[^>]*>([^<]*)<\/h2>/g)].some(m=>decoded(m[1])===title),'Visible section title stays a semantic heading');
 assert(!/<button\b[^>]*>[^]*?<button\b/.test(markup.slice(markup.indexOf(button),markup.indexOf('</button>',markup.indexOf(button))+9)),'Toggle cannot contain another action button');
}

let childRenders=0;
function StatefulChild(){childRenders++;const [quantity]=useState('37');return <label>Retained quantity<input name="quantity" defaultValue={quantity}/></label>;}
check('Existing sections are open by default and expose native accessible controls',()=>{
 const markup=renderToStaticMarkup(<CollapsiblePanel sectionId="fixture-open" title="Open fixture" ar={false}><StatefulChild/></CollapsiblePanel>);
 verifyDisclosure(markup,'Open fixture',false);assert(markup.includes('value="37"'));assert.equal(childRenders,1);
});
check('Default-closed sections still render stateful children inside the hidden body',()=>{
 const markup=renderToStaticMarkup(<CollapsiblePanel sectionId="fixture-closed" title="قسم مخفي" ar defaultOpen={false}><StatefulChild/></CollapsiblePanel>);
 verifyDisclosure(markup,'قسم مخفي',true,false);assert(markup.includes('name="quantity"'));assert(markup.includes('value="37"'));assert.equal(childRenders,2);
});
check('Custom headers keep headings, selectors and operational buttons outside the hidden body',()=>{
 const markup=renderToStaticMarkup(<CollapsiblePanel sectionId="fixture-header" title="Header fixture" ar={false} defaultOpen={false} header={<div className="section-heading extra-header"><h2>Header fixture</h2><select aria-label="Saved period" defaultValue="6"><option value="3">3</option><option value="6">6</option></select><button type="button" data-action="existing">Existing action</button></div>}><p>Hidden content</p></CollapsiblePanel>);
 verifyDisclosure(markup,'Header fixture',false,false);assert(markup.includes('section-heading extra-header collapse-heading'));
 assert(markup.includes('<option value="6" selected="">6</option>'));assert.equal((markup.match(/data-action="existing"/g)||[]).length,1);
 assert(markup.indexOf('Existing action')<markup.indexOf('class="collapse-body"'));assert(markup.indexOf('aria-label="Saved period"')<markup.indexOf('class="collapse-body"'));
});
check('Repeated reusable panels have unique control targets in the same rendered page',()=>{
 const markup=renderToStaticMarkup(<><CollapsiblePanel sectionId="one" title="One" ar={false}>One</CollapsiblePanel><CollapsiblePanel sectionId="two" title="Two" ar={false}>Two</CollapsiblePanel></>);
 const targets=[...markup.matchAll(/aria-controls="([^"]*)"/g)].map(m=>m[1]);assert.equal(targets.length,2);assert.equal(new Set(targets).size,2);
});

const expected:Record<string,[string,string]>={
 'dashboard-pipeline':['مراحل العمليات','Operations pipeline'],
 'dashboard-attention':['يحتاج تدخلك','Action center'],
 'dashboard-today-routes':['رحلات اليوم','Today’s routes'],
 'dashboard-project-health':['حالة المشاريع','Project health'],
 'dashboard-monthly':['حركة الطلبات الشهرية','Monthly request activity'],
 'dashboard-network':['شبكة التشغيل — مصر','Egypt operations network'],
 'dashboard-current-actions':['الخطوة الحالية للطلبات','Current request actions'],
 'dashboard-statuses':['حالات الطلبات — اضغط للفلترة','Request states — click to filter'],
 'dashboard-project-distribution':['توزيع الطلبات حسب المشروع','Requests by project'],
 'dashboard-customer-summary':['العملاء والتسليم والمرتجع','Customers, deliveries & returns'],
 'dashboard-requests':['الطلبات الحالية','Current requests'],
 'inventory-units':['الرصيد الحالي حسب وحدة القياس','Current stock by unit'],
 'inventory-balances':['رصيد المخزون','Stock ledger balance'],
 'inventory-movements':['الحركات المرحّلة','Posted movements'],
};
for(const ar of [true,false]){
 const s=fixture(),before=JSON.stringify(s),language=ar?'Arabic':'English';
 const markup=renderToStaticMarkup(<TableScope.Provider value="fixture-user:fixture-dataset"><CommandCenter s={s} rows={s.requests} ar={ar} onQueue={noop} onRequest={noop} onProject={noop}/><EgyptDashboard s={s} rows={s.requests} ar={ar} project="all" warehouse="all" onWarehouse={noop} onStatus={noop} onRequest={noop} onCustomer={noop} onPeriod={noop}/><InventorySummary s={s} project="all" warehouse="all" ar={ar}/><PilotPanels s={s} ar={ar}/></TableScope.Provider>);
 for(const [id,titles] of Object.entries(expected))check(`${language}: ${id} is labelled, open and connected to its own content`,()=>verifyDisclosure(panel(markup,id),titles[ar?0:1],ar));
 check(`${language}: data rows, filters, batch expiry and warehouse choices remain available`,()=>{
  const units=panel(markup,'inventory-units'),balances=panel(markup,'inventory-balances'),movements=panel(markup,'inventory-movements'),requests=panel(markup,'dashboard-requests');
  assert(units.includes('صندوق / Box'));assert(units.includes('<td>37</td>'));
  assert(balances.includes('COLLAPSE-PRODUCT'));assert(balances.includes('BATCH-2030'));assert(balances.includes('2030-03-01'));assert(balances.includes('مخزن القاهرة / Cairo warehouse'));
  assert(movements.includes('MOVE-COLLAPSE'));assert(requests.includes('REQ-COLLAPSE-ONE'));assert(requests.includes('Cairo saved address'));
  assert(balances.includes('فلترة أي عمود / Filter columns'));assert(movements.includes('استعادة العرض الافتراضي'));
  assert(panel(markup,'dashboard-network').includes('warehouse-node-list'));assert(panel(markup,'dashboard-network').includes('tabindex="0"'));
  assert(panel(markup,'dashboard-monthly').includes(`aria-label="${ar?'عدد الشهور':'Months'}"`));assert(panel(markup,'dashboard-monthly').includes('<option value="6" selected="">'));
  assert(panel(markup,'dashboard-statuses').includes('class="egypt-status-row"'));assert(panel(markup,'dashboard-project-distribution').includes('class="project-distribution-row"'));
 });
 check(`${language}: rendering changes no operational record or quantity`,()=>assert.equal(JSON.stringify(s),before));
}
check('Hidden bodies override open display and all toggle colors inherit site variables',()=>{
 const css=readFileSync('app/collapsible-panel.css','utf8');
 assert.match(css,/\.collapse-body\[hidden\]\s*\{\s*display:none!important/);assert(css.includes('var(--cc-text,var(--foreground))'));assert(css.includes('var(--cc-soft,var(--muted))'));
 assert(!/#[0-9a-f]{3,8}\b/i.test(css),'Shared disclosure styling cannot replace theme colors');
});
console.log(JSON.stringify({suite:'Collapsible panels SSR, accessible markup and real dashboard/inventory integration (not interactive browser QA)',pass,fail:0}));
