'use client';
import {createContext,useContext,useState,useEffect,useRef,useCallback,type ReactNode,type SetStateAction} from 'react';

type Transport={enabled:boolean;datasetId:string;userId?:string};
export const DraftTransport=createContext<Transport>({enabled:false,datasetId:'',userId:''});
export function CentralDraftProvider({enabled,datasetId,userId='',children}:{enabled:boolean;datasetId:string;userId?:string;children:ReactNode}){
 return <DraftTransport.Provider value={{enabled,datasetId,userId}}>{children}</DraftTransport.Provider>;
}
type DraftRecord<T>={
 value:T;initial:T;revision:number;saved:string;ready:boolean;identity:string;blocked:boolean;
 key:string;endpoint:string;central:boolean;datasetId:string;expectedUserId:string;requestId?:string;
 generation:number;queue:Promise<void>;retrying?:Promise<void>;
};
const conflictMessage='المسودة اتعدلت في جلسة أخرى؛ مدخلاتك باقية / Draft conflict; your input is preserved';
const saveMessage='تعذر حفظ المسودة؛ أعد المحاولة / Draft save failed; retry';
const localMessage='تعذر حفظ المسودة على هذا الجهاز؛ المدخلات باقية في الشاشة / Device draft storage is unavailable; your input remains on screen';
function restored<T>(initial:T,value:any):T{
 if(value===null||value===undefined)return initial;
 return initial&&typeof initial==='object'&&!Array.isArray(initial)?{...initial,...value}:value;
}
export function usePersistentDraft<T>(key:string,initial:T,requestId?:string){
 const transport=useContext(DraftTransport),central=transport.enabled&&!!transport.datasetId&&!!key;
 const expectedUserId=transport.userId||'',identity=(central?transport.datasetId+':'+expectedUserId+':':'local:')+key;
 const endpoint='/api/command-center/draft?key='+encodeURIComponent(key)+(central&&expectedUserId?'&expectedUserId='+encodeURIComponent(expectedUserId):'');
 const makeRecord=(value:T):DraftRecord<T>=>({value,initial:value,revision:0,saved:'',ready:false,identity,blocked:false,key,endpoint,central,datasetId:transport.datasetId,expectedUserId,requestId,generation:0,queue:Promise.resolve()});
 const [value,V]=useState<T>(initial),[ready,Q]=useState(false),[status,S]=useState('loading'),[error,E]=useState('');
 const current=useRef<DraftRecord<T>>(makeRecord(initial)),initialRef=useRef(initial),alive=useRef(true);
 initialRef.current=initial;
 const mark=useCallback((record:DraftRecord<T>,next:string,message='')=>{
  if(alive.current&&current.current===record){S(next);E(message);}
 },[]);
 const write=useCallback(async(record:DraftRecord<T>,data:T,generation:number)=>{
  if(record.generation!==generation)return;
  const stamp=JSON.stringify(data);
  if(!record.ready){if(record.central)throw Error(saveMessage);return;}
  if(record.blocked)throw Error(conflictMessage);
  if(stamp===record.saved)return;
  if(!record.key){record.saved=stamp;return;}
  if(!record.central){
   try{localStorage.setItem(record.key,stamp);record.saved=stamp;mark(record,stamp===JSON.stringify(record.value)?'saved':'saving');}
   catch{mark(record,'error',localMessage);}
   return;
  }
  mark(record,'saving');
  try{
   const response=await fetch(record.endpoint,{method:'PUT',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({value:data,revision:record.revision,requestId:record.requestId,expectedUserId:record.expectedUserId,datasetId:record.datasetId})});
   const out=await response.json() as any;
   if(!response.ok){if(response.status===409)record.blocked=true;throw Error(out.error||saveMessage);}
   record.revision=out.revision;record.saved=stamp;
   mark(record,stamp===JSON.stringify(record.value)?'saved':'saving');
  }catch(e:any){mark(record,record.blocked?'conflict':'error',e.message||saveMessage);throw e;}
 },[mark]);
 const enqueue=useCallback((record:DraftRecord<T>,data:T,generation=record.generation)=>{
  const task=record.queue.catch(()=>{}).then(()=>write(record,data,generation));
  record.queue=task;return task;
 },[write]);
 const flushRecord=useCallback(async(record:DraftRecord<T>)=>{
  const generation=record.generation;
  do{
   const data=record.value,stamp=JSON.stringify(data);
   await enqueue(record,data,generation);
   if(record.central&&(record.generation!==generation||!record.ready||record.blocked||record.saved!==stamp))throw Error(record.blocked?conflictMessage:saveMessage);
  }while(record.central&&JSON.stringify(record.value)!==record.saved);
 },[enqueue]);
 const flush=useCallback(()=>flushRecord(current.current),[flushRecord]);
 useEffect(()=>{
  alive.current=true;
  const record=makeRecord(initialRef.current);current.current=record;
  V(record.value);Q(false);mark(record,'loading');let cancelled=false;
  (async()=>{
   try{
    let next:T=record.initial,revision=0;
    if(record.key){
     if(record.central){
      const response=await fetch(record.endpoint,{cache:'no-store'}),out=await response.json() as any;
      if(!response.ok)throw Error(out.error||'تعذر استعادة المسودة / Draft load failed');
      revision=out.revision;next=restored(record.initial,out.value);
     }else{
      const raw=localStorage.getItem(record.key);if(raw)next=restored(record.initial,JSON.parse(raw));
     }
    }
    if(cancelled||current.current!==record)return;
    record.value=next;record.revision=revision;record.saved=JSON.stringify(next);record.ready=true;
    V(next);Q(true);mark(record,'saved');
   }catch(e:any){
    if(cancelled||current.current!==record)return;
    if(!record.central){
     record.value=record.initial;record.saved=JSON.stringify(record.initial);record.ready=true;
     V(record.value);Q(true);mark(record,'error',localMessage);
    }else{mark(record,'error',e.message||'تعذر استعادة المسودة / Draft load failed');Q(false);}
   }
  })();
  const finish=()=>{if(record.ready&&!record.blocked&&JSON.stringify(record.value)!==record.saved)void enqueue(record,record.value).catch(()=>{});};
  if(typeof window!=='undefined')window.addEventListener('pagehide',finish);
  return ()=>{
   cancelled=true;alive.current=false;
   if(typeof window!=='undefined')window.removeEventListener('pagehide',finish);
   finish();
  };
 },[identity,central,endpoint,key,requestId,enqueue,mark]);
 useEffect(()=>{
  const record=current.current;
  if(!ready||!record.ready||record.identity!==identity||JSON.stringify(value)===record.saved)return;
  if(!record.blocked)mark(record,'saving');
  const timer=setTimeout(()=>void flushRecord(record).catch(()=>{}),350);
  return ()=>clearTimeout(timer);
 },[value,ready,identity,flushRecord,mark]);
 const setValue=useCallback((next:SetStateAction<T>)=>{
  const record=current.current,v=typeof next==='function'?(next as (v:T)=>T)(record.value):next;
  record.value=v;V(v);
  if(record.ready&&!record.blocked&&JSON.stringify(v)!==record.saved)mark(record,'saving');
 },[mark]);
 const clear=useCallback(async()=>{
  const record=current.current;
  await flushRecord(record);
  const generation=++record.generation;
  if(record.central){
   await enqueue(record,null as T,generation);
   if(record.saved!=='null'||record.blocked)throw Error(record.blocked?conflictMessage:saveMessage);
  }
  let localFailure=false;
  if(!record.central&&record.key){try{localStorage.removeItem(record.key);}catch{localFailure=true;}}
  record.value=record.initial;record.saved=JSON.stringify(record.initial);
  if(alive.current&&current.current===record){V(record.value);mark(record,localFailure?'error':'saved',localFailure?localMessage:'');}
 },[flushRecord,enqueue,mark]);
 const retry=useCallback(()=>{
  const record=current.current;
  if(record.retrying)return record.retrying;
  const task=(async()=>{
   if(record.ready&&!record.blocked){await flushRecord(record);return;}
   try{
    await record.queue.catch(()=>{});
    let next=record.initial,revision=0;
    if(record.central){
     const response=await fetch(record.endpoint,{cache:'no-store'}),out=await response.json() as any;
     if(!response.ok)throw Error(out.error||'تعذر استعادة المسودة / Draft load failed');
     next=restored(record.initial,out.value);revision=out.revision;
    }else if(record.key){const raw=localStorage.getItem(record.key);if(raw)next=restored(record.initial,JSON.parse(raw));}
    if(!alive.current||current.current!==record)throw Error('تغيّرت الخطوة؛ أعد المحاولة / Draft step changed; retry');
    record.generation++;record.blocked=false;record.value=next;record.revision=revision;record.saved=JSON.stringify(next);record.ready=true;
    V(next);Q(true);mark(record,'saved');
   }catch(e:any){mark(record,record.blocked?'conflict':'error',e.message||'تعذر استعادة المسودة / Draft load failed');throw e;}
  })();
  record.retrying=task;
  const finished=()=>{if(record.retrying===task)record.retrying=undefined;};
  task.then(finished,finished);return task;
 },[flushRecord,mark]);

 return {value,setValue,ready,status,error,clear,flush,retry,central};
}
