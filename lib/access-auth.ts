// Server-only extension of the existing DAF identity path. No operational data lives here.
import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { demand, DomainError, type Actor } from './model';
import { commandCenterConfig, requireCommandCenterActor } from './command-center-isolation';

export const ACCESS_COOKIE = '__Host-daf_access_session';
const SESSION_SECONDS = 8 * 60 * 60;
const PASSWORD_ROUNDS = 600000;
const DUMMY_HASH = `pbkdf2-sha256:${PASSWORD_ROUNDS}:${'0'.repeat(32)}:${'0'.repeat(64)}`;
type AuthEnvironment = Cloudflare.Env & { ACCESS_DAF_ENABLED?: string };
export function accessEnabled() { return (env as AuthEnvironment).ACCESS_DAF_ENABLED === '1'; }
function database() { const db = (env as AuthEnvironment).DB; demand(db, 'Access storage unavailable / تخزين الدخول غير متاح', 'UNAVAILABLE', 503); return db; }
const query = (sql: string, ...args: unknown[]) => database().prepare(sql).bind(...args);
const nowISO = () => new Date().toISOString();
async function digest(value: string) { return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex'); }
async function derive(password: string, salt: Uint8Array, rounds: number) {
  // Workers' native PBKDF2 has a production iteration cap absent in local
  // workerd. Keep standard PBKDF2-SHA256 and the existing 600,000-round hash
  // format using the audited pure-JS implementation, with cooperative yields.
  const passwordBytes = new TextEncoder().encode(password);
  try {
    return Buffer.from(await pbkdf2Async(sha256, passwordBytes, salt, { c: rounds, dkLen: 32, asyncTick: 8 }));
  } finally {
    passwordBytes.fill(0);
  }
}

/** Count Unicode code points; preserve the exact password, including spaces. */
export function validatePassword(password: unknown): asserts password is string {
  demand(typeof password === 'string' && [...password].length >= 15 && [...password].length <= 128,
    'Use 15–128 characters for the password / كلمة المرور من 15 إلى 128 حرفًا', 'PASSWORD_POLICY', 400);
}
export async function hashPassword(password: unknown) {
  validatePassword(password);
  const salt = randomBytes(16), key = await derive(password, salt, PASSWORD_ROUNDS);
  return `pbkdf2-sha256:${PASSWORD_ROUNDS}:${salt.toString('hex')}:${key.toString('hex')}`;
}
export async function verifyPassword(password: unknown, encoded: string) {
  const supplied = typeof password === 'string' && [...password].length <= 128 ? password : '';
  const parts = encoded.split(':');
  const valid = parts[0] === 'pbkdf2-sha256' && Number(parts[1]) === PASSWORD_ROUNDS
    && /^[a-f0-9]{32}$/.test(parts[2] || '') && /^[a-f0-9]{64}$/.test(parts[3] || '');
  const safe = valid ? parts : DUMMY_HASH.split(':');
  const key = await derive(supplied, Buffer.from(safe[2], 'hex'), PASSWORD_ROUNDS);
  return valid && typeof password === 'string' && [...password].length <= 128
    && timingSafeEqual(key, Buffer.from(safe[3], 'hex'));
}

export function passwordSessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${ACCESS_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function tokenFromCookie(value: string | null) {
  const values = (value || '').split(';').map(part => part.trim()).filter(part => part.startsWith(ACCESS_COOKIE + '='));
  if (!values.length) return null;
  demand(values.length === 1, 'Session ended. Sign in again / انتهت الجلسة؛ سجّل الدخول مجددًا', 'AUTH', 401);
  const token = values[0].slice(ACCESS_COOKIE.length + 1);
  demand(/^[a-f0-9]{64}$/.test(token), 'Session ended. Sign in again / انتهت الجلسة؛ سجّل الدخول مجددًا', 'AUTH', 401);
  return token;
}
type AccountRow = {
  user_id: string; username: string; email: string | null; password_hash: string | null; active: number; revision: number;
  grant_id: string | null; starts_at: string | null; ends_at: string | null; unlimited: number;
  name: string; role: Actor['role']; function: string; member_active: number; is_owner: number;
};
type GrantRow = { id: string; revision: number; active: number; starts_at: string | null; ends_at: string | null; unlimited: number; warehouse_ids: string; resource_ids: string };
function withinPeriod(row: { starts_at: string | null; ends_at: string | null; unlimited: number }, at: string) {
  return (!row.starts_at || row.starts_at <= at) && (row.unlimited === 1 || !!row.ends_at && row.ends_at > at);
}
async function grantFor(account: AccountRow) {
  return account.grant_id ? query('SELECT id,revision,active,starts_at,ends_at,unlimited,warehouse_ids,resource_ids FROM access_grants WHERE id=?', account.grant_id).first<GrantRow>() : null;
}
function accountUsable(account: AccountRow, grant: GrantRow | null, at: string) {
  return account.active === 1 && account.member_active === 1
    && (account.is_owner === 1 || withinPeriod(account, at) && !!grant && grant.active === 1 && withinPeriod(grant, at));
}
async function securityEvent(event: string, outcome: string, userId: string | null, subjectHash: string | null) {
  await query('INSERT INTO access_security_events(id,at,event,outcome,user_id,subject_hash) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), nowISO(), event, outcome, userId, subjectHash).run();
}

async function requireLoginConfiguration(account: AccountRow, grant: GrantRow | null) {
  if (!commandCenterConfig().enabled) return;
  demand(account.is_owner === 1 || account.role !== 'owner', 'Unverified owner membership / ملكية الحساب تحتاج تحققًا', 'MEMBERSHIP', 403);
  const candidate: Actor = { userId: account.user_id, name: account.name, role: account.role, function: account.function, active: account.member_active };
  if (account.role !== 'contributor' || !['warehouse', 'representative'].includes(account.function)) {
    requireCommandCenterActor(candidate);
    return;
  }
  const row = await query('SELECT value FROM settings WHERE key=?', 'member_operations:' + account.user_id).first<{ value: string }>();
  let scopes: { warehouseIds?: string[] | null; resourceIds?: string[] | null };
  try { scopes = row ? JSON.parse(row.value) : {}; }
  catch { throw new DomainError('MEMBERSHIP', 'Owner must correct your account scope / يصحح المالك نطاق حسابك أولًا', 403); }
  demand(scopes && typeof scopes === 'object' && !Array.isArray(scopes), 'Owner must correct your account scope / يصحح المالك نطاق حسابك أولًا', 'MEMBERSHIP', 403);
  const intersect = (chosen: unknown, maximum: unknown): string[] | null => {
    const valid = (value: unknown): value is string[] | null => value === null || Array.isArray(value) && value.every(id => typeof id === 'string');
    demand(valid(chosen) && valid(maximum), 'Owner must correct your account scope / يصحح المالك نطاق حسابك أولًا', 'MEMBERSHIP', 403);
    return chosen === null ? maximum : maximum === null ? chosen : chosen.filter(id => maximum.includes(id));
  };
  // Validate the same effective operational scope used by actor(), without
  // granting a role, changing a function, or creating a session first.
  requireCommandCenterActor({
    ...candidate,
    warehouseIds: intersect(scopes?.warehouseIds ?? null, grant ? JSON.parse(grant.warehouse_ids) : null),
    resourceIds: intersect(scopes?.resourceIds ?? null, grant ? JSON.parse(grant.resource_ids) : null),
  });
}

export async function resolvePasswordIdentity() {
  if (!accessEnabled()) return null;
  const token = tokenFromCookie((await headers()).get('cookie'));
  if (!token) return null;
  const at = nowISO();
  const session = await query('SELECT id,user_id,account_revision,grant_revision,expires_at,revoked_at FROM access_sessions WHERE hash=?', await digest(token))
    .first<{ id: string; user_id: string; account_revision: number; grant_revision: number; expires_at: string; revoked_at: string | null }>();
  demand(session && !session.revoked_at && session.expires_at > at, 'Session ended. Sign in again / انتهت الجلسة؛ سجّل الدخول مجددًا', 'AUTH', 401);
  const account = await query("SELECT a.*,m.name,m.role,m.function,m.active AS member_active,CASE WHEN a.user_id=(SELECT value FROM settings WHERE key='owner_id') THEN 1 ELSE 0 END AS is_owner FROM access_accounts a JOIN members m ON m.user_id=a.user_id WHERE a.user_id=?", session.user_id).first<AccountRow>();
  const grant = account ? await grantFor(account) : null;
  demand(account && accountUsable(account, grant, at) && account.revision === session.account_revision
    && (account.is_owner === 1 ? session.grant_revision === 0 : grant?.revision === session.grant_revision),
    'Access or session ended. Sign in again / انتهى الوصول أو الجلسة؛ سجّل الدخول مجددًا', 'AUTH', 401);
  return {
    userId: account.user_id, displayName: account.name, email: account.email || account.username, fullName: null,
    accessSession: { id: session.id, accountRevision: session.account_revision, grantRevision: session.grant_revision },
  };
}

function sameOrigin(req: Request) {
  const origin = req.headers.get('origin'), site = req.headers.get('sec-fetch-site');
  demand(origin === new URL(req.url).origin && site !== 'cross-site', 'Request origin rejected / مصدر الطلب غير مسموح', 'CSRF', 403);
}
async function boundedJson(req: Request) {
  demand(req.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'JSON request required / مطلوب طلب JSON', 'INVALID', 400);
  const reader = req.body?.getReader(); demand(reader, 'Request body required', 'INVALID', 400);
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 5000) { await reader.cancel(); throw new DomainError('SIZE', 'Request too large / الطلب أكبر من المسموح', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new DomainError('JSON', 'Invalid request / الطلب غير صحيح', 400); }
}
function response(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}
export function accessAuthFailure(error: unknown) {
  if (error instanceof DomainError) return response({ error: error.message, code: error.code }, error.status);
  // Never log request bodies, cookies, hashes, credentials, or raw database errors.
  return response({ error: 'Sign-in service unavailable. Try again / خدمة الدخول غير متاحة؛ حاول مجددًا', code: 'UNAVAILABLE' }, 503);
}
async function rateAttempt(key: string, limit: number) {
  const at = nowISO(), until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const row = await query('INSERT INTO access_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts', key, until, at, at).first<{ attempts: number }>();
  return !!row && row.attempts <= limit;
}
export async function loginPassword(req: Request) {
  try {
    demand(accessEnabled(), 'Password sign-in is not enabled / الدخول بكلمة المرور غير مفعّل', 'NOT_FOUND', 404);
    sameOrigin(req);
    const body = await boundedJson(req), suppliedLogin = body?.login ?? body?.username;
    const login = typeof suppliedLogin === 'string' ? suppliedLogin.normalize('NFKC').trim().toLowerCase() : '';
    demand(login.length > 0 && login.length <= 254 && typeof body?.password === 'string' && [...body.password].length <= 128,
      'Incorrect login or password / اسم الدخول أو كلمة المرور غير صحيحة', 'AUTH', 401);
    const subjectHash = await digest(login), ipHash = await digest(req.headers.get('cf-connecting-ip') || 'unknown');
    // Subject plus network limits survive restarts; expiry is always server-side.
    const bySubject = await rateAttempt('subject:' + subjectHash, 5), byNetwork = await rateAttempt('network:' + ipHash, 30);
    if (!bySubject || !byNetwork) {
      await securityEvent('password_login', 'rate_limited', null, subjectHash);
      return response({ error: 'Too many attempts. Try after 15 minutes / محاولات كثيرة؛ حاول بعد 15 دقيقة', code: 'RATE_LIMIT' }, 429);
    }
    const matches = await query("SELECT a.*,m.name,m.role,m.function,m.active AS member_active,CASE WHEN a.user_id=(SELECT value FROM settings WHERE key='owner_id') THEN 1 ELSE 0 END AS is_owner FROM access_accounts a JOIN members m ON m.user_id=a.user_id WHERE a.username=? OR (a.email IS NOT NULL AND lower(a.email)=?) LIMIT 2", login, login).all<AccountRow>();
    const account = matches.results.length === 1 ? matches.results[0] : null;
    const correct = await verifyPassword(body.password, account?.password_hash || DUMMY_HASH);
    if (!account || !correct) {
      await securityEvent('password_login', 'rejected', null, subjectHash);
      return response({ error: 'Incorrect login or password / اسم الدخول أو كلمة المرور غير صحيحة', code: 'AUTH' }, 401);
    }
    const at = nowISO(), grant = await grantFor(account);
    if (!accountUsable(account, grant, at)) {
      await securityEvent('password_login', 'access_inactive', account.user_id, null);
      return response({ error: 'Access is stopped, not started, or expired. Contact your administrator / الوصول موقوف أو لم يبدأ أو انتهت مدته؛ راجع المسؤول', code: 'ACCESS_INACTIVE' }, 403);
    }
    try { await requireLoginConfiguration(account, grant); }
    catch (error) {
      if (error instanceof DomainError && error.code === 'MEMBERSHIP') await securityEvent('password_login', 'configuration_required', account.user_id, null);
      throw error;
    }
    const token = randomBytes(32).toString('hex'), sessionId = crypto.randomUUID(), guard = 'access-login:' + sessionId;
    const expires = new Date(Math.min(Date.now() + SESSION_SECONDS * 1000, ...(!account.is_owner ? [account.unlimited ? Infinity : Date.parse(account.ends_at!), grant!.unlimited ? Infinity : Date.parse(grant!.ends_at!)] : []))).toISOString();
    const ownerId = account.is_owner ? account.user_id : '';
    await database().batch([
      query("INSERT INTO transaction_guards(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM access_accounts a JOIN members m ON m.user_id=a.user_id WHERE a.user_id=? AND a.revision=? AND a.active=1 AND m.active=1 AND (a.user_id=(SELECT value FROM settings WHERE key='owner_id') OR ((a.starts_at IS NULL OR a.starts_at<=?) AND (a.unlimited=1 OR a.ends_at>?) AND EXISTS(SELECT 1 FROM access_grants g WHERE g.id=a.grant_id AND g.revision=? AND g.active=1 AND (g.starts_at IS NULL OR g.starts_at<=?) AND (g.unlimited=1 OR g.ends_at>?))))) THEN 1 ELSE 0 END", guard, account.user_id, account.revision, at, at, grant?.revision || 0, at, at),
      query('INSERT INTO access_sessions(id,hash,user_id,account_revision,grant_revision,created_at,expires_at,revoked_at) VALUES (?,?,?,?,?,?,?,NULL)', sessionId, await digest(token), account.user_id, account.revision, ownerId ? 0 : grant!.revision, at, expires),
      query('INSERT INTO access_security_events(id,at,event,outcome,user_id,subject_hash) VALUES (?,?,?, ?,?,NULL)', crypto.randomUUID(), at, 'password_login', 'accepted', account.user_id),
      query('DELETE FROM access_login_limits WHERE key=?', 'subject:' + subjectHash),
      query('DELETE FROM transaction_guards WHERE id=?', guard),
    ]);
    return response({ signedIn: true }, 200, passwordSessionCookie(token, Math.max(0, Math.floor((Date.parse(expires) - Date.now()) / 1000))));
  } catch (error) { return accessAuthFailure(error); }
}
export async function revokeAccountSessions(userId: string) {
  await query('UPDATE access_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', nowISO(), userId).run();
}
export async function logoutPassword(req: Request) {
  try {
    demand(accessEnabled(), 'Password sign-in is not enabled', 'NOT_FOUND', 404); sameOrigin(req);
    // Signing out must also recover from a malformed/expired browser cookie.
    // The origin check still applies, and no invalid token is used as identity.
    let token: string | null = null;
    try { token = tokenFromCookie(req.headers.get('cookie')); } catch (error) { if (!(error instanceof DomainError) || error.code !== 'AUTH') throw error; }
    if (token) {
      const session = await query('SELECT id,user_id FROM access_sessions WHERE hash=? AND revoked_at IS NULL', await digest(token)).first<{ id: string; user_id: string }>();
      if (session) await database().batch([
        query('UPDATE access_sessions SET revoked_at=? WHERE id=?', nowISO(), session.id),
        query('INSERT INTO access_security_events(id,at,event,outcome,user_id,subject_hash) VALUES (?,?,?,?,?,NULL)', crypto.randomUUID(), nowISO(), 'password_logout', 'accepted', session.user_id),
      ]);
    }
    return response({ signedOut: true }, 200, passwordSessionCookie('', 0));
  } catch (error) { return accessAuthFailure(error); }
}
