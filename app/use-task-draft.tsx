'use client';
import {createContext,useContext,useState,useEffect} from 'react';
import {usePersistentDraft} from './central-draft';
export const DraftScope=createContext('training');
export function useTaskDraft(name:string){
 const scope=useContext(DraftScope),key='daf-draft-v2:'+scope+':'+name,draft=usePersistentDraft<{mode:string;form:any}>(key,{mode:'',form:{}},name.split(':')[0]),[mode,setMode]=useState('');
 useEffect(()=>setMode(''),[key]);
 const form=draft.value.form,setForm=(v:any)=>draft.setValue(old=>({...old,mode:mode||old.mode,form:typeof v==='function'?v(old.form):v}));
 const selectMode=(v:string)=>{setMode(v);if(v)draft.setValue(old=>({...old,mode:v}));};
 const resume=()=>setMode(draft.value.mode||'');
 const clearDraft=async()=>{await draft.clear();setMode('');draft.setValue({mode:'',form:{}});};
 return {mode,setMode:selectMode,form,setForm,hasDraft:!!draft.value.mode,resume,clearDraft,draft};
}
