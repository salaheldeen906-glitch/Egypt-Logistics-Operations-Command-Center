import { type Actor, type Command, type Kind, type Row, type State, demand, row, text } from './model';

/** Browser GPS is an explicitly requested, foreground-only beta; it never changes stock or arrival. */
export const GPS_SAMPLE_SECONDS = 60;
export const GPS_MAX_POINTS = 720;
export const GPS_DATASET_POINT_LIMIT = 20000;
const MIN_SAMPLE_MS = 30000;
const MAX_GAP_MS = 5 * 60000;
type Add = (kind: Kind, value: Record<string, any>) => Row;
const entries = (s: State, key: string): Row[] => ((s as any)[key] || []);
const projects = (j: Row): string[] => Array.isArray(j.projectIds) ? j.projectIds : j.projectId ? [j.projectId] : [];
export function canPublishTracking(a: Actor, j: Row) {
    return !!a.active && a.role !== 'viewer' && Array.isArray(a.resourceIds) && a.resourceIds.includes(j.executorId)
        && projects(j).length > 0 && (a.role === 'owner' || a.projectIds == null || projects(j).every(id => a.projectIds!.includes(id)));
}
export function canReadTracking(s: State, a: Actor, record: Row) {
    if (!a.active) return false;
    const j = entries(s, 'journey_runs').find(j => j.id === record.journeyId);
    if (!j || !projects(j).length || (a.role !== 'owner' && a.projectIds != null && !projects(j).every(id => a.projectIds!.includes(id)))) return false;
    return a.role === 'owner' || a.role === 'manager' || a.role !== 'viewer' && a.function === 'dispatcher'
        || Array.isArray(a.resourceIds) && a.resourceIds.includes(j.executorId);
}
export function stopJourneyTracking(s: State, journeyId: string, now: string, reason = 'journey_ended') {
    for (const session of entries(s, 'tracking_sessions').filter(x => x.journeyId === journeyId && x.status === 'active')) {
        session.status = 'stopped'; session.stoppedAt = now; session.stopReason = reason;
    }
}
export function executeTracking(s: State, a: Actor, c: Command, now: string, add: Add): Record<string, any> | null {
    if (!['tracking_start', 'tracking_point', 'tracking_stop'].includes(c.type)) return null;
    demand(a.active && a.role !== 'viewer', 'GPS publishing requires an active operational account / يلزم حساب تشغيلي نشط', 'FORBIDDEN', 403);
    const sessions = entries(s, 'tracking_sessions'), points = entries(s, 'tracking_points');
    const session = c.type !== 'tracking_start' ? row(s, 'tracking_sessions' as Kind, text(c.sessionId)) : undefined;
    const journey = row(s, 'journey_runs' as Kind, text(session?.journeyId || c.journeyId));
    demand(canPublishTracking(a, journey), 'Only the explicitly linked courier account may share this journey location / مشاركة الموقع من حساب المندوب المرتبط بهذه الرحلة فقط', 'FORBIDDEN', 403);
    if (session) demand(session.startedBy === a.userId, 'Only the account that opted in may publish or stop its session / الجلسة تخص الحساب الذي وافق على المشاركة', 'FORBIDDEN', 403);
    if (c.type === 'tracking_stop') {
        if (session!.status !== 'active') return { id: session!.id, stopped: true, replayed: true };
        session!.status = 'stopped'; session!.stoppedAt = now; session!.stopReason = text(c.reason || 'courier_stopped', 180);
        return { id: session!.id, stopped: true };
    }
    demand(journey.status === 'in_transit', 'Start the actual journey before sharing GPS / ابدأ الرحلة الفعلية قبل مشاركة الموقع', 'STATE', 409);
    if (c.type === 'tracking_start') {
        demand(c.consent === true, 'Explicit location consent required / يلزم اختيار الموافقة على مشاركة الموقع', 'CONSENT');
        demand(!sessions.some(x => x.status === 'active' && (x.executorId === journey.executorId || x.startedBy === a.userId)), 'Stop the existing sharing session first / أوقف جلسة المشاركة الحالية أولًا', 'STATE', 409);
        demand(points.length < GPS_DATASET_POINT_LIMIT, 'GPS sample capacity reached; operational tasks remain available / اكتملت سعة عينات الموقع؛ مهام التشغيل متاحة', 'GPS_CAPACITY', 409);
        const created = add('tracking_sessions' as Kind, { journeyId: journey.id, executorId: journey.executorId, projectIds: [...projects(journey)], requestIds: [...(journey.requestIds || [])], status: 'active', startedBy: a.userId, startedAt: now, consentAt: now, consentVersion: 'foreground-gps-v1', lastSeq: 0, pointCount: 0, sampleSeconds: GPS_SAMPLE_SECONDS, source: 'browser_geolocation_beta' });
        return { id: created.id, sampleSeconds: GPS_SAMPLE_SECONDS, maxPoints: GPS_MAX_POINTS };
    }
    demand(session!.status === 'active', 'Location sharing has stopped / مشاركة الموقع متوقفة', 'STATE', 409);
    demand(typeof c.latitude === 'number' && Number.isFinite(c.latitude) && c.latitude >= -90 && c.latitude <= 90, 'Invalid latitude / خط عرض غير صحيح');
    demand(typeof c.longitude === 'number' && Number.isFinite(c.longitude) && c.longitude >= -180 && c.longitude <= 180, 'Invalid longitude / خط طول غير صحيح');
    demand(typeof c.accuracy === 'number' && Number.isFinite(c.accuracy) && c.accuracy > 0 && c.accuracy <= 10000, 'Invalid GPS accuracy / دقة موقع غير صحيحة');
    demand(Number.isInteger(c.seq) && c.seq >= 1 && c.seq <= GPS_MAX_POINTS, 'Invalid GPS sequence / تسلسل موقع غير صحيح');
    demand(typeof c.recordedAt === 'string' && c.recordedAt.length <= 30 && Number.isFinite(Date.parse(c.recordedAt)), 'GPS timestamp required / توقيت الموقع مطلوب');
    const recordedMs = Date.parse(c.recordedAt), receivedMs = Date.parse(now), recordedAt = new Date(recordedMs).toISOString();
    demand(recordedMs <= receivedMs + 60000 && recordedMs >= receivedMs - 180000 && recordedMs >= Date.parse(session!.startedAt) - 1000, 'GPS timestamp is stale or ahead; check the device clock / توقيت الموقع قديم أو متقدم؛ راجع ساعة الهاتف', 'GPS_TIME');
    const duplicate = points.find(p => p.sessionId === session!.id && p.seq === c.seq);
    if (duplicate) {
        demand(duplicate.latitude === c.latitude && duplicate.longitude === c.longitude && duplicate.accuracy === c.accuracy && duplicate.recordedAt === recordedAt, 'GPS sequence reused with changed position / تسلسل الموقع مكرر ببيانات مختلفة', 'IDEMPOTENCY', 409);
        return { id: duplicate.id, sessionId: session!.id, seq: duplicate.seq, replayed: true };
    }
    demand(c.seq === (session!.lastSeq || 0) + 1, 'GPS sequence conflict; refresh the session / تعارض تسلسل الموقع؛ حدّث الجلسة', 'CONFLICT', 409);
    demand(!session!.lastPointAt || recordedMs - Date.parse(session!.lastPointAt) >= MIN_SAMPLE_MS, 'GPS samples are too frequent / انتظر قبل عينة الموقع التالية', 'GPS_RATE', 429);
    demand((session!.pointCount || 0) < GPS_MAX_POINTS && points.length < GPS_DATASET_POINT_LIMIT, 'GPS sample capacity reached; stop sharing; operations remain available / اكتملت سعة العينات؛ أوقف المشاركة، التشغيل متاح', 'GPS_CAPACITY', 409);
    const point = add('tracking_points' as Kind, { sessionId: session!.id, journeyId: journey.id, executorId: journey.executorId, projectIds: [...projects(journey)], seq: c.seq, latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, recordedAt, receivedAt: now, source: 'browser_geolocation_beta' });
    session!.lastSeq = c.seq; session!.pointCount = (session!.pointCount || 0) + 1; session!.lastPointAt = recordedAt;
    return { id: point.id, sessionId: session!.id, seq: c.seq };
}
function km(a: Row, b: Row) {
    const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
/** Distance is only a lower-fidelity sampled estimate. Missing/gapped observations never become zero km. */
export function trackingSummary(s: State, journeyId?: string, now = new Date().toISOString()) {
    const sessions = entries(s, 'tracking_sessions').filter(x => !journeyId || x.journeyId === journeyId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const points = entries(s, 'tracking_points').filter(p => sessions.some(x => x.id === p.sessionId)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const lastPoint = points.at(-1), ageSeconds = lastPoint ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(lastPoint.recordedAt)) / 1000)) : null;
    let distance = 0, segments = 0, gaps = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], elapsed = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
        if (a.sessionId !== b.sessionId || elapsed <= 0 || elapsed > MAX_GAP_MS || a.accuracy > 100 || b.accuracy > 100) { gaps++; continue; }
        const d = km(a, b);
        if (d / (elapsed / 3600000) > 180) { gaps++; continue; }
        distance += d; segments++;
    }
    return { session: sessions.find(x => x.status === 'active') || sessions[0], lastPoint, ageSeconds, stale: ageSeconds == null || ageSeconds > GPS_SAMPLE_SECONDS * 3, accuracy: lastPoint?.accuracy ?? null, estimatedKm: segments ? Math.round(distance * 1000) / 1000 : null, distanceStatus: segments ? 'partial' as const : 'unavailable' as const, gaps, pointCount: points.length };
}
