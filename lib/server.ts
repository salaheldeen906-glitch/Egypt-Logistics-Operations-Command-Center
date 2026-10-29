import {permissionDecision,canViewScreen} from './access-policy';
import {resolvePasswordIdentity,accessEnabled} from './access-auth';
import {decorateAccessActor,accessCommitGuards,publicAccessActor} from './access-store';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { type State, type Actor, type Command, kinds, emptyState, demand, DomainError, references } from './model';
import { authorize, execute, validateImport } from './engine';
import { scopedState, assertScope } from './access';
import { deletePreview } from './deletion';
import { verifyDeletePassword } from './delete-security';
import {requireCommandCenter,requireCommandCenterDataset,commandCenterConfig,requireCommandCenterActor} from './command-center-isolation';
import {invitationPolicy} from './invitations';
export const runtime = () => env as Cloudflare.Env & {
    PILOT_OWNER_EMAIL?: string;
    DELETE_PASSWORD_HASH?: string;
};
export function db() { const d = runtime().DB; demand(d, 'Shared database unavailable / قاعدة البيانات غير متاحة', 'UNAVAILABLE', 503); return d; }
export function bucket() { const b = runtime().BUCKET; demand(b, 'Shared file storage unavailable / تخزين الملفات غير متاح', 'UNAVAILABLE', 503); return b; }
export const stmt = (sql: string, ...args: any[]) => db().prepare(sql).bind(...args);
export async function hash(value: string | ArrayBuffer) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function identity() { const u = (accessEnabled()?await resolvePasswordIdentity():null) || await getChatGPTUser(); demand(u, 'Sign in with ChatGPT / سجّل الدخول بحساب ChatGPT', 'AUTH', 401); return u; }
export async function actor() {
    const u = await identity();
    let m = await stmt('SELECT user_id as userId,name,role,function,active FROM members WHERE user_id=?', u.userId).first<Actor>();
    if (!m && runtime().PILOT_OWNER_EMAIL && u.email.toLowerCase() === runtime().PILOT_OWNER_EMAIL!.toLowerCase()) {
        const initialDataset = commandCenterConfig().enabled ? commandCenterConfig().datasetId : 'pilot-main';
        demand(initialDataset && initialDataset !== (commandCenterConfig().enabled ? 'pilot-main' : ''), 'Invalid initial dataset', 'PILOT_ISOLATION', 503);
        await db().batch([stmt("INSERT OR IGNORE INTO settings(key,value) VALUES ('owner_id',?)", u.userId), stmt("INSERT OR IGNORE INTO members(user_id,name,role,function,active) SELECT ?,?,'owner','all',1 WHERE (SELECT value FROM settings WHERE key='owner_id')=?", u.userId, u.displayName, u.userId), stmt("INSERT OR IGNORE INTO datasets(id,name,version,active,created_at) SELECT ?,?,0,1,? WHERE (SELECT value FROM settings WHERE key='owner_id')=?", initialDataset, commandCenterConfig().enabled ? 'DAF · مصر — مركز القيادة' : 'DAF · Team Pilot', new Date().toISOString(), u.userId)]);
        m = await stmt('SELECT user_id as userId,name,role,function,active FROM members WHERE user_id=?', u.userId).first<Actor>();
    }
    demand(m && m.active, 'Use a valid team invitation / استخدم رابط انضمام صالح', 'MEMBERSHIP', 403);
    const scope = await stmt('SELECT value FROM settings WHERE key=?', 'member_scope:' + m.userId).first<{value:string}>();
    m.projectIds = scope ? JSON.parse(scope.value) : null;
    const ops=await stmt('SELECT value FROM settings WHERE key=?','member_operations:'+m.userId).first<{value:string}>();
    Object.assign(m,ops?JSON.parse(ops.value):{warehouseIds:null,resourceIds:null});
    const decorated = accessEnabled() ? await decorateAccessActor(m,(u as any).accessSession) : m;
    if(commandCenterConfig().enabled)requireCommandCenterActor(decorated);
    return decorated;
}
export async function dataset() {
 const isolated=commandCenterConfig().enabled;
 const rows=await stmt('SELECT * FROM datasets WHERE active=1 ORDER BY created_at DESC LIMIT '+(isolated?'2':'1')).all<{
    id: string;
    name: string;
    version: number;
    created_at:string;
 }>();
 const d=rows.results[0];
 demand(d, 'Owner must initialize the pilot / يجب دخول المالك أولًا', 'UNINITIALIZED', 409);
 if(isolated){
  demand(rows.results.length===1,'Multiple active datasets; owner review required / توجد مجموعات نشطة متعددة؛ تحتاج مراجعة المالك','PILOT_ISOLATION',503);
  await requireCommandCenterDataset(d,db());
 }
 return d;
}
export async function loadState(datasetId: string) { const results = await db().batch(kinds.map(k => stmt(`SELECT t.data FROM ${k} t JOIN entities e ON e.id=t.id WHERE e.dataset_id=?`, datasetId))); const s = emptyState(); for (let i = 0; i < kinds.length; i++)
    for (const r of results[i].results as {
        data: string;
    }[])
        s[kinds[i]].push(JSON.parse(r.data)); return s; }
export async function readSnapshot(a: Actor) {
    const d = await dataset(), s = scopedState(await loadState(d.id), a);
    const history = await stmt('SELECT a.*,m.name as actor FROM audit a LEFT JOIN members m ON m.user_id=a.user_id WHERE a.dataset_id=? ORDER BY a.at DESC LIMIT 200', d.id).all<any>();
    const visibleIds = new Set(kinds.flatMap(k => s[k].map(r => r.id)));
    const audit = history.results.filter(r => a.access?.enabled ? permissionDecision(a,'audit.view').allowed&&(a.platformOwner===true||visibleIds.has(r.record_id)) : a.role==='owner' || a.projectIds==null&&a.warehouseIds==null&&a.resourceIds==null || visibleIds.has(r.record_id)).map(({details,...r})=>({...r,channel:JSON.parse(details||'{}').channel||'interface'}));
    const team = a.role==='owner' ? (await stmt("SELECT m.user_id as userId,m.name,m.role,m.function,m.active,s.value as projectScope,o.value as operationsScope FROM members m LEFT JOIN settings s ON s.key='member_scope:'||m.user_id LEFT JOIN settings o ON o.key='member_operations:'||m.user_id ORDER BY m.role,m.name").all<any>()).results.map(({projectScope,operationsScope,...m})=>({...m,projectIds:projectScope?JSON.parse(projectScope):null,...(operationsScope?JSON.parse(operationsScope):{warehouseIds:null,resourceIds:null})})) : [];
    const backups = a.role === 'owner' ? (await stmt('SELECT id,at,dataset_id as datasetId FROM backups ORDER BY at DESC LIMIT 30').all()).results : [];
    const invite = a.role === 'owner' ? await stmt('SELECT expires,active FROM invitations ORDER BY rowid DESC LIMIT 1').first() : null;
    const invitations=a.role==='owner'?(await stmt("SELECT i.id,i.expires,i.active,p.value as policy FROM invitations i JOIN settings p ON p.key='invitation_policy:'||i.id ORDER BY i.rowid DESC LIMIT 100").all<any>()).results.map(({policy,...i})=>({...i,...JSON.parse(policy)})).filter(i=>i.datasetId===d.id):[];
    return { dataset:d, state:s, actor:publicAccessActor(a), courierDirectory:(a.access?.enabled?s.resources.map(x=>({id:x.id,name:x.name})):a.function==='representative'?(await stmt('SELECT data FROM resources').all<any>()).results.map(x=>JSON.parse(x.data)).map(x=>({id:x.id,name:x.name})):s.resources.map(x=>({id:x.id,name:x.name}))), members:team, audit, backups, invite, invitations, deleteConfigured:!!runtime().DELETE_PASSWORD_HASH, syncSeconds:20, serverTime:new Date().toISOString() };
}
export async function boundedBody(req: Request, limit = 3000000) { const reader = req.body?.getReader(); demand(reader, 'Request body required'); const parts: Uint8Array[] = []; let length = 0; for (;;) {
    const { value, done } = await reader.read();
    if (done)
        break;
    length += value.length;
    if (length > limit) {
        await reader.cancel();
        throw new DomainError('SIZE', 'Request exceeds upload limit / حجم الطلب أكبر من الحد', 413);
    }
    parts.push(value);
} const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
} return bytes; }
export async function readJson(req: Request, limit = 3000000) { try {
    return JSON.parse(new TextDecoder().decode(await boundedBody(req, limit)));
}
catch (e) {
    if (e instanceof DomainError)
        throw e;
    throw new DomainError('JSON', 'Invalid JSON request / صيغة طلب غير صحيحة');
} }
export function originCheck(req: Request) { const o = req.headers.get('origin'), site = req.headers.get('sec-fetch-site'); demand(site !== 'cross-site', 'Cross-site request rejected', 'CSRF', 403); if (o)
    demand(new URL(o).host === new URL(req.url).host, 'Origin mismatch', 'CSRF', 403); }
export function json(data: any, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } }); }
export function failure(e: any) { if (e instanceof DomainError)
    return json({ error: e.message, code: e.code }, e.status); console.error('Pilot operation failed', {code:'UNEXPECTED'}); if (/revision_must_match/.test(e?.message || ''))
    return json({ error: 'Another teammate updated the dataset. Refresh, review and retry / تغيرت البيانات؛ حدّث وراجع ثم أعد المحاولة', code: 'CONFLICT' }, 409); if (/UNIQUE constraint/.test(e?.message || ''))
    return json({ error: 'Duplicate code or operation / كود أو إجراء مكرر', code: 'DUPLICATE' }, 409); return json({ error: 'Save failed. Your input is preserved / تعذر الحفظ؛ مدخلاتك محفوظة في النموذج', code: 'SERVER' }, 503); }
export async function commit(a: Actor, d: {
    id: string;
    version: number;
}, before: State, after: State, c: Command, key: string, payloadHash: string, result: any, extra: D1PreparedStatement[] = []) {
    const changed = kinds.flatMap(k => after[k].filter(r => JSON.stringify(r) !== JSON.stringify(before[k].find(x => x.id === r.id))).map(r => ({ ...r, kind: k, data: JSON.stringify(r) })));
    const deleted = kinds.flatMap(k => before[k].filter(r => !after[k].some(x => x.id === r.id)).map(r => r.id));
    const changedIds = changed.map(r => r.id);
    const links = changed.flatMap(r => references(r.kind, r).map(([, toId], i) => ({ id: r.id + ':' + i, fromId: r.id, toId })));
    const out = { ...result, version: d.version + 1 };
    const now = new Date().toISOString();
    const statements = [stmt('UPDATE datasets SET version=version+1 WHERE id=? AND version=?', d.id, d.version), stmt('INSERT INTO transaction_guards(id,ok) VALUES (?,changes())', key), stmt('DELETE FROM entity_links WHERE from_id IN (SELECT value FROM json_each(?))', JSON.stringify([...changedIds, ...deleted])), stmt('DELETE FROM entities WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(deleted)), stmt("INSERT INTO entities(id,dataset_id,kind,code) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.kind'),json_extract(value,'$.code') FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET code=excluded.code", d.id, JSON.stringify(changed))];
    for (const k of kinds) {
        const rows = changed.filter(r => r.kind === k);
        if (rows.length)
            statements.push(stmt(`INSERT INTO ${k}(id,data) SELECT json_extract(value,'$.id'),json_extract(value,'$.data') FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET data=excluded.data`, JSON.stringify(rows)));
    }
    statements.push(stmt("INSERT INTO entity_links(id,from_id,to_id) SELECT json_extract(value,'$.id'),json_extract(value,'$.fromId'),json_extract(value,'$.toId') FROM json_each(?)", JSON.stringify(links)), ...extra, stmt('INSERT INTO audit(id,dataset_id,user_id,action,record_id,reason,details,at) VALUES (?,?,?,?,?,?,?,?)', crypto.randomUUID(), d.id, a.userId, c.type, c.requestId || result.id || c.id || c.userId || null, c.reason || null, JSON.stringify({ channel:c.channel==='assistant'?'assistant':'interface', changed: changed.map(r => ({ kind: r.kind, id: r.id, code: r.code })), deleted, ...(c.type==='member'?{membership:{userId:c.userId,role:c.role,function:c.function,active:c.active!==false,projectIds:c.projectIds??null,warehouseIds:c.warehouseIds,resourceIds:c.resourceIds}}:{}) }), now), stmt('INSERT INTO operations(key,dataset_id,user_id,hash,result,at) VALUES (?,?,?,?,?,?)', key, d.id, a.userId, payloadHash, JSON.stringify(out), now), stmt('DELETE FROM transaction_guards WHERE id=?', key));
    const rawScopes=(a.access as any)?.originalScopes||a;
    statements.unshift(stmt('INSERT INTO transaction_guards(id,ok) SELECT ?, CASE WHEN EXISTS(SELECT 1 FROM members WHERE user_id=? AND active=1 AND role=? AND function=?) AND COALESCE((SELECT value FROM settings WHERE key=?),\'null\')=? THEN 1 ELSE 0 END',key+':access',a.userId,a.role,a.function,'member_scope:'+a.userId,JSON.stringify(rawScopes.projectIds??null)));
    statements.unshift(stmt("INSERT INTO transaction_guards(id,ok) SELECT ?,CASE WHEN COALESCE((SELECT value FROM settings WHERE key=?),?)=? THEN 1 ELSE 0 END",key+':operations','member_operations:'+a.userId,JSON.stringify({warehouseIds:null,resourceIds:null}),JSON.stringify({warehouseIds:rawScopes.warehouseIds??null,resourceIds:rawScopes.resourceIds??null})));
    statements.push(stmt('DELETE FROM transaction_guards WHERE id=?',key+':operations'));
    statements.push(stmt('DELETE FROM transaction_guards WHERE id=?',key+':access'));
    const accessGuards=accessCommitGuards(a,key);
    statements.unshift(...accessGuards);
    // Guards are transaction-local rows. Delete them inside the same atomic batch.
    if(accessGuards.length)statements.push(stmt("DELETE FROM transaction_guards WHERE id LIKE ?",key+':access-daf:%'));
    await db().batch(statements);
    return out;
}
export async function act(a: Actor, body: any, internalUpload = false) {
    const c = body.command as Command;
    demand(c && typeof c.type === 'string', 'Command required');
    if(c.loadingProtocol==='dual'||['warehouse_release','courier_collect','propose_quantity_increase','review_quantity_increase','report_loading_difference','review_loading_difference'].includes(c.type)){requireCommandCenter();await dataset();}
    demand(c.type !== 'upload' || internalUpload, 'Use the attachment endpoint', 'INVALID', 400);
    authorize(a, c);
    if(accessEnabled()&&['member','invite','revoke_invite','revoke_invites'].includes(c.type))demand(a.platformOwner===true,'Use scoped account administration / استخدم إدارة الحسابات ضمن التفويض','FORBIDDEN',403);
    const deleting = c.type === 'delete' || c.type === 'undo_import';
    const password = c.password;
    delete c.password;
    if (deleting) {
        // Atomic shared rate counter; retries cannot reset the 15-minute window.
        const rateKey = 'delete_rate:' + a.userId + ':' + Math.floor(Date.now()/900000);
        const rate = await stmt("INSERT INTO settings(key,value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 RETURNING value",rateKey).first<{value:string}>();
        demand(Number(rate?.value)<=5,'Too many deletion attempts. Try after 15 minutes / محاولات كثيرة؛ حاول بعد 15 دقيقة','RATE_LIMIT',429);
        await verifyDeletePassword(password,runtime().DELETE_PASSWORD_HASH);
    }
    if (c.type === 'import')
        c.signature = await hash(JSON.stringify({ kind: c.kind, mode:c.mode||'add', rows: c.rows }));
    const d = await dataset();
    const op = body.operationId;
    demand(typeof op === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(op), 'Valid operation identifier required');
    const key = d.id + ':' + a.userId + ':' + op;
    const payloadHash = await hash(JSON.stringify(c));
    const previous = await stmt('SELECT hash,result FROM operations WHERE key=?', key).first<{
        hash: string;
        result: string;
    }>();
    if (previous) {
        demand(previous.hash === payloadHash, 'Operation ID reused with different input', 'IDEMPOTENCY', 409);
        return { ...JSON.parse(previous.result), replayed: true };
    }
    demand(Number.isInteger(body.version) && body.version === d.version, 'Data changed. Refresh and retry / تغيرت البيانات؛ حدّث وأعد المحاولة', 'CONFLICT', 409);
    const s = await loadState(d.id);
    assertScope(s, a, c);
    if (deleting || c.type === 'preview_delete') {
        const kind=c.type==='undo_import'?'imports':c.kind, id=c.type==='undo_import'?c.importId:c.id;
        if (kind==='projects') {
            const linked=await stmt("SELECT 1 FROM settings s, json_each(CASE WHEN s.key LIKE 'member_scope:%' THEN s.value ELSE 'null' END) j WHERE j.value=? LIMIT 1",id).first();
            demand(!linked,'Project is assigned to a member. Update permissions first / المشروع ضمن صلاحيات عضو؛ عدّل النطاق أولًا','DEPENDENCY',409);
        }
        if(deleting && a.projectIds!=null && a.role!=='owner') demand(deletePreview(s,kind,id).allowed,'Record is in use or protected / السجل مستخدم أو محمي','DEPENDENCY',409);
    }
    if (c.type === 'preview_delete') {
        const {ids,...preview} = deletePreview(s,c.kind,c.id);
        // Related codes can belong to another scope: do not disclose them.
        if (a.projectIds != null && a.role!=='owner' && preview.blockers.length) preview.blockers=['Record is in use or protected / السجل مستخدم أو محمي'];
        return {...preview, configured:!!runtime().DELETE_PASSWORD_HASH};
    }
    if (c.type === 'preview_import')
        return validateImport(s, a, c);
    if (c.type === 'member') {
        demand(c.userId !== a.userId, 'Cannot change your own owner membership');
        const m = await stmt('SELECT * FROM members WHERE user_id=?', c.userId).first<any>();
        demand(m && m.role !== 'owner', 'Member not found or owner protected');
        demand(['manager', 'contributor', 'viewer'].includes(c.role), 'Invalid role');
        demand(['all', 'project_manager', 'operations', 'warehouse', 'dispatcher', 'representative'].includes(c.function), 'Invalid function');
        demand(c.projectIds == null || (Array.isArray(c.projectIds) && c.projectIds.every((id:unknown)=>s.projects.some(p=>p.id===id))), 'Invalid project scope / نطاق مشاريع غير صحيح');
        const ops=await stmt('SELECT value FROM settings WHERE key=?','member_operations:'+c.userId).first<{value:string}>(),prior=ops?JSON.parse(ops.value):{warehouseIds:null,resourceIds:null};
        const warehouseIds=c.warehouseIds===undefined?prior.warehouseIds:c.warehouseIds,resourceIds=c.resourceIds===undefined?prior.resourceIds:c.resourceIds;
        demand(warehouseIds==null||Array.isArray(warehouseIds)&&warehouseIds.every((id:unknown)=>s.warehouses.some(w=>w.id===id)),'Invalid warehouse scope / نطاق مخازن غير صحيح');
        demand(resourceIds==null||Array.isArray(resourceIds)&&resourceIds.every((id:unknown)=>s.resources.some(r=>r.id===id)),'Invalid courier mapping / ربط مندوب غير صحيح');
        if(resourceIds?.length){const other=await stmt("SELECT key,value FROM settings WHERE key LIKE 'member_operations:%' AND key<>?",'member_operations:'+c.userId).all<{key:string;value:string}>();demand(!other.results.some(o=>(JSON.parse(o.value).resourceIds||[]).some((id:string)=>resourceIds.includes(id))),'Courier is already linked to another account / المندوب مربوط بحساب آخر','DUPLICATE',409);}
        return commit(a, d, s, s, c, key, payloadHash, {}, [...(accessEnabled()?[stmt('UPDATE access_accounts SET revision=revision+1 WHERE user_id=?',c.userId),stmt('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',new Date().toISOString(),c.userId)]:[]),stmt('UPDATE members SET role=?,function=?,active=? WHERE user_id=?', c.role, c.function, c.active === false ? 0 : 1, c.userId),stmt('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','member_scope:'+c.userId,JSON.stringify(c.projectIds??null)),stmt('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','member_operations:'+c.userId,JSON.stringify({warehouseIds,resourceIds}))]);
    }
    if (c.type === 'invite') {
        const token = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await hash(token);
        const bound=!!c.email||commandCenterConfig().enabled;
        const policy=bound?invitationPolicy(c,s,d.id):null;
        const expires = new Date(Date.now() + (policy?.days||7) * 86400000).toISOString(),id=crypto.randomUUID();
        return commit(a, d, s, s, c, key, payloadHash, { token, expires, id, recipient:policy?.email }, [...(!bound?[stmt('UPDATE invitations SET active=0')]:[]),stmt('INSERT INTO invitations(id,hash,expires,active,created_by) VALUES (?,?,?,1,?)', id, tokenHash, expires, a.userId),...(policy?[stmt('INSERT INTO settings(key,value) VALUES (?,?)','invitation_policy:'+id,JSON.stringify(policy))]:[])]);
    }
    if(c.type==='revoke_invite'){
        const policy=await stmt('SELECT value FROM settings WHERE key=?','invitation_policy:'+c.inviteId).first<{value:string}>();
        demand(policy&&JSON.parse(policy.value).datasetId===d.id,'Invitation not found / الدعوة غير موجودة','NOT_FOUND',404);
        return commit(a,d,s,s,c,key,payloadHash,{},[stmt('UPDATE invitations SET active=0 WHERE id=?',c.inviteId)]);
    }
    if (c.type === 'revoke_invites')
        return commit(a, d, s, s, c, key, payloadHash, {}, [stmt('UPDATE invitations SET active=0')]);
    const next = execute(s, a, c);
    return commit(a, d, s, next.state, c, key, payloadHash, next.result);
}
