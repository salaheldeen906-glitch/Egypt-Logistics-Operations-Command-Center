import {actor,dataset,loadState,json,failure} from '@/lib/server';
import {searchRecords} from '@/lib/search';
export async function GET(req:Request){try{const a=await actor(),d=await dataset(),p=Object.fromEntries(new URL(req.url).searchParams);return json({...searchRecords(await loadState(d.id),a,{...p,desc:p.desc==='true'}),version:d.version});}catch(e){return failure(e);}}
