import {assertReadPermission} from './access-policy';
import {type State,type Actor,type Kind,kinds,demand} from './model';
import {scopedState} from './access';
export function searchRecords(state:State,actor:Actor,input:any) {
    demand(input&&typeof input==='object','Search input required');
    const kind=input.kind||'requests';demand(kinds.includes(kind),'Unknown collection');
    assertReadPermission(actor,kind);
    const query=String(input.query||'').trim().toLocaleLowerCase();demand(query.length<=180,'Search text too long');
    const page=Number(input.page||1),limit=Number(input.limit||20);
    demand(Number.isInteger(page)&&page>=1&&page<=100000&&Number.isInteger(limit)&&limit>=1&&limit<=50,'Invalid page or limit');
    const s=scopedState(state,actor),sort=['code','name','createdAt','dueDate','status','priority'].includes(input.sort)?input.sort:'code';
    const rows=s[kind as Kind].filter(r=>(!input.projectId||r.projectId===input.projectId||s.requests.some(q=>q.id===r.requestId&&q.projectId===input.projectId))&&(!input.status||r.status===input.status)&&[r.code,r.name,r.destination,r.notes,r.recipient].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)).sort((a,b)=>String(a[sort]||'').localeCompare(String(b[sort]||''),'ar',{numeric:true})*(input.desc?-1:1)||a.id.localeCompare(b.id));
    // Do not expose storage object keys or the full ledger through search results.
    return {kind,page,limit,total:rows.length,pages:Math.ceil(rows.length/limit),rows:rows.slice((page-1)*limit,page*limit).map(r=>Object.fromEntries(['id','code','name','destination','status','priority','dueDate','projectId','requestId','taskType','quantity','executorId','participantId','createdAt'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))};
}
