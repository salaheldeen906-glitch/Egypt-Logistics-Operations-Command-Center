'use client';
import {useContext,useEffect,useId,useMemo,useState} from 'react';
import {type Command,type Row,type State} from '@/lib/model';
import {EGYPT_GOVERNORATES,recordedGovernorate} from '@/lib/delivery-metadata';
import {createGeoFacts} from '@/lib/geo-value-report';
import {Button} from '@/components/ui/button';
import GridTable,{TableScope,type GridColumn} from './grid-table';
import {CollapsiblePanel} from './collapsible-panel';
import './customer-geography.css';

const unique=<T,>(values:T[])=>[...new Set(values)];
const regionName=(value:unknown)=>EGYPT_GOVERNORATES.find(([code])=>code===value)?.[1]||'';
/** Customer links are cheap to inspect: no delivery/value report is calculated here. */
function customerGeographyLinks(s:State,project:string){
 const requests=s.requests.filter(r=>project==='all'||r.projectId===project),requestIds=new Set(requests.map(r=>r.id)),requestOrder=new Map(requests.map((r,i)=>[r.id,i])),sites=s.customer_sites.filter(site=>site.active!==false&&(project==='all'||site.projectId===project)),linked=new Set<string>(),customerRequests=new Map<string,Set<string>>();
 const linkRequest=(customerId:string,requestId:string)=>{if(!customerId||!requestIds.has(requestId))return;linked.add(customerId);if(!customerRequests.has(customerId))customerRequests.set(customerId,new Set());customerRequests.get(customerId)!.add(requestId);};
 for(const request of requests)linkRequest(request.customerId,request.id);
 for(const row of [...s.delivery_needs,...s.tasks,...s.deliveries,...s.returns])linkRequest(row.customerId,row.requestId);
 for(const site of sites)if(site.customerId)linked.add(site.customerId);
 return {requests,requestOrder,linked,customerRequests,linkRequest};
}
/** Lightweight project membership for the master table and shared filter lists. */
export function customerGeographyIds(s:State,project='all'):Set<string>{
 if(project==='all')return new Set(s.customers.map(customer=>customer.id));
 const {linked}=customerGeographyLinks(s,project);
 return new Set(s.customers.filter(customer=>linked.has(customer.id)).map(customer=>customer.id));
}
/** Customer master records can be shared; project membership is proved by operational links or explicit sites. */
export function customerGeographyRows(s:State,project='all'):{customers:Row[];sites:Row[];facts:ReturnType<typeof createGeoFacts>}{
 const {requestOrder,linked,customerRequests,linkRequest}=customerGeographyLinks(s,project);
 const customers=s.customers.filter(c=>project==='all'||linked.has(c.id)),allowed=new Set(customers.map(c=>c.id));
 const visibleSites=s.customer_sites.filter(site=>site.active!==false&&allowed.has(site.customerId)&&(project==='all'||site.projectId===project||!site.projectId));
 const facts=createGeoFacts(s).filter(fact=>(project==='all'||fact.projectId===project)&&fact.customerId&&allowed.has(fact.customerId)),factGroups=new Map<string,ReturnType<typeof createGeoFacts>>(),siteCounts=new Map<string,number>(),customerNames=new Map(s.customers.map(c=>[c.id,c.name])),projectNames=new Map(s.projects.map(p=>[p.id,p.name]));
 for(const site of visibleSites)siteCounts.set(site.customerId,(siteCounts.get(site.customerId)||0)+1);
 for(const fact of facts){if(!factGroups.has(fact.customerId))factGroups.set(fact.customerId,[]);factGroups.get(fact.customerId)!.push(fact);linkRequest(fact.customerId,fact.requestId);}
 return {customers:customers.map(customer=>{
  const facts=factGroups.get(customer.id)||[],ids=[...(customerRequests.get(customer.id)||[])].sort((a,b)=>(requestOrder.get(a)||0)-(requestOrder.get(b)||0));
  const currencies=unique(facts.filter(f=>f.amountMinor!==null).map(f=>f.currency).filter(Boolean)),priced=facts.filter(f=>f.amountMinor!==null),missing=facts.length-priced.length;
  const currency=currencies.length===1?currencies[0]:null,netValue=currency?priced.filter(f=>f.currency===currency).reduce((n,f)=>n+f.sign*(f.amountMinor||0),0)/100:null;
  const units=new Map<string,{unit:string;delivered:number;returned:number}>();
  for(const f of facts){const key=f.unitId||f.unit;if(!units.has(key))units.set(key,{unit:f.unit||'غير متاح',delivered:0,returned:0});const q=units.get(key)!;if(f.eventType==='delivery')q.delivered+=f.quantity;else q.returned+=f.quantity;}
  return {...customer,requestCount:ids.length,siteCount:siteCounts.get(customer.id)||0,governorates:unique(facts.map(f=>regionName(f.governorate)).filter(Boolean)).join(' · ')||null,quantityDetails:[...units.values()].map(u=>u.unit+': مسلّم '+Number(u.delivered.toFixed(3))+'؛ مرتجع مقبول '+Number(u.returned.toFixed(3))).join(' | ')||null,netValue,currency,priceCoverage:facts.length?(missing?'جزئي · '+priced.length+' / '+facts.length:'مكتمل'):'لا توجد وقائع',missingPrice:missing,requestIds:ids};
 }),sites:visibleSites.map(site=>({...site,customer:customerNames.get(site.customerId)||site.customerId,project:projectNames.get(site.projectId)||null,governorateName:regionName(site.governorate)||null})),facts};
}

/** An explicitly linked original delivery, never matched from mutable branch text. */
export function customerSiteHistory(s:State,site:Row|undefined,project='all',projectedFacts?:ReturnType<typeof createGeoFacts>){
 if(!site)return null;
 const tasks=new Map(s.tasks.map(t=>[t.id,t])),needs=new Map(s.delivery_needs.map(n=>[n.id,n]));
 const facts=(projectedFacts||createGeoFacts(s)).filter(f=>{
  if(f.eventType!=='delivery'||f.customerId!==site.customerId||(project!=='all'&&f.projectId!==project))return false;
  const task=tasks.get(f.taskId),need=needs.get(f.needId||task?.needId);
  return (f.siteId||task?.siteId||need?.siteId)===site.id;
 });
 return facts.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))[0]||null;
}

type Props={s:State;ar:boolean;project?:string;run?:(c:Command)=>Promise<any>;canSave?:boolean;onOpenRequest?:(id:string)=>void;canExport?:boolean;loadExportState?:()=>Promise<State>};
export function CustomerGeography({s,ar,project='all',run,canSave=false,onOpenRequest}:Props){
 const l=(a:string,b:string)=>ar?a:b,scope=useContext(TableScope),editorId=useId(),[customerId,C]=useState('all'),[siteId,S]=useState(''),[editing,E]=useState<Row|null>(null),[busy,B]=useState(false),[error,X]=useState(''),[notice,N]=useState('');
 useEffect(()=>{C('all');S('');E(null);X('');N('');},[project,scope]);
 const projection=useMemo(()=>customerGeographyRows(s,project),[s,project]),customerIds=new Set(projection.customers.map(c=>c.id)),selected=customerId==='all'||customerIds.has(customerId)?customerId:'all',customers=projection.customers.filter(c=>selected==='all'||c.id===selected),sites=projection.sites.filter(site=>selected==='all'||site.customerId===selected);
 const activeSite=sites.find(site=>site.id===siteId)||sites[0],draft=editing?.id===activeSite?.id?editing:activeSite,editable=canSave&&!!run,history=useMemo(()=>customerSiteHistory(s,activeSite,project,projection.facts),[s,activeSite?.id,project,projection.facts]);
 const money=(value:unknown)=>typeof value==='number'?new Intl.NumberFormat(ar?'ar-EG':'en-GB',{maximumFractionDigits:2}).format(value):l('غير متاح','Not available');
 const chooseSite=(site:Row)=>{S(site.id);E(null);X('');N('');};
 const customerColumns:GridColumn[]=[{key:'code',label:l('كود العميل','Customer code')},{key:'name',label:l('العميل','Customer')},{key:'requestCount',label:l('الطلبات','Requests'),type:'number'},{key:'siteCount',label:l('الفروع المحفوظة','Saved sites'),type:'number'},{key:'governorates',label:l('محافظات التنفيذ المسجلة','Recorded delivery governorates')},{key:'quantityDetails',label:l('الكميات حسب الوحدة','Quantities by unit')},{key:'netValue',label:l('صافي القيمة المسعّرة','Priced net value'),type:'number',render:r=>money(r.netValue)},{key:'currency',label:l('العملة','Currency')},{key:'priceCoverage',label:l('اكتمال التسعير','Pricing coverage')},...(onOpenRequest?[{key:'__requests',label:l('الطلبات المرتبطة','Linked requests'),filterable:false,render:(r:Row)=><div className="inline-actions">{r.requestIds.map((id:string)=><Button key={id} variant="ghost" size="sm" onClick={()=>onOpenRequest(id)}>{s.requests.find(q=>q.id===id)?.code||id}</Button>)}</div>}]:[])];
 const siteColumns:GridColumn[]=[{key:'customer',label:l('العميل','Customer')},{key:'name',label:l('الفرع / الموقع','Branch / site')},{key:'project',label:l('المشروع','Project'),render:r=>r.project||l('عنوان مشترك','Shared address')},{key:'governorateName',label:l('المحافظة','Governorate')},{key:'address',label:l('العنوان','Address'),render:r=><span className="cg-address-text">{r.address}</span>},...(editable?[{key:'__edit',label:l('الإجراء','Action'),filterable:false,render:(r:Row)=><Button type="button" variant="outline" size="sm" onClick={()=>chooseSite(r)}>{l('تعديل الفرع','Edit site')}</Button>}]:[])];
 return <section className="customer-geography" dir={ar?'rtl':'ltr'}>
  <div className="cg-toolbar"><label>{l('العميل','Customer')}<select value={selected} onChange={e=>{C(e.target.value);S('');E(null);X('');N('');}}><option value="all">{l('كل العملاء في المشروع','All customers in project')}</option>{projection.customers.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label></div>
  <div className="cg-stats"><div className="cg-stat"><small>{l('العملاء','Customers')}</small><strong>{customers.length}</strong></div><div className="cg-stat"><small>{l('الفروع المحفوظة','Saved branches')}</small><strong>{sites.length}</strong></div><div className="cg-stat"><small>{l('محافظات الفروع المسجلة','Recorded branch governorates')}</small><strong>{unique(sites.map(site=>recordedGovernorate(site.governorate)).filter(Boolean)).length}</strong></div></div>
  <div className="cg-branch-grid">
   <form className="cg-editor panel" aria-labelledby={editorId} onSubmit={async e=>{
    e.preventDefault();if(!editable||!run||busy||!draft||!activeSite||draft.id!==activeSite.id)return;
    B(true);X('');N('');try{await run({type:'save_customer_site',id:activeSite.id,customerId:activeSite.customerId,projectId:activeSite.projectId||'',name:draft.name,address:draft.address,governorate:draft.governorate||null});E(null);N(l('حُفظ الفرع. الطلبات والتسليمات السابقة احتفظت ببياناتها.','Site saved. Earlier request and delivery snapshots are preserved.'));}catch(err:any){X(err.message||l('تعذر الحفظ','Could not save'));}finally{B(false);}
   }}>
    <h2 id={editorId}>{l('بيانات الفرع والمحافظة','Branch and governorate details')}</h2>
    <label>{l('الفرع','Branch')}<select value={activeSite?.id||''} disabled={busy||!sites.length} onChange={e=>{const site=sites.find(site=>site.id===e.target.value);if(site)chooseSite(site);}}>{!sites.length&&<option value="">{l('لا توجد فروع محفوظة','No saved branches')}</option>}{sites.map(site=><option key={site.id} value={site.id}>{site.customer} · {site.name}</option>)}</select></label>
    {draft?<>
     <label>{l('اسم الفرع','Branch name')}<input required maxLength={180} value={draft.name||''} disabled={busy||!editable} onChange={e=>E({...draft,name:e.target.value})}/></label>
     <label>{l('المحافظة','Governorate')}<select value={draft.governorate||''} disabled={busy||!editable} onChange={e=>E({...draft,governorate:e.target.value||null})}><option value="">{l('غير محدد','Not recorded')}</option>{EGYPT_GOVERNORATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
     <label className="cg-address">{l('العنوان','Address')}<textarea required maxLength={1000} disabled={busy||!editable} value={draft.address||''} onChange={e=>E({...draft,address:e.target.value})}/></label>
     {editable?<div className="inline-actions"><Button type="submit" disabled={busy}>{busy?l('جارٍ الحفظ…','Saving…'):l('حفظ الفرع','Save site')}</Button><Button type="button" variant="outline" disabled={busy||!editing} onClick={()=>{E(null);X('');}}>{l('إلغاء التعديل','Cancel changes')}</Button></div>:<p className="cg-note">{l('عرض فقط حسب صلاحيات حسابك.','Read-only with your current access.')}</p>}
     <p className="cg-note">{l('يؤثر الحفظ على عناوين الطلبات الجديدة. التسليم السابق يحتفظ بعنوانه ومحافظته وسعره المسجلين.','Saving updates new-request address suggestions. Previous deliveries retain their recorded address, governorate and price.')}</p>
    </>:<p className="cg-empty">{l('لا توجد فروع محفوظة ضمن النطاق المختار.','No saved branches in the selected scope.')}</p>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   </form>
   <div className="cg-saved-branches">
    <CollapsiblePanel sectionId="customers-sites" ar={ar} title={l('الفروع المحفوظة','Saved branches')}><GridTable tableId="customers:sites" rows={sites} columns={siteColumns}/>
     <section className="cg-history" aria-label={l('بيانات تسليم سابقة للفرع','Previous branch delivery snapshot')}>
      {history?<><h3>{l('واقعة تسليم محفوظة — ','Recorded delivery — ')}{history.code}</h3><p>{regionName(history.governorate)||l('محافظة غير محددة','Governorate not recorded')} · {l('سعر الوحدة: ','Unit price: ')}{money(history.priceMinor===null?null:history.priceMinor/100)}{history.priceMinor!==null?' '+history.currency+' / '+(history.unit||l('وحدة غير محددة','Unrecorded unit')):''}</p><p className="cg-address-text">{history.address||l('عنوان غير مسجل','Address not recorded')}</p><small>{history.project||l('مشروع غير مسجل','Project not recorded')} · {history.date||l('تاريخ غير مسجل','Date not recorded')}</small>{onOpenRequest&&<Button type="button" variant="ghost" size="sm" onClick={()=>onOpenRequest(history.requestId)}>{history.request||l('فتح الطلب','Open request')}</Button>}</>:<p>{l('لا توجد واقعة تسليم مرتبطة بهذا الفرع داخل المشروع المختار.','No delivery explicitly linked to this branch in the selected project.')}</p>}
     </section>
    </CollapsiblePanel>
   </div>
  </div>
  <CollapsiblePanel sectionId="customers-activity" ar={ar} title={l('تعاملات العملاء والكميات والقيمة','Customer activity, quantities and value')}><p className="cg-note">{l('الصافي من التسليمات والمرتجعات المقبولة المرتبطة، وليس مديونية العميل. الوحدات والعملات المختلفة تظل منفصلة، ونقص السعر يظهر كتغطية جزئية.','Net reflects deliveries and linked accepted returns, not customer debt. Units and currencies remain separate; missing prices show partial coverage.')}</p><GridTable tableId="customers:activity" rows={customers} columns={customerColumns}/></CollapsiblePanel>
 </section>;
}
