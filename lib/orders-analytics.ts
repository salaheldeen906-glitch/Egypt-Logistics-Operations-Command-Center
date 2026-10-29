import {emptyState,kinds,demand,type Row,type State} from './model';
import {filterRequests,cairoDay,type Filters} from './insights';

export type OrderSelection={kind:'all'|'open'|'closed'|'overdue'|'status'|'day'|'product';value?:string};
export type OrderProduct={id:string;productId:string;code:string;name:string;unitId:string;unit:string;quantity:number;requestCount:number;requestIds:string[]};
export type OrdersAnalytics={requests:Row[];total:number|null;open:number|null;closed:number|null;overdue:number|null;customers:number|null;products:number|null;statuses:{status:string;count:number;requestIds:string[]}[];daily:{day:string;count:number;requestIds:string[]}[];topProducts:OrderProduct[];today:string;unknownDates:number;missingQuantityLines:number;warning:string};
const defaults:Filters={project:'all',warehouse:'all',from:'',to:'',query:'',queue:'all'};
function calendarDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function orderCreatedDay(value:unknown){if(typeof value!=='string'||!value.trim())return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return calendarDay(value)?value:'';if(/^\d{4}-\d{2}-\d{2}T/.test(value)&&!calendarDay(value.slice(0,10)))return '';return Number.isFinite(Date.parse(value))?cairoDay(value):'';}
const unique=(rows:Row[])=>{const ids=new Set<string>();return rows.filter(r=>r&&typeof r.id==='string'&&r.id&&!ids.has(r.id)&&!!ids.add(r.id));};
export function ordersAnalytics(input:Partial<State>,filters:Filters=defaults,now=Date.now()):OrdersAnalytics{
 const f={...defaults,...filters};
 demand(['project','warehouse','from','to','query','queue'].every(key=>typeof (f as any)[key]==='string'),'Invalid order analytics filters');
 demand(!f.from||calendarDay(f.from),'Invalid order analytics start date');demand(!f.to||calendarDay(f.to),'Invalid order analytics end date');demand(!f.from||!f.to||f.from<=f.to,'Invalid order analytics date range');
 const loaded=(key:keyof State)=>Array.isArray(input[key]),s=emptyState();for(const key of kinds)s[key]=unique(loaded(key)?input[key]!:[]);
 const today=cairoDay(now),contextualRequests=filterRequests(s,{...f,from:'',to:''},now),unknownDates=contextualRequests.filter(r=>!orderCreatedDay(r.createdAt)).length;
 // Existing filtering retains the application's warehouse/search/queue rules.
 // Unknown dates remain visible without a date range, and are excluded with one.
 s.requests=contextualRequests;if(f.from||f.to)s.requests=s.requests.filter(r=>!!orderCreatedDay(r.createdAt));
 const requests=filterRequests(s,f,now),requestIds=new Set(requests.map(r=>r.id));
 const statuses=new Map<string,{status:string;count:number;requestIds:string[]}>(),days=new Map<string,{day:string;count:number;requestIds:string[]}>();
 for(const r of requests){const status=typeof r.status==='string'&&r.status?r.status:'unknown',day=orderCreatedDay(r.createdAt);if(!statuses.has(status))statuses.set(status,{status,count:0,requestIds:[]});const value=statuses.get(status)!;value.count++;value.requestIds.push(r.id);if(day){if(!days.has(day))days.set(day,{day,count:0,requestIds:[]});const d=days.get(day)!;d.count++;d.requestIds.push(r.id);}}
 const productMap=new Map(s.products.map(p=>[p.id,p])),unitMap=new Map(s.units.map(u=>[u.id,u])),groups=new Map<string,OrderProduct>(),customerIds=new Set<string>(),validCustomers=new Set(s.customers.map(c=>c.id));let missingQuantityLines=0;
 for(const r of requests)if(r.customerId&&validCustomers.has(r.customerId))customerIds.add(r.customerId);
 for(const n of [...s.delivery_needs,...s.tasks])if(requestIds.has(n.requestId)&&n.customerId&&validCustomers.has(n.customerId))customerIds.add(n.customerId);
 for(const line of s.lines.filter(l=>requestIds.has(l.requestId))){const product=productMap.get(line.productId),unitId=String(line.unitId||product?.unitId||''),key=String(line.productId)+'\u0000'+unitId;const quantity=typeof line.quantity==='number'?line.quantity:typeof line.quantity==='string'&&line.quantity.trim()?Number(line.quantity):NaN;if(!Number.isFinite(quantity)||quantity<0){missingQuantityLines++;continue;}if(!groups.has(key))groups.set(key,{id:key,productId:line.productId,code:product?.code||line.productId||'',name:product?.name||'',unitId,unit:unitMap.get(unitId)?.name||'',quantity:0,requestCount:0,requestIds:[]});const group=groups.get(key)!;group.quantity=Math.round((group.quantity+quantity)*1000)/1000;if(!group.requestIds.includes(line.requestId))group.requestIds.push(line.requestId);group.requestCount=group.requestIds.length;}
 const closed=requests.filter(r=>r.status==='closed').length;
 return {requests,total:loaded('requests')?requests.length:null,open:loaded('requests')?requests.length-closed:null,closed:loaded('requests')?closed:null,overdue:loaded('requests')?requests.filter(r=>r.status!=='closed'&&calendarDay(r.dueDate||'')&&r.dueDate<today).length:null,customers:loaded('customers')?customerIds.size:null,products:loaded('lines')?new Set(s.lines.filter(line=>requestIds.has(line.requestId)&&line.productId).map(line=>line.productId)).size:null,statuses:[...statuses.values()],daily:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)),topProducts:[...groups.values()].sort((a,b)=>b.requestCount-a.requestCount||a.code.localeCompare(b.code)||a.unitId.localeCompare(b.unitId)),today,unknownDates,missingQuantityLines,warning:!loaded('requests')?'requests-unavailable':missingQuantityLines?'quantity-incomplete':''};
}
/** Each chart selection replaces the previous drill-down; counts cannot silently intersect. */
export function selectedOrderIds(report:OrdersAnalytics,selection:OrderSelection):string[]|null{
 if(selection.kind==='all')return null;
 if(selection.kind==='day')return report.daily.find(d=>d.day===selection.value)?.requestIds||[];
 if(selection.kind==='product')return report.topProducts.find(p=>p.id===selection.value)?.requestIds||[];
 if(selection.kind==='status')return report.statuses.find(s=>s.status===selection.value)?.requestIds||[];
 return report.requests.filter(r=>selection.kind==='closed'?r.status==='closed':selection.kind==='open'?r.status!=='closed':r.status!=='closed'&&calendarDay(r.dueDate||'')&&r.dueDate<report.today).map(r=>r.id);
}
