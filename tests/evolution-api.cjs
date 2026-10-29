const assert = require('node:assert/strict');
module.exports = async function evolutionApi({ mf, db, migrations }) {
    let pass = 0;
    const check = (name, value) => { assert.ok(value, name); pass++; console.log('PASS', name); };
    const api = async (path, body, user = 'owner', extra = {}) => {
        const headers = { ...(user ? { 'oai-authenticated-user-id': 'evolution-' + user, 'oai-authenticated-user-email': user + '@evolution.test' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra };
        const response = await mf.dispatchFetch('http://evolution.local' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
        const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = { body: raw }; }
        return { status: response.status, data };
    };
    const snap = async (user = 'owner') => { const out = await api('/api/command-center/state', null, user); assert.equal(out.status, 200, JSON.stringify(out.data)); return out.data; };
    const cmd = async (command, user = 'owner', operationId = crypto.randomUUID(), version) => api('/api/command-center/action', { command, operationId, version: version ?? (await snap()).dataset.version }, user);
    const go = async (command, user = 'owner') => { const out = await cmd(command, user); assert.equal(out.status, 200, JSON.stringify({ command, ...out })); return out.data; };
    const tracking = (command, user = 'rep', operationId = crypto.randomUUID(), extra = {}) => api('/api/tracking', { command, operationId }, user, extra);
    check('all local migrations include the additive workflow/GPS schema', migrations.length >= 3 && migrations.some(x => x.startsWith('0002')));
    check('anonymous state and tracking reads are denied', (await api('/api/command-center/state', null, null)).status === 401 && (await api('/api/tracking?journeyId=unknown', null, null)).status === 401);
    await snap(); await go({ type: 'seed' });
    let s = (await snap()).state;
    const p = s.products[0], projectId = p.projectId, otherProjectId = s.projects.find(x => x.id !== projectId).id, w = s.warehouses[0], w2 = s.warehouses[1], e = s.resources[0], e2 = s.resources[1], customer = s.customers[0], carrier = s.carriers[0];
    const addMember = async (name, role, fn, ids, resourceIds = null, warehouseIds = null) => db.batch([
        db.prepare('INSERT INTO members(user_id,name,role,function,active) VALUES (?,?,?,?,1)').bind('evolution-' + name, 'DEMO ' + name, role, fn),
        db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').bind('member_scope:evolution-' + name, JSON.stringify(ids)),
        db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').bind('member_operations:evolution-' + name, JSON.stringify({ warehouseIds, resourceIds }))
    ]);
    for (const [name, role, fn, ids, resourceIds, warehouseIds] of [
        ['pm','contributor','project_manager',[projectId]], ['ops','contributor','operations',[projectId]], ['dispatch','contributor','dispatcher',[projectId]],
        ['keeper','contributor','warehouse',[projectId],null,[w.id]], ['keeper2','contributor','warehouse',[projectId],null,[w2.id]], ['rep','contributor','representative',[projectId],[e.id]], ['rep2','contributor','representative',[projectId],[e2.id]],
        ['viewer','viewer','all',[projectId]], ['manager','manager','all',[projectId]], ['managerW1','manager','all',[projectId],null,[w.id]], ['managerW2','manager','all',[projectId],null,[w2.id]], ['other','manager','all',[otherProjectId]]
    ]) await addMember(name, role, fn, ids, resourceIds, warehouseIds);
    const customer2 = await go({ type: 'master', kind: 'customers', data: { code: 'DEMO-API-C2', name: 'DEMO second customer' } });
    const site1 = await go({ type: 'save_customer_site', customerId: customer.id, projectId, name: 'DEMO first branch', address: 'DEMO Cairo address' }, 'pm');
    const site2 = await go({ type: 'save_customer_site', customerId: customer2.id, projectId, name: 'DEMO second branch', address: 'DEMO Giza address' }, 'pm');
    check('project-scoped PM can save two customer sites', (await snap('pm')).state.customer_sites.length === 2);
    check('site save rejects another project scope', (await cmd({ type: 'save_customer_site', customerId: customer.id, projectId: otherProjectId, name: 'DEMO forbidden', address: 'DEMO forbidden' }, 'pm')).status === 403);
    const needs = [{ productId: p.id, customerId: customer.id, siteId: site1.id, quantity: 6 }, { productId: p.id, customerId: customer2.id, siteId: site2.id, quantity: 4 }];
    const r = await go({ type: 'create_request', requestType: 'delivery', code: 'DEMO-EV-REQ-1', projectId, needs }, 'pm');
    s = (await snap()).state;
    const line = s.lines.find(x => x.requestId === r.id), demands = s.delivery_needs.filter(x => x.requestId === r.id);
    check('one header aggregates two customer needs into one product quantity', s.requests.filter(x => x.code === 'DEMO-EV-REQ-1').length === 1 && line.quantity === 10 && demands.length === 2 && s.journey_runs.length === 0);
    check('saved address snapshot belongs to the correct customer', demands.some(x => x.customerId === customer.id && x.addressSnapshot === 'DEMO Cairo address') && demands.some(x => x.customerId === customer2.id && x.addressSnapshot === 'DEMO Giza address'));
    await go({ type: 'save_customer_site', id: site1.id, customerId: customer.id, projectId, name: 'DEMO renamed branch', address: 'DEMO changed directory address' }, 'pm');
    check('editing directory does not rewrite historical need snapshot', (await snap()).state.delivery_needs.find(x => x.id === demands.find(n => n.customerId === customer.id).id).addressSnapshot === 'DEMO Cairo address');
    await go({ type: 'edit_request', requestId: r.id, notes: 'DEMO persisted draft edit' }, 'pm');
    check('authorized draft edits persist', (await snap('pm')).state.requests.find(x => x.id === r.id).notes === 'DEMO persisted draft edit');
    check('viewer cannot edit and outsider cannot read request', (await cmd({ type: 'edit_request', requestId: r.id, notes: 'Forbidden' }, 'viewer')).status === 403 && !(await snap('other')).state.requests.some(x => x.id === r.id));
    await go({ type: 'submit', requestId: r.id }, 'pm'); await go({ type: 'approve', requestId: r.id }, 'ops');
    s = (await snap()).state;
    check('operations approval approves the customer quotas', s.delivery_needs.filter(x => x.requestId === r.id).every(x => x.approved && x.status === 'approved'));
    const allocations = demands.map(n => ({ needId: n.id, lineId: line.id, quantity: n.quantity, customerId: n.customerId, destination: n.addressSnapshot, executorId: e.id, sourceWarehouseId: w.id, carrierId: carrier.id }));
    const beforeInvalid = (await snap()).dataset.version;
    check('over-quota allocation fails atomically', (await cmd({ type: 'plan_allocations', requestId: r.id, rows: [{ ...allocations[0], quantity: 7 }, { ...allocations[1], quantity: 3 }] }, 'dispatch')).status === 400 && (await snap()).dataset.version === beforeInvalid);
    await go({ type: 'plan_allocations', requestId: r.id, rows: allocations }, 'dispatch');
    s = (await snap()).state; const tasks = s.tasks.filter(t => t.requestId === r.id && t.taskType === 'delivery');
    await go({ type: 'reserve', requestId: r.id, batchRows: tasks.map(t => ({ taskId: t.id, lineId: line.id, quantity: t.quantity, warehouseId: w.id, executorId: e.id, batchId: '' })) }, 'dispatch');
    await go({ type: 'verify_documents', requestId: r.id }, 'ops');
    const route = await go({ type: 'create_route', taskIds: tasks.map(t => t.id), code: 'DEMO-EV-ROUTE-1', name: 'DEMO combined stops' }, 'dispatch');
    s = (await snap()).state;
    for (const reservation of s.reservations.filter(x => x.requestId === r.id)) {
        const release = await go({ type: 'warehouse_release', requestId: r.id, reservationId: reservation.id, quantity: reservation.quantity }, 'keeper');
        await go({ type: 'courier_collect', requestId: r.id, loadingId: release.id, quantity: reservation.quantity }, 'rep');
    }
    const journey = await go({ type: 'plan_journey', executorId: e.id, taskIds: tasks.map(t => t.id), routeId: route.id, code: 'DEMO-EV-JOURNEY-1', name: 'DEMO physical departure' }, 'dispatch');
    check('planning a journey does not count an actual departure', (await snap()).state.journey_runs.find(x => x.id === journey.id).status === 'planned');
    check('planned journey GPS is rejected', (await tracking({ type: 'tracking_start', journeyId: journey.id, consent: true })).status === 409);
    check('other courier cannot start this journey', (await cmd({ type: 'start_journey', journeyId: journey.id }, 'rep2')).status === 403);
    await go({ type: 'start_journey', journeyId: journey.id }, 'rep');
    const locationStart = { type: 'tracking_start', journeyId: journey.id, consent: true };
    check('GPS owner and manager cannot publish without explicit courier binding', (await tracking(locationStart, 'owner')).status === 403 && (await tracking(locationStart, 'manager')).status === 403);
    check('GPS requires consent and protects origin', (await tracking({ type: 'tracking_start', journeyId: journey.id })).status === 400 && (await tracking(locationStart, 'rep', crypto.randomUUID(), { origin: 'https://outside.example', 'sec-fetch-site': 'cross-site' })).status === 403);
    const start = await tracking(locationStart); assert.equal(start.status, 200, JSON.stringify(start)); const sessionId = start.data.id;
    const sample = { type: 'tracking_point', sessionId, seq: 1, latitude: 30.05, longitude: 31.24, accuracy: 15, recordedAt: new Date().toISOString() }, operationId = crypto.randomUUID();
    const initial = await snap();
    const first = await tracking(sample, 'rep', operationId), replay = await tracking(sample, 'rep', operationId); assert.equal(first.status, 200, JSON.stringify(first));
    s = (await snap()).state;
    check('GPS endpoint persists a sample once on idempotent retry', replay.status === 200 && replay.data.replayed && s.tracking_points.filter(x => x.sessionId === sessionId).length === 1);
    check('location recording never creates arrival or stock movement', s.movements.length === initial.state.movements.length && s.visit_events.length === initial.state.visit_events.length && s.journey_runs.find(x => x.id === journey.id).status === 'in_transit');
    const ownerGps = await api('/api/tracking?journeyId=' + journey.id), dispatchGps = await api('/api/tracking?journeyId=' + journey.id, null, 'dispatch'), managerGps = await api('/api/tracking?journeyId=' + journey.id, null, 'manager');
    check('scoped owner, manager and dispatcher can see last position', ownerGps.status === 200 && ownerGps.data.points.length === 1 && dispatchGps.data.points.length === 1 && managerGps.data.points.length === 1);
    check('warehouse-scoped manager sees only a wholly permitted GPS journey', (await api('/api/tracking?journeyId=' + journey.id, null, 'managerW1')).data.points.length === 1 && (await api('/api/tracking?journeyId=' + journey.id, null, 'managerW2')).data.points.length === 0 && (await snap('managerW2')).state.tracking_points.length === 0);
    check('viewer, unrelated courier, PM and another project cannot see GPS', (await api('/api/tracking?journeyId=' + journey.id, null, 'viewer')).data.points.length === 0 && (await api('/api/tracking?journeyId=' + journey.id, null, 'rep2')).data.points.length === 0 && (await api('/api/tracking?journeyId=' + journey.id, null, 'pm')).data.points.length === 0 && (await api('/api/tracking?journeyId=' + journey.id, null, 'other')).data.points.length === 0);
    check('ordinary state endpoint also filters GPS from non-supervisory users', (await snap('viewer')).state.tracking_points.length === 0 && (await snap('pm')).state.tracking_sessions.length === 0);
    check('another courier cannot stop or send a sample for this consent session', (await tracking({ type: 'tracking_stop', sessionId }, 'rep2')).status === 403 && (await tracking({ ...sample, seq: 2 }, 'rep2')).status === 403);
    check('malformed coordinates, missing operation and unrelated commands are rejected', (await tracking({ ...sample, latitude: 91 })).status === 400 && (await api('/api/tracking', { command: sample }, 'rep')).status === 400 && (await tracking({ type: 'master', kind: 'resources', data: {} })).status === 400);
    const arrival = await go({ type: 'arrive_visit', journeyId: journey.id, taskIds: [tasks[0].id], placeRole: 'destination' }, 'rep');
    check('actual visit records customer address and courier separately from planned stops', (await snap()).state.visit_events.some(x => x.id === arrival.id && x.journeyId === journey.id && x.customerId === tasks[0].customerId && x.addressSnapshot === tasks[0].destination));
    await go({ type: 'leave_visit', visitId: arrival.id, outcome: 'failed', reason: 'DEMO customer unavailable' }, 'rep');
    const revisit = await go({ type: 'arrive_visit', journeyId: journey.id, taskIds: [tasks[0].id], placeRole: 'destination' }, 'rep');
    check('revisiting same place creates another actual visit', revisit.id !== arrival.id && (await snap()).state.visit_events.filter(x => x.journeyId === journey.id).length === 2);
    await go({ type: 'leave_visit', visitId: revisit.id, outcome: 'partial', reason: 'DEMO retry ended without completing request' }, 'rep');
    await go({ type: 'end_journey', journeyId: journey.id, reason: 'DEMO completed departure with work remaining' }, 'rep');
    s = (await snap()).state;
    check('ending journey stops GPS and preserves history without closing remaining order', s.tracking_sessions.find(x => x.id === sessionId).status === 'stopped' && s.tracking_points.filter(x => x.sessionId === sessionId).length === 1 && s.requests.find(x => x.id === r.id).status !== 'closed');
    check('GPS samples after journey end are rejected', (await tracking({ ...sample, seq: 2 })).status === 409);
    // A second, genuinely shared request proves recipient corrections and global exports are scoped.
    const shared = await go({ type: 'create_request', requestType: 'delivery', code: 'DEMO-EV-SHARED', projectId, needs: needs.map(n => ({ ...n, quantity: 1 })) }, 'pm');
    await go({ type: 'submit', requestId: shared.id }, 'pm'); await go({ type: 'approve', requestId: shared.id }, 'ops');
    s = (await snap()).state;
    const sharedLine = s.lines.find(x => x.requestId === shared.id), sharedNeeds = s.delivery_needs.filter(x => x.requestId === shared.id);
    await go({ type: 'plan_allocations', requestId: shared.id, rows: sharedNeeds.map(n => ({ needId: n.id, lineId: sharedLine.id, quantity: 1, customerId: n.customerId, destination: n.addressSnapshot, executorId: n.customerId === customer.id ? e.id : e2.id, sourceWarehouseId: w.id, carrierId: carrier.id })) }, 'dispatch');
    s = (await snap()).state; const sharedTasks = s.tasks.filter(t => t.requestId === shared.id && t.taskType === 'delivery');
    await go({ type: 'reserve', requestId: shared.id, batchRows: sharedTasks.map(t => ({ taskId: t.id, lineId: sharedLine.id, quantity: 1, warehouseId: w.id, executorId: t.executorId, batchId: '' })) }, 'dispatch');
    await go({ type: 'verify_documents', requestId: shared.id }, 'ops');
    const sharedRoute = await go({ type: 'create_route', taskIds: sharedTasks.map(t => t.id), code: 'DEMO-EV-SHARED-ROUTE', name: 'DEMO shared task plan' }, 'dispatch');
    s = (await snap()).state;
    for (const reservation of s.reservations.filter(x => x.requestId === shared.id)) {
        const released = await go({ type: 'warehouse_release', requestId: shared.id, reservationId: reservation.id, quantity: 1 }, 'keeper');
        await go({ type: 'courier_collect', requestId: shared.id, loadingId: released.id, quantity: 1 }, reservation.executorId === e.id ? 'rep' : 'rep2');
    }
    const secondTask = sharedTasks.find(t => t.executorId === e2.id), secondReservation = (await snap()).state.reservations.find(x => x.taskId === secondTask.id);
    const privateJourney = await go({ type: 'plan_journey', executorId: e2.id, taskIds: [secondTask.id], routeId: sharedRoute.id, code: 'DEMO-EV-PRIVATE-JOURNEY', name: 'DEMO second courier departure' }, 'dispatch');
    await go({ type: 'start_journey', journeyId: privateJourney.id }, 'rep2');
    await go({ type: 'arrive_visit', journeyId: privateJourney.id, taskIds: [secondTask.id], placeRole: 'destination' }, 'rep2');
    await go({ type: 'deliver', requestId: shared.id, taskId: secondTask.id, reservationId: secondReservation.id, quantity: 1, recipient: 'DEMO PRIVATE ORIGINAL E2 RECIPIENT' }, 'rep2');
    const privateDelivery = (await snap()).state.deliveries.find(d => d.taskId === secondTask.id);
    const correction = await go({ type: 'propose_correction', requestId: shared.id, kind: 'deliveries', recordId: privateDelivery.id, patch: { recipient: 'DEMO PRIVATE CORRECTED E2 RECIPIENT' }, reason: 'DEMO descriptive recipient correction' });
    await go({ type: 'review_correction', requestId: shared.id, approvalId: correction.id, decision: 'approve' }, 'ops');
    const firstCourier = await snap('rep'), secondCourier = await snap('rep2'), firstSerialized = JSON.stringify(firstCourier);
    check('shared request remains visible while another courier recipient correction stays private', firstCourier.state.requests.some(x => x.id === shared.id) && !firstCourier.state.approvals.some(x => x.id === correction.id) && !firstSerialized.includes('DEMO PRIVATE ORIGINAL E2 RECIPIENT') && !firstSerialized.includes('DEMO PRIVATE CORRECTED E2 RECIPIENT'));
    check('the assigned courier retains its correction and delivery scope', secondCourier.state.approvals.some(x => x.id === correction.id) && secondCourier.state.deliveries.some(x => x.id === privateDelivery.id));
    check('shared request header contains only this courier destinations', firstCourier.state.requests.find(x => x.id === shared.id).destination.includes('DEMO changed directory address') && !firstCourier.state.requests.find(x => x.id === shared.id).destination.includes('DEMO Giza address'));
    const deniedExport = await api('/api/export', { kind: 'journey_details', columns: ['code','executor','requestCodes'], scope: 'selected', ids: [privateJourney.id], preview: true }, 'rep');
    check('global export refuses a selected journey outside courier scope', deniedExport.status === 403);
    const allExport = await api('/api/export', { kind: 'customer_deliveries', columns: ['code','executor','recipient'], scope: 'all', version: (await snap()).dataset.version, format: 'csv' }, 'rep');
    check('global all-records export excludes another courier recipients', allExport.status === 200 && !allExport.data.body.includes('DEMO PRIVATE ORIGINAL E2 RECIPIENT') && !allExport.data.body.includes('DEMO PRIVATE CORRECTED E2 RECIPIENT'));
    check('arbitrary GPS table export is not exposed', (await api('/api/export', { kind: 'tracking_points', columns: ['latitude'], scope: 'all', preview: true }, 'viewer')).status === 400);
    // Mixed-warehouse GPS is deliberately indivisible: one allowed task cannot reveal the whole location trail.
    await go({ type: 'opening', productCode: p.code, warehouseId: w2.id, quantity: 10, reason: 'DEMO mixed-warehouse GPS fixture' });
    const mixed = await go({ type: 'create_request', requestType: 'delivery', code: 'DEMO-EV-MIXED-WH', projectId, needs: needs.map(n => ({ ...n, quantity: 1 })) }, 'pm');
    await go({ type: 'submit', requestId: mixed.id }, 'pm'); await go({ type: 'approve', requestId: mixed.id }, 'ops');
    s = (await snap()).state;
    const mixedLine = s.lines.find(x => x.requestId === mixed.id), mixedNeeds = s.delivery_needs.filter(x => x.requestId === mixed.id);
    await go({ type: 'plan_allocations', requestId: mixed.id, rows: mixedNeeds.map(n => ({ needId: n.id, lineId: mixedLine.id, quantity: 1, customerId: n.customerId, destination: n.addressSnapshot, executorId: e.id, sourceWarehouseId: n.customerId === customer.id ? w.id : w2.id, carrierId: carrier.id })) }, 'dispatch');
    s = (await snap()).state; const mixedTasks = s.tasks.filter(t => t.requestId === mixed.id && t.taskType === 'delivery');
    await go({ type: 'reserve', requestId: mixed.id, batchRows: mixedTasks.map(t => ({ taskId: t.id, lineId: mixedLine.id, quantity: 1, warehouseId: t.sourceWarehouseId, executorId: e.id, batchId: '' })) }, 'dispatch');
    await go({ type: 'verify_documents', requestId: mixed.id }, 'ops');
    const mixedRoute = await go({ type: 'create_route', taskIds: mixedTasks.map(t => t.id), code: 'DEMO-EV-MIXED-ROUTE', name: 'DEMO mixed warehouse route' }, 'dispatch');
    s = (await snap()).state;
    for (const reservation of s.reservations.filter(x => x.requestId === mixed.id)) {
        const released = await go({ type: 'warehouse_release', requestId: mixed.id, reservationId: reservation.id, quantity: 1 }, reservation.warehouseId === w.id ? 'keeper' : 'keeper2');
        await go({ type: 'courier_collect', requestId: mixed.id, loadingId: released.id, quantity: 1 }, 'rep');
    }
    const mixedJourney = await go({ type: 'plan_journey', executorId: e.id, taskIds: mixedTasks.map(t => t.id), routeId: mixedRoute.id, code: 'DEMO-EV-MIXED-JOURNEY', name: 'DEMO indivisible GPS scope' }, 'dispatch');
    await go({ type: 'start_journey', journeyId: mixedJourney.id }, 'rep');
    const mixedSession = await tracking({ type: 'tracking_start', journeyId: mixedJourney.id, consent: true }); assert.equal(mixedSession.status, 200, JSON.stringify(mixedSession));
    const mixedPoint = await tracking({ type: 'tracking_point', sessionId: mixedSession.data.id, seq: 1, latitude: 30.06, longitude: 31.25, accuracy: 15, recordedAt: new Date().toISOString() }); assert.equal(mixedPoint.status, 200, JSON.stringify(mixedPoint));
    check('partial cross-warehouse permissions cannot reveal any mixed journey GPS', (await api('/api/tracking?journeyId=' + mixedJourney.id, null, 'managerW1')).data.points.length === 0 && (await api('/api/tracking?journeyId=' + mixedJourney.id, null, 'managerW2')).data.points.length === 0 && !(await snap('managerW1')).state.tracking_points.some(p => p.journeyId === mixedJourney.id));
    check('unrestricted supervisory permission can read the mixed journey GPS', (await api('/api/tracking?journeyId=' + mixedJourney.id, null, 'manager')).data.points.length === 1);
    const raceCommand = { type: 'save_customer_site', customerId: customer.id, projectId, name: 'DEMO CAS branch', address: 'DEMO CAS address' }, raceVersion = (await snap()).dataset.version;
    const [race1,race2] = await Promise.all([cmd(raceCommand,'pm',crypto.randomUUID(),raceVersion),cmd({...raceCommand,name:'DEMO second CAS contender'},'pm',crypto.randomUUID(),raceVersion)]);
    check('concurrent writes retain compare-and-swap isolation', [race1.status,race2.status].sort().join(',') === '200,409');
    const artifacts = await db.prepare('SELECT count(*) as count FROM tracking_points').first();
    check('local D1 contains exactly the two accepted GPS samples', artifacts.count === 2);
    console.log(JSON.stringify({ suite: 'Evolution local Worker/D1/R2 integration; simulated identities and coordinates', pass, fail: 0, actualPhoneVerified: false, liveDataTouched: false }));
};
