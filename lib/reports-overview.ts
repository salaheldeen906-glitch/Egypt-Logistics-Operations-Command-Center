import {type Filters, filterRequests} from './insights';
import {type State, type Row, kinds, emptyState, demand} from './model';
import {travelReport} from './travel-report';

export type OverviewMetricKey = 'requests' | 'tasks' | 'journeys' | 'visits';
export type OverviewMetric = {
  key: OverviewMetricKey;
  labelAr: string;
  labelEn: string;
  value: number | null;
  definitionAr: string;
  definitionEn: string;
  dateBasisAr: string;
  dateBasisEn: string;
  unknownDates: number;
  rows: Row[];
};
export type ReportsOverview = {
  metrics: OverviewMetric[];
  requestStatuses: {status: string; count: number; ids: string[]}[];
  activity: {day: string; count: number; ids: string[]}[];
  range: {from: string; to: string};
  warnings: {ar: string; en: string}[];
};

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
});

function calendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Blank/invalid event dates remain unknown, never the current day. */
function eventDay(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return calendarDay(text) ? text : '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && !calendarDay(text.slice(0, 10))) return '';
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? formatter.format(parsed) : '';
}

function uniqueRows(rows: Row[]): Row[] {
  const found = new Set<string>();
  return rows.filter(record => {
    if (!record || typeof record.id !== 'string' || !record.id || found.has(record.id)) return false;
    found.add(record.id);
    return true;
  });
}

/**
 * A read projection of an already authorized snapshot. This function does not
 * load data, widen permission scopes, write state, or create sample records.
 * Project/warehouse/search/queue select request context; every metric then uses
 * its own event date, rather than filtering old requests out of today's work.
 */
export function reportsOverview(input: Partial<State>, filters: Filters): ReportsOverview {
  const f: Filters = Object.assign({project: 'all', warehouse: 'all', query: '', from: '', to: '', queue: 'all'}, filters);
  demand(['project', 'warehouse', 'query', 'from', 'to', 'queue'].every(key => typeof (f as any)[key] === 'string'), 'Invalid overview filters');
  demand(!f.from || calendarDay(f.from), 'Invalid overview start date');
  demand(!f.to || calendarDay(f.to), 'Invalid overview end date');
  demand(!f.from || !f.to || f.from <= f.to, 'Invalid overview date range');
  const s = emptyState();
  // Keep absent collections distinguishable from loaded, genuinely empty ones.
  const loaded = (key: keyof State) => Array.isArray(input[key]);
  for (const key of kinds) s[key] = uniqueRows(loaded(key) ? input[key]! : []);
  const contextualRequests = filterRequests(s, {...f, from: '', to: ''});
  const requestIds = new Set(contextualRequests.map(record => record.id));
  const requestById = new Map(s.requests.map(record => [record.id, record]));
  const requestCode = (id: string) => requestById.get(id)?.code || id;
  const name = (key: keyof State, id: unknown) => s[key].find(record => record.id === id)?.name || '';
  const warnings: ReportsOverview['warnings'] = [];
  const hasPeriod = !!(f.from || f.to);
  const inRange = (day: string) => !!day && (!f.from || day >= f.from) && (!f.to || day <= f.to);
  const status = (record: Row) => typeof record.status === 'string' && record.status.trim() ? record.status : 'unknown';

  const requestRows: Row[] = contextualRequests.map(record => ({
    id: record.id, code: record.code, status: status(record), at: eventDay(record.createdAt) ? record.createdAt : '',
    createdAt: record.createdAt || '', requestId: record.id, requestIds: [record.id], requestCodes: record.code || record.id,
    projectId: record.projectId || '', project: name('projects', record.projectId), requestType: record.requestType || '',
    address: record.destinationSnapshot || record.destination || '',
    name: name('customers', record.customerId) || record.supplierName || name('projects', record.projectId),
  }));
  const taskRows: Row[] = s.tasks.filter(record => requestIds.has(record.requestId)).map(record => ({
    id: record.id, code: record.code, status: status(record), at: eventDay(record.createdAt) ? record.createdAt : '',
    createdAt: record.createdAt || '', requestId: record.requestId, requestIds: [record.requestId], requestCodes: requestCode(record.requestId),
    taskType: record.taskType || '', executorId: record.executorId || '', executor: name('resources', record.executorId),
    address: record.addressSnapshot || record.destinationSnapshot || record.destination || '',
    name: record.name || name('resources', record.executorId),
  }));

  // No date filter here: travelReport can retain a journey because of a later
  // visit. The start/arrival date must be tested independently for this metric.
  const travel = travelReport(s, {requestIds: [...requestIds]});
  const journeyRows: Row[] = uniqueRows(travel.journeys).filter(record =>
    !!record.startedAt || ['in_transit', 'completed', 'closed'].includes(record.status)
  ).map(record => ({
    id: record.id, code: record.code, status: status(record), statusLabel: record.statusLabel || '',
    at: eventDay(record.startedAt) ? record.startedAt : '', startedAt: record.startedAt || '',
    requestIds: record.requestIds || [], requestCodes: record.requestCodes || '',
    taskIds: record.taskIds || [], taskCodes: record.taskCodes || '', executorId: record.executorId || '', executor: record.executor || '',
    name: record.name || record.executor || '',
    address: (record.actualPlaces || []).map((place: any) => place.address).filter(Boolean).join(' · '),
    source: record.source || '', timingNote: record.timingNote || '',
  }));
  const visitRows: Row[] = uniqueRows(travel.visits).map(record => ({
    id: record.id, code: record.code, status: record.outcome || 'unknown', statusLabel: record.outcomeLabel || '',
    at: eventDay(record.arrivedAt) ? record.arrivedAt : '', arrivedAt: record.arrivedAt || '',
    requestIds: record.requestIds || [], requestCodes: record.requestCodes || '', taskIds: record.taskIds || [], taskCodes: record.taskCodes || '',
    journeyId: record.journeyId || '', executorId: record.executorId || '', executor: record.executor || '',
    address: record.address || record.addressSnapshot || '', name: record.site || record.customer || record.warehouse || record.placeLabel || '',
    source: record.source || '', timingNote: record.timingNote || '',
  }));
  // visit_events is an actual-arrival ledger. A record with no usable timestamp
  // is disclosed as undated, rather than silently turning an uncertain count to 0.
  for (const record of s.visit_events) {
    if (visitRows.some(visit => visit.id === record.id) || ['planned', 'cancelled'].includes(record.status)) continue;
    const related = [...new Set([...(record.requestIds || []), ...(record.taskIds || []).map((id: string) => s.tasks.find(task => task.id === id)?.requestId)])].filter((id): id is string => typeof id === 'string' && requestIds.has(id));
    if (!related.length) continue;
    visitRows.push({
      id: record.id, code: record.code, status: record.outcome || 'unknown', at: '', arrivedAt: record.arrivedAt || '',
      requestIds: related, requestCodes: related.map(requestCode).join('، '),
      taskIds: (record.taskIds || []).filter((id: string) => s.tasks.some(task => task.id === id && requestIds.has(task.requestId))),
      journeyId: record.journeyId || '', executorId: record.executorId || '', executor: name('resources', record.executorId),
      address: record.addressSnapshot || '', name: name('customer_sites', record.siteId) || name('customers', record.customerId) || name('warehouses', record.warehouseId),
      source: record.source || 'explicit',
    });
  }

  function metric(key: OverviewMetricKey, labelAr: string, labelEn: string, candidates: Row[], available: boolean,
    definitionAr: string, definitionEn: string, dateBasisAr: string, dateBasisEn: string, requireActualDate = false): OverviewMetric {
    const unknownDates = candidates.filter(record => !eventDay(record.at)).length;
    const rows = uniqueRows(candidates).filter(record => (hasPeriod || requireActualDate) ? inRange(eventDay(record.at)) : true)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id));
    const value = !available || (!rows.length && unknownDates > 0 && (hasPeriod || requireActualDate)) ? null : rows.length;
    if (!available) warnings.push({ar: `مصدر «${labelAr}» غير مكتمل في هذه المعاينة؛ العدد غير متاح.`, en: `The ${labelEn.toLowerCase()} source is not completely loaded; its count is unavailable.`});
    if (unknownDates) warnings.push({
      ar: `${labelAr}: ${unknownDates} سجل بلا تاريخ صالح${hasPeriod || requireActualDate ? '؛ لم يُضم إلى عدد الفترة أو الرسم' : '؛ ظاهر في إجمالي السجلات، وخارج الرسم الزمني'}.`,
      en: `${labelEn}: ${unknownDates} record(s) have no valid date${hasPeriod || requireActualDate ? '; excluded from period counts and the chart' : '; included in the all-time record count, excluded from the timeline'}.`,
    });
    return {key, labelAr, labelEn, value, definitionAr, definitionEn, dateBasisAr, dateBasisEn, unknownDates, rows: available ? rows : []};
  }

  const metrics: OverviewMetric[] = [
    metric('requests', 'الطلبات', 'Requests', requestRows, loaded('requests'),
      'عدد معرّفات الطلبات المختلفة؛ تعدد العملاء والمنتجات والباتشات لا يكرر الطلب. الحالة هي الحالة الحالية للطلبات المنشأة في الفترة.',
      'Distinct request IDs; multiple customers, products and batches do not multiply requests. Statuses are the current statuses of requests created in the period.',
      'تاريخ إنشاء الطلب بتوقيت القاهرة؛ ليس تاريخ الاستحقاق أو التسليم.', 'Request creation date in Cairo time, not its due or delivery date.'),
    metric('tasks', 'المهام', 'Tasks', taskRows, loaded('requests') && loaded('tasks'),
      'عدد معرّفات المهام المختلفة المرتبطة بالطلبات المطابقة؛ لا يُحسب صف الباتش أو التسليم كمهمة جديدة.',
      'Distinct task IDs belonging to matching requests; a batch or delivery row is not another task.',
      'تاريخ إنشاء المهمة بتوقيت القاهرة، مستقل عن تاريخ إنشاء الطلب.', 'Task creation date in Cairo time, independent of request creation.'),
    metric('journeys', 'مشاركات الرحلات الفعلية', 'Actual courier journeys', journeyRows, loaded('requests') && loaded('tasks') && loaded('journey_runs') && loaded('routes'),
      'عدد مشاركات المناديب ذات المغادرة المثبتة: كل معرّف رحلة للمندوب مرة واحدة. المسار المشترك قد يضم مشاركة لكل مندوب؛ المهام والباتشات لا تضاعفها. المخطط دون مغادرة غير محسوب.',
      'Distinct evidenced courier departures: one count per courier journey ID. A shared route can contain one participation per courier; tasks and batches do not multiply it. Unstarted plans are excluded.',
      'وقت المغادرة الفعلية بتوقيت القاهرة؛ السجل القديم يستخدم المغادرة المثبتة للمسار مع توضيح حدود توقيت المندوب.', 'Actual departure in Cairo time; legacy journeys use the evidenced shared-route departure and disclose timing limitations.', true),
    metric('visits', 'الزيارات الفعلية', 'Actual visits', visitRows, loaded('requests') && loaded('tasks') && loaded('visit_events'),
      'عدد وقائع الوصول المثبتة المختلفة إلى مكان. المهام أو المنتجات المتعددة في الزيارة نفسها لا تكررها؛ العودة المسجلة بواقعة وصول جديدة زيارة أخرى. التسليم وحده لا يُنشئ زيارة.',
      'Distinct recorded arrivals at a place. Multiple tasks or products in one visit do not multiply it; a separately recorded return arrival is another visit. A delivery alone does not establish a visit.',
      'وقت الوصول الفعلي بتوقيت القاهرة؛ لا يُستبدل بتاريخ الطلب أو بتاريخ مخطط.', 'Actual arrival in Cairo time, never request creation or a planned date.', true),
  ];
  const requests = metrics[0].rows;
  const statusGroups = new Map<string, string[]>();
  const days = new Map<string, string[]>();
  for (const record of requests) {
    statusGroups.set(record.status, [...(statusGroups.get(record.status) || []), record.id]);
    const day = eventDay(record.at);
    if (day) days.set(day, [...(days.get(day) || []), record.id]);
  }
  if (f.warehouse !== 'all') warnings.push({
    ar: 'فلتر المخزن يختار الطلبات المرتبطة به؛ المؤشرات تشمل سياق هذه الطلبات، ولا تعني أن كل زيارة حدثت داخل هذا المخزن.',
    en: 'The warehouse filter selects related requests. Metrics cover those requests and do not mean every visit occurred at that warehouse.',
  });
  if (journeyRows.some(record => record.source === 'legacy') || visitRows.some(record => record.source === 'legacy')) warnings.push({
    ar: 'بعض وقائع المغادرة أو الوصول مستندة إلى سجلات التشغيل القديمة؛ تفاصيل السجل توضح مصدرها وحدود توقيتها.',
    en: 'Some departures or arrivals are evidenced by legacy operational records; row details identify their source and timing limitations.',
  });
  return {
    metrics,
    requestStatuses: [...statusGroups].map(([status, ids]) => ({status, count: ids.length, ids})).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    activity: [...days].map(([day, ids]) => ({day, count: ids.length, ids})).sort((a, b) => a.day.localeCompare(b.day)),
    range: {from: f.from, to: f.to}, warnings,
  };
}
