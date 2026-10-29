'use client';

import {cloneElement,useContext,useEffect,useId,useState,type ReactElement,type ReactNode} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {TableScope} from './grid-table';
import './collapsible-panel.css';

/** Display preferences only; children remain mounted while the section is hidden. */
export function CollapsiblePanel({sectionId,title,ar,children,header,className='panel',defaultOpen=true}:{
 sectionId:string;title:string;ar:boolean;children:ReactNode;
 header?:ReactElement<{className?:string;children?:ReactNode}>;
 className?:string;defaultOpen?:boolean;
}){
 const scope=useContext(TableScope),key='daf-section-v1:'+scope+':'+sectionId,id=useId();
 const [saved,setSaved]=useState({key:'',open:defaultOpen});
 useEffect(()=>{
  let open=defaultOpen;
  try{const value=JSON.parse(localStorage.getItem(key)||'null');if(typeof value==='boolean')open=value;}catch{}
  setSaved({key,open});
 },[key,defaultOpen]);
 const open=saved.key===key?saved.open:defaultOpen;
 const toggle=()=>{
  const next=!open;setSaved({key,open:next});
  try{localStorage.setItem(key,JSON.stringify(next));}catch{}
 };
 const action=ar?(open?'إخفاء التفاصيل':'عرض التفاصيل'):(open?'Hide details':'Show details');
 const button=<button key="section-toggle" type="button" className="collapse-toggle" aria-label={title+' — '+action} aria-expanded={open} aria-controls={id} onClick={toggle}>
  {open?<ChevronUp size={22} aria-hidden="true"/>:<ChevronDown size={22} aria-hidden="true"/>}
 </button>;
 return <section className={className+' collapsible-panel'} data-section-id={sectionId} data-section-collapsed={open?'false':'true'}>
  {header?cloneElement(header,{className:(header.props.className||'section-heading')+' collapse-heading'},header.props.children,button):<div className="section-heading collapse-heading"><h2>{title}</h2>{button}</div>}
  <div id={id} className="collapse-body" hidden={!open}>{children}</div>
 </section>;
}
