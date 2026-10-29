import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const datasets = sqliteTable('datasets', { id: text('id').primaryKey(), name: text('name').notNull(), version: integer('version').notNull().default(0), active: integer('active').notNull().default(1), createdAt: text('created_at').notNull() });
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const members = sqliteTable('members', { userId: text('user_id').primaryKey(), name: text('name').notNull(), role: text('role').notNull(), function: text('function').notNull().default('all'), active: integer('active').notNull().default(1) }, t => [check('member_role', sql `${t.role} in ('owner','manager','contributor','viewer')`)]);
export const invitations = sqliteTable('invitations', { id: text('id').primaryKey(), hash: text('hash').notNull().unique(), expires: text('expires').notNull(), active: integer('active').notNull().default(1), createdBy: text('created_by').notNull().references(() => members.userId) });
export const entities = sqliteTable('entities', { id: text('id').primaryKey(), datasetId: text('dataset_id').notNull().references(() => datasets.id), kind: text('kind').notNull(), code: text('code').notNull() }, t => [uniqueIndex('entity_code').on(t.datasetId, t.kind, t.code), index('entities_dataset').on(t.datasetId, t.kind)]);
function entityTable(name: string) { return sqliteTable(name, { id: text('id').primaryKey().references(() => entities.id, { onDelete: 'cascade' }), data: text('data').notNull() }); }
export const units = entityTable('units');
export const projects = entityTable('projects');
export const products = entityTable('products');
export const customers = entityTable('customers');
export const warehouses = entityTable('warehouses');
export const locations = entityTable('locations');
export const batches = entityTable('batches');
export const resources = entityTable('resources');
export const carriers = entityTable('carriers');
export const requests = entityTable('requests');
export const lines = entityTable('lines');
export const reservations = entityTable('reservations');
export const assignments = entityTable('assignments');
export const routes = entityTable('routes');
export const stops = entityTable('stops');
export const movements = entityTable('movements');
export const documents = entityTable('documents');
export const pods = entityTable('pods');
export const deliveries = entityTable('deliveries');
export const returns = entityTable('returns');
export const exceptions = entityTable('exceptions');
export const approvals = entityTable('approvals');
export const handoffs = entityTable('handoffs');
export const imports = entityTable('imports');
export const tasks = entityTable('tasks');
// Additive October15 entities; old operational tables and rows remain unchanged.
export const customerSites = entityTable('customer_sites');
export const deliveryNeeds = entityTable('delivery_needs');
export const journeyRuns = entityTable('journey_runs');
export const visitEvents = entityTable('visit_events');
export const trackingSessions = entityTable('tracking_sessions');
export const trackingPoints = entityTable('tracking_points');
export const links = sqliteTable('entity_links', { id: text('id').primaryKey(), fromId: text('from_id').notNull().references(() => entities.id, { onDelete: 'cascade' }), toId: text('to_id').notNull().references(() => entities.id) }, t => [index('links_to').on(t.toId), index('links_from').on(t.fromId)]);
export const audit = sqliteTable('audit', { id: text('id').primaryKey(), datasetId: text('dataset_id').notNull().references(() => datasets.id), userId: text('user_id').notNull().references(() => members.userId), action: text('action').notNull(), recordId: text('record_id'), reason: text('reason'), details: text('details').notNull(), at: text('at').notNull() }, t => [index('audit_dataset_at').on(t.datasetId, t.at)]);
export const operations = sqliteTable('operations', { key: text('key').primaryKey(), datasetId: text('dataset_id').notNull().references(() => datasets.id), userId: text('user_id').notNull().references(() => members.userId), hash: text('hash').notNull(), result: text('result').notNull(), at: text('at').notNull() });
export const guards = sqliteTable('transaction_guards', { id: text('id').primaryKey(), ok: integer('ok').notNull() }, t => [check('revision_must_match', sql `${t.ok} = 1`)]);
export const backups = sqliteTable('backups', { id: text('id').primaryKey(), datasetId: text('dataset_id').notNull().references(() => datasets.id), objectKey: text('object_key').notNull(), at: text('at').notNull(), userId: text('user_id').notNull().references(() => members.userId) });
// ACCESS-DAF: additive access metadata. Existing operational identities and rows remain unchanged.
export const accessGrants = sqliteTable('access_grants', {
 id:text('id').primaryKey(),datasetId:text('dataset_id').notNull().unique().references(()=>datasets.id),active:integer('active').notNull().default(1),revision:integer('revision').notNull().default(1),startsAt:text('starts_at'),endsAt:text('ends_at'),unlimited:integer('unlimited').notNull().default(0),projectIds:text('project_ids').notNull(),warehouseIds:text('warehouse_ids').notNull(),resourceIds:text('resource_ids').notNull(),ceiling:text('ceiling').notNull(),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull().references(()=>members.userId),
},t=>[check('access_grant_active',sql`${t.active} IN (0,1)`),check('access_grant_unlimited',sql`${t.unlimited} IN (0,1)`),check('access_grant_expiry',sql`(${t.unlimited}=1 AND ${t.endsAt} IS NULL) OR (${t.unlimited}=0 AND ${t.endsAt} IS NOT NULL)`)]);
export const accessAccounts=sqliteTable('access_accounts',{
 userId:text('user_id').primaryKey().references(()=>members.userId),username:text('username').notNull().unique(),email:text('email').notNull().default(''),passwordHash:text('password_hash').notNull(),active:integer('active').notNull().default(1),revision:integer('revision').notNull().default(1),grantId:text('grant_id').references(()=>accessGrants.id),clientAdmin:integer('client_admin').notNull().default(0),startsAt:text('starts_at'),endsAt:text('ends_at'),unlimited:integer('unlimited').notNull().default(0),overrides:text('overrides').notNull().default('{}'),createdBy:text('created_by').notNull().references(()=>members.userId),updatedAt:text('updated_at').notNull(),
},t=>[check('access_account_active',sql`${t.active} IN (0,1)`),check('access_account_client_admin',sql`${t.clientAdmin} IN (0,1)`),check('access_account_unlimited',sql`${t.unlimited} IN (0,1)`),check('access_account_expiry',sql`(${t.unlimited}=1 AND ${t.endsAt} IS NULL) OR (${t.unlimited}=0 AND ${t.endsAt} IS NOT NULL)`)]);
export const accessSessions=sqliteTable('access_sessions',{id:text('id').primaryKey(),hash:text('hash').notNull().unique(),userId:text('user_id').notNull().references(()=>accessAccounts.userId),accountRevision:integer('account_revision').notNull(),grantRevision:integer('grant_revision').notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),revokedAt:text('revoked_at')},t=>[index('access_sessions_user').on(t.userId,t.revokedAt)]);
export const accessAudit=sqliteTable('access_audit',{id:text('id').primaryKey(),at:text('at').notNull(),actorId:text('actor_id').notNull().references(()=>members.userId),action:text('action').notNull(),targetId:text('target_id'),grantId:text('grant_id'),audience:text('audience').notNull(),reason:text('reason').notNull(),beforeJson:text('before_json').notNull(),afterJson:text('after_json').notNull(),outcome:text('outcome').notNull()},t=>[check('access_audit_audience',sql`${t.audience} IN ('owner','client')`),index('access_audit_grant').on(t.grantId,t.at)]);
export const accessSecurityEvents=sqliteTable('access_security_events',{id:text('id').primaryKey(),at:text('at').notNull(),event:text('event').notNull(),outcome:text('outcome').notNull(),userId:text('user_id'),subjectHash:text('subject_hash')},t=>[index('access_security_at').on(t.at)]);
export const accessLoginLimits=sqliteTable('access_login_limits',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:text('expires_at').notNull()});
