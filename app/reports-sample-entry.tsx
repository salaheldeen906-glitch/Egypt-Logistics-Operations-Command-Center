import React from 'react';
import {createRoot} from 'react-dom/client';
import Pilot from './pilot';
import {createReportsSampleState,REPORTS_SAMPLE_MANIFEST} from '@/lib/reports-sample-data';
import {reportsSampleMemoryStorage,reportsSampleTransport} from '@/lib/reports-sample-transport';

// Loaded only by the static reports-sample.html entry, never by the live application.
// HTTP-local previews lack randomUUID, but still provide cryptographic random bytes.
if(typeof window.crypto.randomUUID!=='function')Object.defineProperty(window.crypto,'randomUUID',{value:()=>{
 const bytes=window.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-') as ReturnType<Crypto['randomUUID']>;
}});
const sample=reportsSampleTransport(createReportsSampleState(),window.location.origin);
const storage=reportsSampleMemoryStorage();
Object.defineProperty(window,'localStorage',{value:storage,configurable:true});
Object.defineProperty(window,'sessionStorage',{value:reportsSampleMemoryStorage(),configurable:true});
window.fetch=sample.fetch;
storage.setItem('daf-language','ar');
storage.setItem('daf-command-position-'+sample.actor.userId+':'+sample.datasetId,JSON.stringify({view:1,masterKind:'customers',customerArea:'geography',reportTab:'reports',reportArea:'analytics',project:'all',from:'2026-10-01',to:'2026-10-21'}));
// Native account / attachment links are not a route out of this synthetic adapter.
const stopNavigation=(event:MouseEvent)=>{
 const link=(event.target as Element)?.closest?.('a');if(!link)return;
 if(link.id==='sample-return-live'||link.href.startsWith('blob:'))return;
 event.preventDefault();event.stopImmediatePropagation();
 const notice=document.getElementById('sample-action-notice');if(notice)notice.textContent='الرابط غير متاح داخل التجربة. استخدم «العودة للنظام الفعلي» للخروج.';
};
document.addEventListener('click',stopNavigation,true);document.addEventListener('auxclick',stopNavigation,true);
// Also remove native sign-out / file URLs from context-menu and middle-click paths.
const sanitizeLinks=()=>document.querySelectorAll<HTMLAnchorElement>('#root a[href]').forEach(link=>{if(!link.href.startsWith('blob:')&&link.getAttribute('href')!=='#'){link.setAttribute('href','#');link.removeAttribute('target');}});
new MutationObserver(sanitizeLinks).observe(document.getElementById('root')!,{childList:true,subtree:true,attributes:true,attributeFilter:['href','target']});
document.getElementById('sample-download-json')?.addEventListener('click',()=>{
 const body=JSON.stringify({purpose:'SYNTHETIC ISOLATED DEMONSTRATION ONLY — NOT A LIVE DATABASE BACKUP',manifest:REPORTS_SAMPLE_MANIFEST,state:sample.getState()},null,2),url=URL.createObjectURL(new Blob([body],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='DAF_SYNTHETIC_800_Customers_2000_Products.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
createRoot(document.getElementById('root')!).render(<Pilot commandCenter/>);
