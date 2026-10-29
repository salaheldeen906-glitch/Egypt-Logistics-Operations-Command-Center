import {assertReadPermission} from '@/lib/access-policy';
import { actor, act, originCheck, readJson, json, failure, dataset, loadState } from '@/lib/server';
import { demand } from '@/lib/model';
import { canReadTracking } from '@/lib/gps';
import {scopedState} from '@/lib/access';
import { requireCommandCenter } from '@/lib/command-center-isolation';

export async function GET(req: Request) { try {
    requireCommandCenter(); const a = await actor(), d = await dataset();
    assertReadPermission(a,'tracking_sessions');
    const journeyId = new URL(req.url).searchParams.get('journeyId');
    demand(journeyId && journeyId.length <= 180, 'Journey identifier required / اختر رحلة');
    const s = scopedState(await loadState(d.id),a);
    const sessions = s.tracking_sessions.filter(r => r.journeyId === journeyId && canReadTracking(s, a, r));
    const points = s.tracking_points.filter(r => sessions.some(x => x.id === r.sessionId) && canReadTracking(s, a, r));
    return json({ sessions, points, serverTime: new Date().toISOString() });
} catch (e) { return failure(e); } }

export async function POST(req: Request) { try {
    requireCommandCenter(); originCheck(req); const a = await actor();
    const body = await readJson(req, 4096);
    demand(body.command && ['tracking_start', 'tracking_point', 'tracking_stop'].includes(body.command.type), 'Tracking command required / إجراء مشاركة الموقع مطلوب');
    body.command.channel = 'interface';
    // CAS remains mandatory. The authenticated endpoint obtains a fresh server revision and retries once.
    for (let attempt = 0; attempt < 2; attempt++) {
        const d = await dataset();
        try { return json(await act(a, { command: body.command, operationId: body.operationId, version: d.version })); }
        catch (e: any) { if (attempt === 1 || !(e?.code === 'CONFLICT' || /revision_must_match/.test(e?.message || ''))) throw e; }
    }
    throw new Error('Tracking retry exhausted');
} catch (e) { return failure(e); } }
