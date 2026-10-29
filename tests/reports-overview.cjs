const assert = require('node:assert/strict');
const {emptyState} = require('../.sites-runtime/test-reports-overview/model.js');
const {scopedState} = require('../.sites-runtime/test-reports-overview/access.js');
const {reportsOverview} = require('../.sites-runtime/test-reports-overview/reports-overview.js');

const row = (id, extra = {}) => ({id, code: id, ...extra});
const filters = extra => ({project: 'all', warehouse: 'all', query: '', queue: 'all', from: '', to: '', ...extra});
const metric = (report, key) => report.metrics.find(value => value.key === key);
const fixture = () => {
  const s = emptyState();
  s.projects.push(row('PROJECT-A', {name: 'Allowed project'}), row('PROJECT-B', {name: 'PRIVATE PROJECT'}));
  s.resources.push(row('COURIER-A', {name: 'Allowed courier'}), row('COURIER-B', {name: 'PRIVATE COURIER'}));
  s.customers.push(row('CLIENT', {name: 'Client'}));
  s.warehouses.push(row('WAREHOUSE-A', {name: 'Warehouse A'}));
  s.requests.push(row('REQ-OLD', {projectId: 'PROJECT-A', createdAt: '2026-09-01T08:00:00Z', status: 'arrived', customerId: 'CLIENT', destination: 'Cairo old-request address'}), row('REQ-TODAY', {projectId: 'PROJECT-A', createdAt: '2026-10-18T21:05:00Z', status: 'draft', customerId: 'CLIENT', destination: 'Cairo new-request address'}), row('REQ-PRIVATE', {projectId: 'PROJECT-B', createdAt: '2026-10-19T08:00:00Z', status: 'closed', destination: 'PRIVATE ADDRESS'}));
  s.tasks.push(row('TASK-A', {requestId: 'REQ-OLD', createdAt: '2026-10-19T07:00:00Z', executorId: 'COURIER-A', customerId: 'CLIENT', destination: 'Recorded actual address', status: 'arrived', taskType: 'delivery'}), row('TASK-B', {requestId: 'REQ-OLD', createdAt: '2026-10-18T12:00:00Z', executorId: 'COURIER-A', customerId: 'CLIENT', destination: 'Recorded actual address', status: 'planned', taskType: 'delivery'}), row('TASK-PRIVATE', {requestId: 'REQ-PRIVATE', createdAt: '2026-10-19T08:00:00Z', executorId: 'COURIER-B', status: 'arrived', taskType: 'delivery'}));
  s.journey_runs.push(row('JOURNEY-A', {name: 'Actual journey', executorId: 'COURIER-A', taskIds: ['TASK-A', 'TASK-B'], requestIds: ['REQ-OLD'], projectIds: ['PROJECT-A'], startedAt: '2026-10-19T07:30:00Z', date: '2026-10-19', status: 'in_transit'}), row('JOURNEY-PLAN', {executorId: 'COURIER-A', taskIds: ['TASK-B'], requestIds: ['REQ-OLD'], date: '2026-10-19', status: 'planned'}), row('JOURNEY-PRIVATE', {executorId: 'COURIER-B', taskIds: ['TASK-PRIVATE'], requestIds: ['REQ-PRIVATE'], projectIds: ['PROJECT-B'], startedAt: '2026-10-19T08:00:00Z', status: 'completed'}));
  s.visit_events.push(row('VISIT-A', {journeyId: 'JOURNEY-A', executorId: 'COURIER-A', taskIds: ['TASK-A', 'TASK-B'], requestIds: ['REQ-OLD'], projectIds: ['PROJECT-A'], arrivedAt: '2026-10-19T08:00:00Z', placeKind: 'customer', customerId: 'CLIENT', placeKey: 'client:cairo', addressSnapshot: 'Recorded actual address', outcome: 'partial'}), row('VISIT-PRIVATE', {journeyId: 'JOURNEY-PRIVATE', executorId: 'COURIER-B', taskIds: ['TASK-PRIVATE'], requestIds: ['REQ-PRIVATE'], projectIds: ['PROJECT-B'], arrivedAt: '2026-10-19T08:20:00Z', placeKind: 'customer', addressSnapshot: 'PRIVATE ADDRESS', outcome: 'completed'}));
  return s;
};
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('PASS', name); };

test('Each entity uses its own period, retaining current work on older requests', () => {
  const report = reportsOverview(fixture(), filters({project: 'PROJECT-A', from: '2026-10-19', to: '2026-10-19'}));
  assert.equal(metric(report, 'requests').value, 1);
  assert.equal(metric(report, 'tasks').value, 1);
  assert.equal(metric(report, 'journeys').value, 1);
  assert.equal(metric(report, 'visits').value, 1);
  assert.equal(metric(report, 'journeys').rows[0].requestCodes, 'REQ-OLD');
});
test('Cairo midnight defines request periods and exact activity drilldown IDs', () => {
  const report = reportsOverview(fixture(), filters({project: 'PROJECT-A', from: '2026-10-19', to: '2026-10-19'}));
  assert.deepEqual(report.activity, [{day: '2026-10-19', count: 1, ids: ['REQ-TODAY']}]);
  assert.deepEqual(report.requestStatuses, [{status: 'draft', count: 1, ids: ['REQ-TODAY']}]);
  assert.equal(metric(report, 'requests').rows[0].requestId, 'REQ-TODAY');
});
test('Task creation period does not borrow its parent request creation date', () => {
  const report = reportsOverview(fixture(), filters({project: 'PROJECT-A', from: '2026-10-18', to: '2026-10-18'}));
  assert.equal(metric(report, 'requests').value, 0);
  assert.deepEqual(metric(report, 'tasks').rows.map(value => value.id), ['TASK-B']);
});
test('Unstarted plans do not count as journeys or visits', () => {
  const s = fixture();
  s.journey_runs = s.journey_runs.filter(value => value.status === 'planned');
  s.visit_events = [];
  const report = reportsOverview(s, filters({project: 'PROJECT-A'}));
  assert.equal(metric(report, 'journeys').value, 0);
  assert.equal(metric(report, 'visits').value, 0);
});
test('Multi-product and batch delivery rows never multiply journeys or physical visits', () => {
  const s = fixture();
  s.deliveries.push(row('DELIVERY-1', {requestId: 'REQ-OLD', taskId: 'TASK-A', executorId: 'COURIER-A', batchId: 'BATCH-1', actualVisitId: 'VISIT-A', quantity: 3, createdAt: '2026-10-19T08:05:00Z'}), row('DELIVERY-2', {requestId: 'REQ-OLD', taskId: 'TASK-A', executorId: 'COURIER-A', batchId: 'BATCH-2', actualVisitId: 'VISIT-A', quantity: 2, createdAt: '2026-10-19T08:05:00Z'}));
  const report = reportsOverview(s, filters({project: 'PROJECT-A'}));
  assert.equal(metric(report, 'journeys').value, 1);
  assert.equal(metric(report, 'visits').value, 1);
});
test('Delivery without actual arrival evidence does not invent a visit', () => {
  const s = fixture(); s.visit_events = [];
  s.deliveries.push(row('DELIVERY', {requestId: 'REQ-OLD', taskId: 'TASK-A', executorId: 'COURIER-A', quantity: 5, createdAt: '2026-10-19T08:05:00Z'}));
  assert.equal(metric(reportsOverview(s, filters({project: 'PROJECT-A'})), 'visits').value, 0);
});
test('Duplicate IDs are counted once across each record collection', () => {
  const s = fixture();
  for (const key of ['requests', 'tasks', 'journey_runs', 'visit_events']) s[key].push({...s[key][0]});
  const report = reportsOverview(s, filters({project: 'PROJECT-A'}));
  assert.deepEqual(report.metrics.map(value => value.value), [2, 2, 1, 1]);
  assert.equal(report.activity.reduce((sum, item) => sum + item.count, 0), 2);
});
test('Separately recorded revisits remain separate visits to the same address', () => {
  const s = fixture();
  s.visit_events.push({...s.visit_events[0], id: 'VISIT-AGAIN', code: 'VISIT-AGAIN', arrivedAt: '2026-10-19T11:00:00Z'});
  assert.equal(metric(reportsOverview(s, filters({project: 'PROJECT-A'})), 'visits').value, 2);
});
test('Journeys count evidenced courier participations and label shared-route semantics', () => {
  const s = fixture();
  s.tasks.push(row('TASK-SECOND-COURIER', {requestId: 'REQ-OLD', executorId: 'COURIER-B', createdAt: '2026-10-19T07:00:00Z', routeId: 'SHARED', taskType: 'delivery'}));
  s.tasks[0].routeId = 'SHARED';
  s.journey_runs = [];
  s.routes.push(row('SHARED', {status: 'in_transit', departedAt: '2026-10-19T07:30:00Z'}));
  const value = metric(reportsOverview(s, filters({project: 'PROJECT-A'})), 'journeys');
  assert.equal(value.value, 2);
  assert(value.definitionAr.includes('مشاركة لكل مندوب'));
  assert(value.rows.every(item => item.source === 'legacy'));
});
test('Evidenced legacy task arrivals at the same place and time deduplicate across products', () => {
  const s = fixture(); s.visit_events = [];
  for (const task of s.tasks.filter(value => value.requestId === 'REQ-OLD')) task.arrivedAt = '2026-10-19T08:00:00Z';
  const report = reportsOverview(s, filters({project: 'PROJECT-A'}));
  assert.equal(metric(report, 'visits').value, 1);
  assert(report.warnings.some(value => value.en.includes('legacy')));
});
test('A later visit does not move an earlier journey departure into the visit period', () => {
  const s = fixture(); s.journey_runs[0].startedAt = '2026-10-18T15:00:00Z';
  const report = reportsOverview(s, filters({project: 'PROJECT-A', from: '2026-10-19', to: '2026-10-19'}));
  assert.equal(metric(report, 'journeys').value, 0);
  assert.equal(metric(report, 'visits').value, 1);
});
test('Loaded empty sources are real zeroes; omitted sources are unavailable', () => {
  assert(reportsOverview(emptyState(), filters()).metrics.every(value => value.value === 0));
  assert(reportsOverview({}, filters()).metrics.every(value => value.value === null));
  const partial = reportsOverview({requests: []}, filters());
  assert.equal(metric(partial, 'requests').value, 0);
  assert.equal(metric(partial, 'tasks').value, null);
  assert.equal(metric(partial, 'journeys').value, null);
});
test('Only undated requests or tasks in an active period show unavailable, never zero', () => {
  const s = emptyState();
  s.requests.push(row('REQ', {status: 'draft'})); s.tasks.push(row('TASK', {requestId: 'REQ', createdAt: 'invalid'}));
  const report = reportsOverview(s, filters({from: '2026-10-19', to: '2026-10-19'}));
  assert.equal(metric(report, 'requests').value, null); assert.equal(metric(report, 'requests').unknownDates, 1);
  assert.equal(metric(report, 'tasks').value, null); assert.equal(metric(report, 'tasks').unknownDates, 1);
  assert.deepEqual(report.activity, []);
});
test('Undated request records can count all-time without fabricating a timeline date', () => {
  const s = emptyState(); s.requests.push(row('REQ', {status: 'draft'}));
  const report = reportsOverview(s, filters());
  assert.equal(metric(report, 'requests').value, 1);
  assert.deepEqual(report.activity, []);
  assert.equal(metric(report, 'requests').rows[0].at, '');
});
test('Invalid event dates remain unknown instead of rolling impossible dates into March', () => {
  const s = emptyState(); s.requests.push(row('REQ', {createdAt: '2026-02-30T08:00:00Z'}));
  const report = reportsOverview(s, filters({from: '2026-03-02', to: '2026-03-02'}));
  assert.equal(metric(report, 'requests').value, null);
  assert.equal(metric(report, 'requests').unknownDates, 1);
  assert.deepEqual(report.activity, []);
});
test('Actual-status journeys and visit-ledger records missing timestamps disclose unavailable', () => {
  const s = fixture(); s.journey_runs[0].startedAt = ''; s.visit_events[0].arrivedAt = '';
  const report = reportsOverview(s, filters({project: 'PROJECT-A'}));
  assert.equal(metric(report, 'journeys').value, null); assert.equal(metric(report, 'journeys').unknownDates, 1);
  assert.equal(metric(report, 'visits').value, null); assert.equal(metric(report, 'visits').unknownDates, 1);
});
test('Partial known timestamps count only evidenced rows with an explicit warning', () => {
  const s = fixture(); s.requests.push(row('REQ-UNDATED', {projectId: 'PROJECT-A', status: 'review'}));
  const report = reportsOverview(s, filters({project: 'PROJECT-A', from: '2026-10-19', to: '2026-10-19'}));
  assert.equal(metric(report, 'requests').value, 1); assert.equal(metric(report, 'requests').unknownDates, 1);
  assert(report.warnings.some(value => value.en.includes('excluded from period')));
});
test('Request search, queue and project context constrain every metric and drilldown', () => {
  const report = reportsOverview(fixture(), filters({project: 'PROJECT-A', queue: 'draft', query: 'new-request'}));
  assert.deepEqual(report.metrics.map(value => value.value), [1, 0, 0, 0]);
  assert.equal(metric(report, 'requests').rows[0].id, 'REQ-TODAY');
});
test('Warehouse selection retains the existing related-request meaning with a clear note', () => {
  const s = fixture(); s.tasks[0].warehouseId = 'WAREHOUSE-A';
  const report = reportsOverview(s, filters({warehouse: 'WAREHOUSE-A'}));
  assert.deepEqual(metric(report, 'requests').rows.map(value => value.id), ['REQ-OLD']);
  assert.equal(metric(report, 'tasks').value, 2);
  assert(report.warnings.some(value => value.en.includes('warehouse filter')));
});
test('Scoped snapshots never regain hidden projects, tasks, addresses or courier records', () => {
  const s = fixture();
  const snapshot = scopedState(s, {userId: 'reviewer', name: 'Reviewer', role: 'contributor', function: 'operations', active: 1, projectIds: ['PROJECT-A']});
  const report = reportsOverview(snapshot, filters());
  const serialized = JSON.stringify(report);
  for (const hidden of ['REQ-PRIVATE', 'TASK-PRIVATE', 'JOURNEY-PRIVATE', 'VISIT-PRIVATE', 'PRIVATE ADDRESS', 'PRIVATE COURIER', 'PRIVATE PROJECT']) assert(!serialized.includes(hidden), hidden);
  assert.deepEqual(report.metrics.map(value => value.value), [2, 2, 1, 1]);
});
test('Representative task scopes stay inherited, including cross-request journey pruning', () => {
  const s = fixture();
  s.tasks.push(row('TASK-OTHER-PERSON', {requestId: 'REQ-OLD', executorId: 'COURIER-B', createdAt: '2026-10-19T08:00:00Z'}));
  const snapshot = scopedState(s, {userId: 'courier', name: 'Courier', role: 'contributor', function: 'representative', active: 1, projectIds: ['PROJECT-A'], resourceIds: ['COURIER-A']});
  const report = reportsOverview(snapshot, filters());
  assert.equal(metric(report, 'tasks').value, 2);
  assert(!JSON.stringify(report).includes('TASK-OTHER-PERSON'));
});
test('Returned rows are independent read projections and repeated reads never mutate input', () => {
  const s = fixture(), before = JSON.stringify(s);
  const report = reportsOverview(s, filters());
  for (const item of report.metrics) for (const record of item.rows) { record.name = 'changed preview'; if (record.requestIds) record.requestIds.push('NEW'); }
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(reportsOverview(s, filters()), reportsOverview(s, filters()));
});
test('Reversed and impossible date ranges fail explicitly', () => {
  assert.throws(() => reportsOverview(emptyState(), filters({from: '2026-10-20', to: '2026-10-19'})));
  assert.throws(() => reportsOverview(emptyState(), filters({from: '2026-02-30'})));
});
console.log(JSON.stringify({suite: 'Read-only operational overview with exact source drilldowns', pass, fail: 0}));
