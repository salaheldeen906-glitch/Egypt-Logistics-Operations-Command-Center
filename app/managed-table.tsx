'use client';
import {Children,cloneElement,isValidElement,useContext,useEffect,useState,type ReactNode,type ReactElement} from 'react';
import {filterColumns,inferColumnType,type ColumnFilter} from '@/lib/report-filters';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {TableScope,tablePreference,type GridColumn} from './grid-table';
import {TableExportControl,plainCellValue,tableCellText,type TableExportData} from './table-export-context';
const element=(node:unknown):node is ReactElement<any>=>isValidElement(node);
const tag=(node:ReactElement<any>)=>String(node.type);
const props=(node:ReactNode):any=>(node as ReactElement<any>).props;
function labelOf(node:ReactNode):string {return Children.toArray(node).map(n=>typeof n==='string'||typeof n==='number'?String(n):element(n)?labelOf(props(n).children):'').join(' ');}
export function managedTableExportData(children:ReactElement<any>,visible:GridColumn[],filters:Record<string,ColumnFilter>):TableExportData{
 const sections=Children.toArray(children.props.children),fields=visible.filter(c=>!/الإجراء|الإجراءات|Action|اختيار|Select/i.test(c.label));
 const records=sections.filter(n=>element(n)&&tag(n)==='tbody').flatMap(n=>Children.toArray(props(n).children)).filter(n=>element(n)&&tag(n)==='tr').map(node=>{
  const cells=Children.toArray(props(node).children);
  if(cells.length===1&&element(cells[0])&&props(cells[0]).colSpan)return null;
  const raw=Object.fromEntries(cells.map((cell,i)=>['column-'+i,element(cell)?labelOf(props(cell).children):String(cell)]));
  if(!filterColumns([raw],filters,Object.keys(raw)).length)return null;
  return fields.map(c=>{
   const cell=cells[Number(c.key.slice(7))],value=element(cell)?props(cell).children:cell;
   if(value===null||value===undefined)return null;
   if(['number','boolean','string'].includes(typeof value))return plainCellValue(value);
   return tableCellText(value)||null;
  });
 }).filter((r):r is unknown[]=>r!==null);
 return {headers:fields.map(c=>c.label),rows:records};
}
export function ManagedTable({children,tableId,requiredIndices=[]}:{children:ReactElement<any>;tableId:string;requiredIndices?:number[]}){
 const sections=Children.toArray(children.props.children),header=sections.find(n=>element(n)&&tag(n)==='thead') as ReactElement<any>|undefined,headerRow=Children.toArray(header?.props.children).find(n=>element(n)&&tag(n)==='tr') as ReactElement<any>|undefined,cells=Children.toArray(headerRow?.props.children);
 const columns:GridColumn[]=cells.map((cell,i)=>({key:'column-'+i,label:element(cell)?labelOf(props(cell).children):String(i+1),required:requiredIndices.includes(i)}));
 const scope=useContext(TableScope),storage='daf-table-v1:'+scope+':'+tableId,schema=columns.map(c=>c.key).join('|'),[prefs,setPrefs]=useState(()=>tablePreference(columns,null)),[loaded,setLoaded]=useState(''),[filters,setFilters]=useState<Record<string,ColumnFilter>>({});
 useEffect(()=>{let saved=null;try{saved=JSON.parse(localStorage.getItem(storage)||'null');}catch{}setPrefs(tablePreference(columns,saved));setLoaded(storage);},[storage,schema]);
 useEffect(()=>{if(loaded!==storage)return;try{localStorage.setItem(storage,JSON.stringify(prefs));}catch{}},[storage,loaded,prefs]);
 const effective=tablePreference(columns,loaded===storage?prefs:null),ordered=effective.order.map(key=>columns.find(c=>c.key===key)!),visible=ordered.filter(c=>!effective.hidden.includes(c.key));
 const move=(key:string,delta:number)=>setPrefs(p=>{const order=tablePreference(columns,p).order,i=order.indexOf(key),j=i+delta;if(j<0||j>=order.length)return p;[order[i],order[j]]=[order[j],order[i]];return {...p,order};});
 let filterError='';
 const cellValues=(key:string)=>sections.filter(n=>element(n)&&tag(n)==='tbody').flatMap(n=>Children.toArray(props(n).children)).filter(n=>element(n)&&tag(n)==='tr').map(n=>{const cell=Children.toArray(props(n).children)[Number(key.slice(7))];return element(cell)?labelOf(props(cell).children):'';});
 const rows=(nodes:ReactNode,apply=false)=>Children.map(nodes,node=>{if(!element(node)||tag(node)!=='tr')return node;const list=Children.toArray(props(node).children);if(list.length===1&&element(list[0])&&props(list[0]).colSpan)return cloneElement(node,{},cloneElement(list[0] as ReactElement<any>,{colSpan:Math.max(1,visible.length)}));if(list.length!==columns.length)return node;if(apply){const values=Object.fromEntries(list.map((c,i)=>['column-'+i,element(c)?labelOf(props(c).children):String(c)]));try{if(!filterColumns([values],filters,columns.map(c=>c.key)).length)return null;}catch(e){filterError=e instanceof Error?e.message:'Invalid filter';}}return cloneElement(node,{},visible.map(c=>list[Number(c.key.slice(7))]));});
 const table=cloneElement(children,{},Children.map(children.props.children,section=>element(section)&&['thead','tbody','tfoot'].includes(tag(section))?cloneElement(section,{},rows(section.props.children,tag(section)==='tbody')):section));
 return <><TableExportControl tableId={tableId} scope={scope} prepare={()=>managedTableExportData(children,visible,filters)} disabled={!!filterError}/><details className="column-picker"><summary>فلترة الأعمدة / Filter columns</summary><div className="filter-grid">{columns.map(c=><label key={c.key}>{c.label}<select aria-label={c.label+" نوع الفلتر"} value={filters[c.key]?.op||'contains'} onChange={e=>setFilters({...filters,[c.key]:{...filters[c.key],op:e.target.value as ColumnFilter['op']}})}><option value="contains">يحتوي / Contains</option><option value="equals">يساوي / Equals</option><option value="range">نطاق / Range</option><option value="empty">فارغ / Empty</option></select>{filters[c.key]?.op==='range'?<><input aria-label={c.label+" من"} type={inferColumnType(cellValues(c.key))==='date'?'date':'number'} step="any" placeholder="من / From" value={filters[c.key]?.min||''} onChange={e=>setFilters({...filters,[c.key]:{...filters[c.key],op:'range',min:e.target.value}})}/><input aria-label={c.label+" إلى"} type={inferColumnType(cellValues(c.key))==='date'?'date':'number'} step="any" placeholder="إلى / To" value={filters[c.key]?.max||''} onChange={e=>setFilters({...filters,[c.key]:{...filters[c.key],op:'range',max:e.target.value}})}/></>:filters[c.key]?.op!=='empty'&&<input aria-label={c.label+" فلتر"} list={storage+c.key+"options"} placeholder="قيمة / Value" value={filters[c.key]?.value||''} onChange={e=>{const next={...filters};if(e.target.value)next[c.key]={op:filters[c.key]?.op||'contains',value:e.target.value};else delete next[c.key];setFilters(next);}}/>}<datalist id={storage+c.key+"options"}>{[...new Set(cellValues(c.key))].slice(0,100).map(v=><option key={v} value={v}/>)}</datalist></label>)}</div><Button type="button" onClick={()=>setFilters({})}>مسح الفلاتر / Clear filters</Button></details><details className="column-picker"><summary>الأعمدة / Columns</summary><p>اختياراتك محفوظة؛ إخفاء الأعمدة لا يحذف البيانات أو يغيّر شروط التنفيذ.</p><div>{ordered.map((c,i)=><div className="column-option" key={c.key}><label><Checkbox checked={!effective.hidden.includes(c.key)} disabled={c.required} onCheckedChange={checked=>setPrefs(p=>({...tablePreference(columns,p),hidden:checked?effective.hidden.filter(k=>k!==c.key):[...effective.hidden,c.key]}))}/>{c.label}{c.required&&<small> · أساسي / Required</small>}</label><Button type="button" variant="ghost" size="sm" aria-label={'تقديم عمود / Move earlier: '+c.label} disabled={i===0} onClick={()=>move(c.key,-1)}>↑</Button><Button type="button" variant="ghost" size="sm" aria-label={'تأخير عمود / Move later: '+c.label} disabled={i===ordered.length-1} onClick={()=>move(c.key,1)}>↓</Button></div>)}</div><Button type="button" variant="outline" size="sm" onClick={()=>setPrefs(tablePreference(columns,null))}>استعادة العرض الافتراضي / Reset columns</Button></details>{filterError&&<p role="alert" className="error">{filterError}</p>}{!visible.length&&<p role="status">كل الأعمدة مخفية؛ اختر أعمدة أو استعد العرض الافتراضي.</p>}{table}</>;
}
