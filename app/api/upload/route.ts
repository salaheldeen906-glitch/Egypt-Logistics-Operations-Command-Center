import { actor, act, bucket, dataset, loadState, hash, originCheck, boundedBody, json, failure } from '@/lib/server';
import { assertScope } from '@/lib/access';
import { demand } from '@/lib/model';
import { authorize } from '@/lib/engine';
import {proofMime} from '@/lib/proof-file';
export async function POST(req: Request) { let key: string | undefined; try {
    originCheck(req);
    const a = await actor();
    authorize(a, { type: 'upload' });
    demand(Number(req.headers.get('content-length') || 0) <= 5500000, 'Maximum upload 5 MB / الحد 5 ميجابايت');
    const payload = await boundedBody(req, 5500000);
    const form = await new Response(payload, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
    const f = form.get('file');
    demand(f instanceof File && f.size > 0 && f.size <= 5 * 1024 * 1024, 'File size must be 1 byte–5 MB / الحد 5 ميجابايت');
    const bytes = await f.arrayBuffer(), head = new Uint8Array(bytes);
    const mime = proofMime(head,f.name,f.type);
    const d = await dataset();
    assertScope(await loadState(d.id),a,{type:'upload',requestId:String(form.get('requestId')),taskId:String(form.get('taskId')||'')});
    const fileHash = await hash(bytes);
    key = `files/${d.id}/${a.userId}/${fileHash}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: mime } });
    return json(await act(a, { version: Number(form.get('version')), operationId: String(form.get('operationId')), command: { type: 'upload', requestId: String(form.get('requestId')), taskId:String(form.get('taskId')||''), purpose: String(form.get('purpose')), file: { key, name: f.name.replace(/[\r\n]/g, '').slice(0, 180), size: f.size, mime } } }, true));
}
catch (e) {
    return failure(e);
} }
