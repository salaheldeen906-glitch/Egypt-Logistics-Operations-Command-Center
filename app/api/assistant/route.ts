import {publicAccessActor} from '@/lib/access-store';
import {assertReadPermission} from '@/lib/access-policy';
import {actor,dataset,loadState,act,originCheck,readJson,json,failure} from '@/lib/server';
import {assistantCommand,assistantCommands} from '@/lib/assistant';
import {scopedState} from '@/lib/access';
import {execute,authorize} from '@/lib/engine';
import {demand,kinds,row,text} from '@/lib/model';
import {nextAction} from '@/lib/insights';
export async function GET(req:Request){try{
 const a=await actor(),d=await dataset(),id=new URL(req.url).searchParams.get('requestId');
 const allowed=assistantCommands.filter(type=>{try{authorize(a,{type});return true;}catch{return false;}});
 if(!id)return json({actor:publicAccessActor(a),dataset:d,allowedCommands:allowed,access:'Same signed-in membership and project scope. No independent assistant account.'});
 assertReadPermission(a,'requests');
 const s=scopedState(await loadState(d.id),a),r=row(s,'requests',text(id));
 return json({dataset:d,request:r,nextAction:nextAction(s,r),related:Object.fromEntries(kinds.filter(k=>k!=='requests').map(k=>[k,s[k].filter(x=>x.requestId===r.id).map(({objectKey,...x})=>x)]))});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 originCheck(req);const a=await actor(),b=await readJson(req,100000),c=assistantCommand(b.command);
 if(b.preview===true){const d=await dataset();demand(b.version===d.version,'Data changed; refresh and preview again / حدّث البيانات وراجع التعديل','CONFLICT',409);const s=await loadState(d.id),next=execute(s,a,c);return json({preview:true,version:d.version,command:c,changes:kinds.flatMap(k=>next.state[k].filter(r=>JSON.stringify(r)!==JSON.stringify(s[k].find(x=>x.id===r.id))).map(r=>({kind:k,code:r.code,id:s[k].some(x=>x.id===r.id)?r.id:null}))),message:'Preview only; nothing saved. New IDs are assigned on save.'});}
 return json(await act(a,{...b,command:c}));
}catch(e){return failure(e);}}
