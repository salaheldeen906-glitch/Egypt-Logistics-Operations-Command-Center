'use client';
import {Children,createContext,isValidElement,useContext,useRef,useState,type ReactNode,type ReactElement} from 'react';
import {Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {xlsxBytes} from '@/lib/tabular-export';

export type TableExportAuthority={allowed:boolean;allowedFor?:(tableId:string)=>boolean;authorize?:(tableId:string)=>Promise<void>;ar:boolean};
export const TableExportContext=createContext<TableExportAuthority>({allowed:false,ar:true});
export type TableExportData={headers:string[];rows:unknown[][]};
export function plainCellValue(value:unknown):unknown{
 if(value===null||value===undefined)return null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string'||typeof value==='boolean'||value instanceof Date)return value;
 return null;
}
/** Controls and inputs are not data. This is only a last-resort display-label extractor. */
export function tableCellText(node:ReactNode):string{
 return Children.toArray(node).map(child=>{
  if(typeof child==='string'||typeof child==='number')return String(child);
  if(!isValidElement(child))return '';
  const el=child as ReactElement<any>,p=el.props;
  if(['button','input','select','textarea'].includes(String(el.type))||p.onClick||p.role==='button')return '';
  return tableCellText(p.children);
 }).filter(Boolean).join(' ');
}
export function TableExportControl({tableId,scope,prepare,disabled=false}:{tableId:string;scope:string;prepare:()=>TableExportData;disabled?:boolean}){
 const authority=useContext(TableExportContext),latest=useRef({authority,scope,prepare});latest.current={authority,scope,prepare};
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');const inFlight=useRef(false);
 const exportExcel=async()=>{
  if(inFlight.current)return;
  const current=latest.current,expectedScope=current.scope;
  if(!current.authority.allowed||current.authority.allowedFor?.(tableId)===false||!current.authority.authorize)return;
  inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{
   await current.authority.authorize(tableId);
   if(!latest.current.authority.allowed||latest.current.authority.allowedFor?.(tableId)===false||latest.current.scope!==expectedScope)throw Error(authority.ar?'تغيّر الحساب أو الصلاحية؛ أعد فتح التقرير.':'Account or access changed; reopen the report.');
   const data=latest.current.prepare();
   if(!data.headers.length)throw Error(authority.ar?'اختر عمودًا واحدًا على الأقل للتصدير.':'Choose at least one export column.');
   const bytes=xlsxBytes(data.headers,data.rows),url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const anchor=document.createElement('a');anchor.href=url;anchor.download='DAF_'+tableId.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice((authority.ar?'تم تجهيز Excel: ':'Excel prepared: ')+data.rows.length+(authority.ar?' صف من جميع النتائج المفلترة.':' rows across all filtered results.'));
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{inFlight.current=false;setBusy(false);}
 };
 if(!authority.allowed||authority.allowedFor?.(tableId)===false)return null;
 return <div className="table-excel-control"><Button type="button" variant="outline" size="sm" disabled={disabled||busy||!authority.authorize} aria-busy={busy} aria-label={authority.ar?'تصدير الجدول إلى Excel':'Export table to Excel'} onClick={()=>void exportExcel()}><Download size={16} aria-hidden="true"/>{busy?(authority.ar?'تجهيز…':'Preparing…'):'Excel'}</Button>{notice&&<span role="status">{notice}</span>}{error&&<span role="alert" className="error">{error}</span>}</div>;
}
