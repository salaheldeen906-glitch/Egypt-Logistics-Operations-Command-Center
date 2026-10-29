import {accessRecoveryStatements} from '@/lib/access-store';
import { actor, dataset, loadState, bucket, db, stmt, originCheck, readJson, json, failure, hash, commit } from '@/lib/server';
import { authorize } from '@/lib/engine';
import { demand, kinds, references, emptyState, type State } from '@/lib/model';
function base64(buffer: ArrayBuffer) { let out = ''; const b = new Uint8Array(buffer); for (let i = 0; i < b.length; i += 8192)
    out += String.fromCharCode(...b.slice(i, i + 8192)); return btoa(out); }
export async function GET(req: Request) { try {
    const a = await actor();
    authorize(a, { type: 'backup' });
    const id = new URL(req.url).searchParams.get('id');
    const b = await stmt('SELECT * FROM backups WHERE id=?', id).first<any>();
    demand(b, 'Backup not found');
    const object = await bucket().get(b.object_key);
    demand(object, 'Backup missing');
    return new Response(object.body, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="DAF_FULL_BACKUP_${id}.json"`, 'Cache-Control': 'no-store' } });
}
catch (e) {
    return failure(e);
} }
export async function POST(req: Request) {
    try {
        originCheck(req);
        const a = await actor();
        const body = await readJson(req);
        demand(['backup', 'reset', 'restore'].includes(body.type), 'Invalid backup action');
        authorize(a, body);
        demand(typeof body.operationId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(body.operationId), 'Operation identifier required');
        const opKey = a.userId + ':backup:' + body.operationId;
        const opHash = await hash(JSON.stringify({ type: body.type, backupId: body.backupId, confirmation: body.confirmation }));
        const prev = await stmt('SELECT hash,result FROM operations WHERE key=?', opKey).first<any>();
        if (prev) {
            demand(prev.hash === opHash, 'Operation ID reused', 'IDEMPOTENCY', 409);
            return json({ ...JSON.parse(prev.result), replayed: true });
        }
        const d = await dataset();
        demand(body.version === d.version, 'Dataset changed / حدّث البيانات', 'CONFLICT', 409);
        const s = await loadState(d.id);
        let restored: State | undefined;
        let restoredFiles: any[] = [];
        if (body.type === 'restore') {
            const b = await stmt('SELECT * FROM backups WHERE id=?', body.backupId).first<any>();
            demand(b, 'Choose a stored full backup');
            const obj = await bucket().get(b.object_key);
            demand(obj, 'Backup not available');
            const backup = await obj.json<any>();
            if (backup.format === 'daf-full-v1' && backup.state && backup.state.tasks === undefined) backup.state.tasks = [];
            // Older full backups predate these additive features. Missing collections
            // are empty, not a reason to reject an otherwise valid historical backup.
            if (backup.format === 'daf-full-v1' && backup.state) for (const kind of ['customer_sites','delivery_needs','journey_runs','visit_events','tracking_sessions','tracking_points']) if (backup.state[kind] === undefined) backup.state[kind] = [];
            demand(backup.format === 'daf-full-v1' && kinds.every(k => Array.isArray(backup.state[k])), 'Invalid full backup');
            restored = backup.state;
            restoredFiles = backup.files || [];
        }
        if (body.type === 'reset')
            demand(body.confirmation === 'RESET', 'Type RESET / اكتب RESET');
        const full: any = { format: 'daf-full-v1', scope: 'Complete dataset, attachment bytes, audit, member directory and operation history. Auth credentials and invitation secrets excluded.', dataset: d, state: s, members: (await stmt('SELECT * FROM members').all()).results, audit: (await stmt('SELECT * FROM audit WHERE dataset_id=?', d.id).all()).results, operations: (await stmt('SELECT * FROM operations WHERE dataset_id=?', d.id).all()).results.map((x: any) => { const result = JSON.parse(x.result); delete result.token; return { ...x, result: JSON.stringify(result) }; }), files: [], createdAt: new Date().toISOString() };
        let total = 0;
        for (const doc of s.documents) {
            total += doc.size;
            demand(total <= 20 * 1024 * 1024, 'Backup exceeds 20 MB pilot limit / النسخة تتجاوز حد التجربة 20 ميجابايت');
            const f = await bucket().get(doc.objectKey);
            demand(f, 'Attachment missing; backup stopped');
            full.files.push({ documentId: doc.id, name: doc.name, mime: doc.mime, base64: base64(await f.arrayBuffer()) });
        }
        const id = crypto.randomUUID(), objectKey = 'backups/' + id + '.json';
        await bucket().put(objectKey, JSON.stringify(full), { httpMetadata: { contentType: 'application/json' } });
        const extra = [stmt('INSERT INTO backups(id,dataset_id,object_key,at,user_id) VALUES (?,?,?,?,?)', id, d.id, objectKey, full.createdAt, a.userId)];
        let newId: string | undefined;
        if (body.type === 'reset' || body.type === 'restore') {
            newId = 'pilot-' + crypto.randomUUID();
            extra.push(stmt('UPDATE datasets SET active=0 WHERE id=?', d.id), stmt('INSERT INTO datasets(id,name,version,active,created_at) VALUES (?,?,0,1,?)', newId, body.type === 'restore' ? 'DAF · Restored pilot' : 'DAF · Fresh pilot', full.createdAt));
            const next = restored || emptyState();
            const remap = new Map(kinds.flatMap(k => next[k].map(r => [r.id, crypto.randomUUID()] as [
                string,
                string
            ])));
            if (restored) {
                for (const doc of next.documents) {
                    const file = restoredFiles.find(x => x.documentId === doc.id);
                    demand(file && typeof file.base64 === 'string', 'Backup attachment missing');
                    const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
                    demand(bytes.byteLength === doc.size, 'Backup attachment size mismatch');
                    const key = 'files/' + newId + '/' + remap.get(doc.id);
                    await bucket().put(key, bytes, { httpMetadata: { contentType: doc.mime } });
                    doc.objectKey = key;
                }
            }
            const entities: any[] = [];
            const ls: any[] = [];
            for (const k of kinds) {
                const remapValue = (value: any): any => typeof value === 'string' ? remap.get(value) || value : Array.isArray(value) ? value.map(remapValue) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key,remapValue(item)])) : value;
                const rows = next[k].map(r => { const n = remapValue(r); n.id = remap.get(r.id)!; entities.push({ id: n.id, kind: k, code: n.code }); for (const [, toId] of references(k, n))
                    ls.push({ id: crypto.randomUUID(), fromId: n.id, toId }); return { id: n.id, data: JSON.stringify(n) }; });
                if (rows.length)
                    extra.push(stmt(`INSERT INTO ${k}(id,data) SELECT json_extract(value,'$.id'),json_extract(value,'$.data') FROM json_each(?)`, JSON.stringify(rows)));
            }
            extra.splice(3, 0, stmt("INSERT INTO entities(id,dataset_id,kind,code) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.kind'),json_extract(value,'$.code') FROM json_each(?)", newId, JSON.stringify(entities)));
            extra.push(stmt("INSERT INTO entity_links(id,from_id,to_id) SELECT json_extract(value,'$.id'),json_extract(value,'$.fromId'),json_extract(value,'$.toId') FROM json_each(?)", JSON.stringify(ls)), stmt("INSERT INTO audit(id,dataset_id,user_id,action,details,at) VALUES (?,?,?,? ,?,?)", crypto.randomUUID(), newId, a.userId, body.type, JSON.stringify({ fromDataset: d.id, backupId: body.backupId || id }), full.createdAt));
            extra.push(...await accessRecoveryStatements(a,d.id,newId,remap,body.type));
        }
        const out = await commit(a, d, s, s, { type: body.type }, opKey, opHash, { id, datasetId: newId || d.id }, extra);
        return json(out);
    }
    catch (e) {
        return failure(e);
    }
}
