import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import Pilot from '@/app/pilot';
import {reportsSampleMemoryStorage} from '@/lib/reports-sample-transport';
import {createQuantityReview} from './quantity-review-fixture';
import {quantityReviewTransport} from './quantity-review-transport';

if(typeof window.crypto.randomUUID!=='function')Object.defineProperty(window.crypto,'randomUUID',{value:()=>{const bytes=window.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-') as ReturnType<Crypto['randomUUID']>;}});
try{
 const fixture=createQuantityReview(),sample=quantityReviewTransport(fixture.state,fixture.actors,window.location.origin==='null'?'https://isolated-review.invalid':window.location.origin),storage=reportsSampleMemoryStorage();
 Object.defineProperty(window,'localStorage',{value:storage,configurable:true});Object.defineProperty(window,'sessionStorage',{value:reportsSampleMemoryStorage(),configurable:true});window.fetch=sample.fetch;
 storage.setItem('daf-language','ar');storage.setItem('daf-command-theme','dark');
 let role='courier',selected=fixture.shortcuts.receive,revision=0;const root=createRoot(document.getElementById('root')!);
 const render=(view=2,nextRole=role)=>{
  // Complete prior Pilot effects and dialog cleanup before changing actor or stored navigation.
  // Otherwise an old persistence effect can overwrite the next scenario's position.
  flushSync(()=>root.render(null));role=nextRole;sample.setActor(role);
  const actor=sample.getActor();roleSelect.value=role;
  storage.setItem('daf-command-position-'+actor.userId+':'+sample.datasetId,JSON.stringify({view,selected,project:'all',from:'',to:'',reportTab:'reports',reportArea:'basic',masterKind:'projects'}));
  const current=document.getElementById('review-current-role');if(current)current.textContent=actor.name;
  flushSync(()=>root.render(<Pilot key={++revision} commandCenter/>));
 };
 const roleElement=document.getElementById('review-role');if(!roleElement||roleElement.tagName!=='SELECT')throw new Error('قائمة حساب التجربة غير موجودة');
 // Worker HTML-rewriter globals also declare HTMLSelectElement; use the validated DOM shape.
 const roleSelect=roleElement as HTMLElement&{value:string};
 roleSelect.addEventListener('change',()=>render(2,roleSelect.value));
 document.querySelectorAll<HTMLButtonElement>('[data-review-scenario]').forEach(button=>button.addEventListener('click',()=>{const scenario=button.dataset.reviewScenario as keyof typeof fixture.shortcuts;selected=fixture.shortcuts[scenario];render(2,scenario==='receive'?'courier':scenario==='shortage'?'project_manager':'dispatcher');}));
 document.getElementById('review-reports')?.addEventListener('click',()=>{selected='';render(6,'dispatcher');});
 document.getElementById('review-reset')?.addEventListener('click',()=>window.location.reload());
 document.getElementById('review-json')?.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({synthetic:true,liveData:false,purpose:'ISOLATED BROWSER MEMORY REVIEW — NOT A LIVE BACKUP',state:sample.getState()},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='DAF_Quantity_Review_SYNTHETIC.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 const stopNavigation=(event:MouseEvent)=>{const link=(event.target as Element)?.closest?.('a');if(!link)return;if(link.href.startsWith('blob:'))return;const original=link.dataset.reviewOriginalHref||link.getAttribute('href')||'';if(original.startsWith('/api/file')){const url=new URL(original,'https://isolated-review.invalid'),file=sample.getFileUrl(url.searchParams.get('id')||'');if(file){link.href=file;return;}}event.preventDefault();event.stopImmediatePropagation();const notice=document.getElementById('review-notice');if(notice)notice.textContent='كل الروابط والخدمات الخارجية معطّلة في المعاينة؛ التغييرات والملفات داخل ذاكرة هذه الصفحة فقط.';};
 document.addEventListener('click',stopNavigation,true);document.addEventListener('auxclick',stopNavigation,true);
 const sanitize=()=>document.querySelectorAll<HTMLAnchorElement>('#root a[href]').forEach(link=>{if(!link.href.startsWith('blob:')&&link.getAttribute('href')!=='#'){link.dataset.reviewOriginalHref=link.getAttribute('href')||'';link.href='#';link.removeAttribute('target');}});new MutationObserver(sanitize).observe(document.getElementById('root')!,{childList:true,subtree:true,attributes:true,attributeFilter:['href','target']});
 render();
}catch(error:any){const target=document.getElementById('root');if(target){target.setAttribute('role','alert');target.textContent='تعذر بدء المعاينة المعزولة: '+(error?.message||String(error));}}
