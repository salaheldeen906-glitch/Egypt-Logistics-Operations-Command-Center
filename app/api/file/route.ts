import {assertReadPermission} from '@/lib/access-policy';
import { actor, loadState, dataset, bucket, failure } from '@/lib/server';
import { row, demand } from '@/lib/model';
import { scopedState } from '@/lib/access';
export async function GET(req: Request) { try {
    const a = await actor();
    assertReadPermission(a,'documents','download');
    const d = await dataset(), s = scopedState(await loadState(d.id), a);
    const doc = row(s, 'documents', new URL(req.url).searchParams.get('id') || '');
    const file = await bucket().get(doc.objectKey);
    demand(file, 'File unavailable', 'NOT_FOUND', 404);
    const preview=new URL(req.url).searchParams.get('preview')==='1';
    demand(!preview||['image/png','image/jpeg','application/pdf'].includes(doc.mime),'Preview unavailable for this file / المعاينة غير متاحة لهذا النوع','FILE_TYPE',415);
    return new Response(file.body, { headers: { 'Content-Type': doc.mime, 'Content-Disposition': `${preview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer' } });
}
catch (e) {
    return failure(e);
} }
