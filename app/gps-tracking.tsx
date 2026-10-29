'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Actor, type Command, type Row, type State } from '@/lib/model';
import { canPublishTracking, canReadTracking, GPS_SAMPLE_SECONDS, trackingSummary } from '@/lib/gps';

type Props = { s: State; actor: Actor; journey?: Row; ar: boolean; busy?: boolean; onCommand?: (c: Command) => any; onRefresh?: () => any };
type SessionData = { sessions: Row[]; points: Row[] };
export function GpsTracking({ s, actor, journey, ar, busy, onRefresh }: Props) {
    const l = (a: string, b: string) => ar ? a : b;
    const [consent, setConsent] = useState(false), [running, setRunning] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [data, setData] = useState<SessionData | null>(null), [clock, setClock] = useState(Date.now());
    const watch = useRef<number | null>(null), session = useRef<Row | null>(null), seq = useRef(0), sending = useRef(false), pending = useRef<{ command: Command; operationId: string } | null>(null), lastSent = useRef(0), mounted = useRef(true), stopping = useRef(false);
    const visible = !!journey && canReadTracking(s, actor, { journeyId: journey.id, id: 'visibility', code: 'GPS' });
    const publish = !!journey && canPublishTracking(actor, journey);
    const current = data ? { ...s, tracking_sessions: data.sessions, tracking_points: data.points } : s;
    const summary = trackingSummary(current, journey?.id, new Date(clock).toISOString());
    const active = data ? data.sessions.find(x => x.status === 'active') : s.tracking_sessions?.find(x => x.journeyId === journey?.id && x.status === 'active');
    async function refresh() {
        if (!journey || !visible || document.visibilityState !== 'visible') return;
        try { const response = await fetch('/api/tracking?journeyId=' + encodeURIComponent(journey.id), { cache: 'no-store' }); const result: any = await response.json(); if (!response.ok) throw Error(result.error || 'GPS unavailable'); if (mounted.current) setData(result); } catch { /* Retain last known location with its age; never relabel old data as live. */ }
    }
    async function send(command: Command, operationId = crypto.randomUUID(), keepalive = false) {
        const response = await fetch('/api/tracking', { method: 'POST', credentials: 'same-origin', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, operationId }) });
        const result: any = await response.json(); if (!response.ok) { const error = new Error(result.error || l('تعذر إرسال الموقع','Location upload failed')); (error as any).code = result.code; throw error; } return result;
    }
    async function stop(reason: string, unmount = false) {
        if (watch.current != null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; }
        if (mounted.current && !unmount) setRunning(false);
        // Leaving a read-only view on another device must not stop that account's remote phone.
        const selected = session.current || (reason === 'courier_stopped' && active?.startedBy === actor.userId ? active : undefined);
        if (!selected || !publish || stopping.current) return;
        stopping.current = true;
        try { await send({ type: 'tracking_stop', sessionId: selected.id, reason }, crypto.randomUUID(), true); session.current = null; pending.current = null; if (mounted.current && !unmount) { setNotice(l('تم إيقاف مشاركة الموقع. مهامك مستمرة.','Location sharing stopped. Operational tasks remain available.')); await refresh(); onRefresh?.(); } }
        catch (e: any) { if (mounted.current && !unmount) setError(l('الإرسال من الهاتف متوقف؛ تعذر تأكيد إغلاق الجلسة على الخادم. آخر موقع يظل بتوقيته: ','Device upload stopped; server closure could not be confirmed. Last location retains its timestamp: ') + e.message); }
        finally { stopping.current = false; }
    }
    async function position(p: GeolocationPosition) {
        if (!session.current || document.visibilityState !== 'visible' || sending.current) return;
        if (!pending.current && p.timestamp - lastSent.current < GPS_SAMPLE_SECONDS * 1000) return;
        sending.current = true;
        pending.current ||= { command: { type: 'tracking_point', sessionId: session.current.id, seq: seq.current + 1, latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, recordedAt: new Date(p.timestamp).toISOString() }, operationId: crypto.randomUUID() };
        try {
            const out = await send(pending.current.command, pending.current.operationId);
            seq.current = out.seq; lastSent.current = Date.parse(pending.current.command.recordedAt); pending.current = null;
            if (mounted.current) { setError(''); setNotice(l('آخر عينة أُرسلت بنجاح.','Latest sample uploaded.')); await refresh(); }
        } catch (e: any) {
            if (mounted.current) setError(e.message);
            if (['FORBIDDEN', 'STATE', 'GPS_CAPACITY'].includes(e.code)) await stop(e.code.toLowerCase());
            else if (['GPS_TIME','CONFLICT'].includes(e.code)) { pending.current = null; await stop('session_refresh_required'); }
        } finally { sending.current = false; }
    }
    async function start() {
        if (!journey || !consent || !publish || document.visibilityState !== 'visible') return;
        if (!window.isSecureContext || !navigator.geolocation) { setError(l('الموقع الجغرافي غير متاح في هذا المتصفح أو الاتصال. يمكنك إكمال التشغيل.','Geolocation is unavailable in this browser or connection. Operations remain available.')); return; }
        setWorking(true); setError(''); setNotice('');
        try {
            const out = await send({ type: 'tracking_start', journeyId: journey.id, consent: true });
            session.current = { id: out.id, code: 'GPS', journeyId: journey.id, executorId: journey.executorId, startedBy: actor.userId, lastSeq: 0 }; seq.current = 0; lastSent.current = 0; pending.current = null;
            if (!mounted.current || document.visibilityState !== 'visible') { await stop('page_not_visible', !mounted.current); return; }
            setRunning(true);
            watch.current = navigator.geolocation.watchPosition(p => void position(p), e => { if (mounted.current) setError(e.code === 1 ? l('إذن الموقع مرفوض؛ تستطيع متابعة مهامك بدونه.','Location permission denied; continue operational tasks without GPS.') : l('الموقع غير متاح أو انتهت المهلة. حاول مجددًا عندما تتوفر إشارة.','Position unavailable or timed out. Retry when a signal is available.')); void stop(e.code === 1 ? 'permission_denied' : 'position_unavailable'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
            await refresh(); onRefresh?.();
        } catch (e: any) { if (mounted.current) setError(e.message); }
        finally { if (mounted.current) setWorking(false); }
    }
    useEffect(() => {
        mounted.current = true; setData(null); setConsent(false); void refresh();
        const timer = window.setInterval(() => { setClock(Date.now()); void refresh(); }, 20000);
        const hidden = () => { if (document.visibilityState !== 'visible') void stop('page_hidden'); };
        const pagehide = () => void stop('page_left', true);
        document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide);
        return () => { mounted.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide); void stop('page_left', true); };
        // Sharing starts only from the explicit button, never from a render or a restored session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [journey?.id, actor.userId]);
    useEffect(() => { if (journey && journey.status !== 'in_transit' && session.current) void stop('journey_ended'); }, [journey?.status]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!journey || !visible) return null;
    const point = summary.lastPoint;
    return <section className="panel gps-tracking" aria-label={l('مشاركة موقع الرحلة الاختيارية','Optional journey location sharing')}>
        <h3>{l('موقع الرحلة — تجربة اختيارية','Journey location — opt-in beta')}</h3>
        <p>{l('المشاركة تعمل والصفحة مفتوحة وظاهرة، وتتوقف عند إخفائها أو مغادرتها. لا نضمن التتبع مع قفل الهاتف. لا يؤكد الموقع تسليمًا أو وصولًا تلقائيًا.','Sharing works while this page is open and visible, and stops when it is hidden or left. Locked-phone tracking is not guaranteed. Location never confirms arrival or delivery.')}</p>
        <p role="status">{running ? l('المشاركة من هذا الهاتف مفعلة','Sharing enabled on this device') : active ? l('توجد جلسة على الخادم؛ لا يوجد إرسال من هذه الصفحة','Server session exists; this page is not publishing') : l('المشاركة متوقفة','Sharing stopped')} · {summary.stale ? l('الموقع قديم أو غير متاح','Location stale or unavailable') : l('عينة حديثة — وليست بثًا مضمونًا','Recent sample — not guaranteed live tracking')}</p>
        {point ? <dl><dt>{l('آخر موقع مسجل','Last recorded position')}</dt><dd dir="ltr">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</dd><dt>{l('وقت العينة / آخر تحديث','Sample time / last update')}</dt><dd>{new Date(point.recordedAt).toLocaleString(ar ? 'ar-EG' : 'en-GB')}</dd><dt>{l('دقة الهاتف التقريبية','Approximate device accuracy')}</dt><dd>± {Math.round(point.accuracy)} {l('متر','m')}</dd></dl> : <p>{l('لم يصل موقع لهذه الرحلة بعد.','No location sample received for this journey yet.')}</p>}
        <p>{l('المسافة من العينات','Distance from samples')}: <strong>{summary.estimatedKm == null ? l('غير متاحة','Unavailable') : `${summary.estimatedKm} ${l('كم — تقديرية جزئية','km — partial estimate')}`}</strong>{summary.gaps > 0 ? ` · ${summary.gaps} ${l('فجوة أو مقطع مستبعد','gaps or excluded segments')}` : ''}</p>
        {point && <p><a href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=16/${point.latitude}/${point.longitude}`} target="_blank" rel="noreferrer noopener">{l('فتح آخر موقع على الخريطة','Open last position on map')}</a><small> · {l('بالضغط ترسل الإحداثيات إلى مزود الخريطة.','Clicking shares coordinates with the map provider.')}</small></p>}
        {publish && <><label className="check-row"><input type="checkbox" checked={consent} disabled={running || working} onChange={e => setConsent(e.target.checked)} />{l('أوافق على مشاركة موقعي أثناء هذه الرحلة مع المشرفين المخولين.','I agree to share my position during this journey with authorized supervisors.')}</label><div className="inline-actions"><Button disabled={!!busy || working || running || !!active || !consent || journey.status !== 'in_transit'} onClick={() => void start()}>{l('بدء مشاركة موقع الرحلة','Start journey location sharing')}</Button><Button variant="outline" disabled={working || !running && !active} onClick={() => void stop('courier_stopped')}>{l('إيقاف مشاركة الموقع','Stop location sharing')}</Button></div><small>{l('عينة عند توفر تحديث جديد، بفاصل مستهدف دقيقة. حتى 720 عينة للجلسة؛ لا يعمل GPS خارج رحلة بدأت.','A sample when a new fix is available, targeting a one-minute interval. Up to 720 samples per session; sharing requires a started journey.')}</small></>}
        {!publish && <p>{l('المشاهدة حسب الصلاحية. تشغيل المشاركة يحتاج حساب المندوب المرتبط بالرحلة.','Visibility follows your permissions. Publishing requires the courier account explicitly linked to this journey.')}</p>}
        {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}
    </section>;
}
