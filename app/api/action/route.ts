import { actor, act, originCheck, readJson, json, failure, stmt, dataset } from '@/lib/server';
import { demand, type Actor } from '@/lib/model';
export async function POST(req: Request) { let a:Actor|undefined, body:any; try {
    originCheck(req);
    demand(Number(req.headers.get('content-length') || 0) < 3000000, 'Request too large');
    body = await readJson(req);
    a=await actor();
    if(body.command)body.command.channel="interface";
    return json(await act(a, body));
}
catch (e:any) {
    if(a&&['delete','undo_import'].includes(body?.command?.type)) {
        try {const d=await dataset();await stmt('INSERT INTO audit(id,dataset_id,user_id,action,record_id,reason,details,at) VALUES (?,?,?,?,?,?,?,?)',crypto.randomUUID(),d.id,a.userId,'delete_failed',String(body.command.id||body.command.importId||'').slice(0,100),String(e.code||'SERVER'),'{}',new Date().toISOString()).run();}catch{/* Keep the original error; never log request bodies. */}
    }
    return failure(e);
} }
