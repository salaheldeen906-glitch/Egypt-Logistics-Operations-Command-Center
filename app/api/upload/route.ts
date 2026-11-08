import { actor, act, bucket, dataset, hash, originCheck, boundedBody, json, failure } from '@/lib/server';
import { demand } from '@/lib/model';
import { authorize } from '@/lib/engine';
import {proofMime} from '@/lib/proof-file';
export async function POST(req: Request) { try {
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
    const fileHash = await hash(bytes);
    const prefix = `files/${d.id}/${a.userId}`;
    // A failed attempt never owns an existing attachment or backup object.
    const key = `${prefix}/upload-${crypto.randomUUID()}`;
    const version = form.get('version');
    const result = await act(a, {
        version: typeof version === 'string' && version.trim() ? Number(version) : NaN,
        operationId: form.get('operationId'),
        command: {
            type: 'upload', requestId: String(form.get('requestId')), taskId: String(form.get('taskId') || ''),
            purpose: String(form.get('purpose')),
            file: { key, name: f.name.replace(/[\r\n]/g, '').slice(0, 180), size: f.size, mime },
        },
    }, {
        datasetId: d.id,
        contentKey: `${prefix}/${fileHash}`,
        store: () => bucket().put(key, bytes, { httpMetadata: { contentType: mime } }),
        discard: () => bucket().delete(key),
    });
    return json(result);
}
catch (e) {
    return failure(e);
} }
