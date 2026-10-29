'use client';
import {useState,useEffect,useContext} from 'react';
import {type Row,type State,statusAr} from '@/lib/model';
import {nextAction} from '@/lib/insights';
import {requestFlow,responsible,instruction,typeLabel} from '@/lib/workflow';
import {DraftScope} from './use-task-draft';
export function WorkflowGuide({s,r,ar,can,onReview}:{s:State;r:Row;ar:boolean;can:(type:string)=>boolean;onReview?:(step:string)=>void}) {
 const scope=useContext(DraftScope),key='daf-review-step:'+scope+':'+r.id,[viewed,setViewed]=useState('');
 useEffect(()=>{try{setViewed(localStorage.getItem(key)||'');}catch{}},[key]);
 const n=nextAction(s,r),steps=requestFlow(r),index=steps.indexOf(r.status),selected=viewed&&steps.indexOf(viewed)>=0&&steps.indexOf(viewed)<=index?viewed:r.status,selectedIndex=steps.indexOf(selected),mine=!!n.action&&can(n.action==='loading_mismatch'?'review_loading_difference':n.action)&&(n.action!=='op_plan'||can('assign_task'));
 const view=(step:string)=>{setViewed(step);try{localStorage.setItem(key,step);}catch{}};
 return <section className="workflow-guide" aria-label={ar?'خطوات الطلب':'Request steps'}>
 <div className="guide-heading"><b>{typeLabel(r,ar)}</b><span>{ar?'الخطوة الحالية':'Current step'} {index+1} / {steps.length}</span></div>
 <ol className="step-track">{steps.map((step,i)=><li key={step} aria-current={step===r.status?'step':undefined} className={i<index?'done':i===index?'current':''}><button type="button" disabled={i>index} onClick={()=>{view(step);if(i<index)onReview?.(step);}} aria-pressed={selected===step}><span>{i<index?'✓':i+1}</span>{ar?statusAr[step]||step:step.replaceAll('_',' ')}</button></li>)}</ol>
 <div className="inline-actions"><button type="button" className="text-link" disabled={selectedIndex<=0} onClick={()=>view(steps[selectedIndex-1])}>{ar?'← راجع الخطوة السابقة':'Review previous step'}</button>{selected!==r.status&&<button type="button" className="text-link" onClick={()=>view(r.status)}>{ar?'ارجع للخطوة الحالية':'Return to current step'}</button>}</div>
 {selected!==r.status&&<div className="step-review"><b>{ar?'بتراجع: ':'Reviewing: '}{ar?statusAr[selected]||selected:selected}</b><p>{ar?'الرجوع للمراجعة لا يغيّر الرصيد المسجل. مدخلات النوافذ غير المؤكدة محفوظة وتقدر تكملها.':'Review does not reverse posted stock. Unconfirmed form drafts are saved and can be resumed.'}</p>{onReview&&<button type="button" className="text-link" onClick={()=>onReview(selected)}>{ar?'افتح المراجعة وخيارات التعديل حسب الصلاحية':'Open review and permitted change options'}</button>}{(r.timeline||[]).filter((h:any)=>h.to===selected).map((h:any,i:number)=><p key={i}>{h.actor} · {new Date(h.at).toLocaleString(ar?'ar-EG':'en-GB')}</p>)}</div>}
 <div className="guide-now" role="status"><strong>{ar?'أنت هنا: ':'You are here: '}{ar?statusAr[r.status]:r.status.replaceAll('_',' ')}</strong><span>{ar?'عند: ':'With: '}{responsible(n.action,ar)}</span></div>
 <p><b>{ar?'المطلوب الآن: ':'Next: '}</b>{ar?n.ar:n.en}</p><p>{instruction(n.action,ar)}</p>
 {n.action&&<p className={mine?'your-turn':'waiting-turn'}>{mine?(ar?'دورك الآن — نفّذ الخطوة الموضحة أدناه.':'Your turn — complete the step below.'):(ar?'متابعة فقط في هذه الخطوة — ننتظر '+responsible(n.action,true)+'.':'This step is assigned to '+responsible(n.action,false)+'.')}</p>}
 {n.blocked&&<p className="error">{n.blocked}</p>}
 </section>;
}
