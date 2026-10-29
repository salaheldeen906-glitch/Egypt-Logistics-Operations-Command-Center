import { demand, type Actor, type Command, type Kind, type State } from './model';
import {externalCommandAllowed} from './external-transport';

/** ACCESS-DAF policy is pure. Only the server may attach a verified access context. */
export type PermissionOverride = 'default' | 'allow' | 'deny';
export type AccessContext = {
  enabled: true;
  platformOwner: boolean;
  clientAdmin: boolean;
  overrides: Record<string, PermissionOverride>;
  /** Exact leaf keys; '*' is reserved for a server-validated unrestricted ceiling. */
  ceiling: string[];
  sourceProjectIds?: string[] | null;
  sourceWarehouseIds?: string[] | null;
  sourceResourceIds?: string[] | null;
  originalScope?: { projectIds?: string[] | null; warehouseIds?: string[] | null; resourceIds?: string[] | null };
  accountRevision?: number;
  grantRevision?: number;
  grantId?: string;
  sessionId?: string;
  [key: string]: unknown;
};
export type PermissionDescriptor = {
  key: string; group: string; screen: string; action: string; ar: string; en: string;
  parent?: string; ownerOnly?: boolean; command?: string;
};
export type PermissionDecision = {
  allowed: boolean;
  source: 'role' | 'override' | 'deny' | 'ceiling' | 'unknown' | 'inactive' | 'platform-owner';
  reason: string;
};
const screenLabels: Record<string, [string, string, string]> = {
  dashboard: ['operations', 'لوحة المتابعة', 'Dashboard'], tasks: ['operations', 'مهامي الآن', 'My tasks'],
  orders: ['operations', 'الطلبات والمراجعة', 'Orders and review'], assignment: ['operations', 'التوزيع والحجز', 'Assignment and reservation'],
  trips: ['operations', 'الرحلات والتنفيذ', 'Trips and execution'], warehouse: ['operations', 'المخازن والمخزون', 'Warehouse and inventory'],
  proofs: ['operations', 'الإثباتات والمستندات', 'Proofs and documents'], returns: ['operations', 'المرتجعات', 'Returns'],
  reports: ['operations', 'التقارير والتنبيهات', 'Reports and alerts'], products: ['masters', 'المنتجات', 'Products'],
  customers: ['masters', 'العملاء', 'Customers'], projects: ['masters', 'المشاريع', 'Projects'],
  users: ['admin', 'المستخدمون والصلاحيات', 'Users and permissions'], audit: ['admin', 'سجل النشاط', 'Activity log'],
  settings: ['admin', 'الإدارة والإعدادات', 'Administration and settings'], access: ['admin', 'إدارة الوصول', 'Access management'],
};
const commandsByScreen: Record<string, string[]> = {
 orders: ['create_request','edit_request','submit','approve','close','close_receipt','near_expiry','exception','resolve_exception','save_delivery_needs','approve_delivery_needs','propose_request_change','review_request_change','propose_correction','review_correction','op_authorize','op_close','op_redirect','propose_quantity_increase','review_quantity_increase','report_loading_difference','review_loading_difference'],
 tasks: ['plan_task','assign_task','prepare_tasks'],
 assignment: ['plan_allocations','reserve','assign','split_reservation','op_plan','op_reserve','op_sequence','create_receipt_distribution','receipt_distribution_reserve','cancel_receipt_distribution'],
 trips: ['create_route','depart','arrive','handoff','op_collect','op_arrive','op_deliver','courier_collect','pickup_actual','warehouse_release','propose_custody','accept_custody','cancel_custody','plan_journey','start_journey','end_journey','cancel_journey','arrive_visit','leave_visit','tracking_start','tracking_point','tracking_stop','receipt_distribution_collect','receipt_distribution_arrive','receipt_distribution_deliver','external_shipment_save','external_shipment_cancel','external_handover','external_deliver','external_return','external_document','external_cost','external_invoice'],
 warehouse: ['opening','trace_opening','load','receive_purchase','receive_return','reverse','op_issue','op_receive','op_present','receipt_distribution_release','external_warehouse_release','external_return_accept'],
 proofs: ['upload','verify_documents','pod','op_document'],
 returns: ['return','plan_return','return_arrive','return_destination'],
 settings: ['seed','reset','restore','backup'],
 users: ['member','invite','revoke_invite','revoke_invites'],
};
const commandLabels: Record<string, [string,string]> = {
 external_shipment_save:['حفظ شحنة نقل خارجي','Save external shipment'],external_shipment_cancel:['إلغاء شحنة خارجية غير منفذة','Cancel unused external shipment'],external_warehouse_release:['تأكيد كمية تسليم المخزن للناقل','Confirm warehouse carrier release'],external_handover:['تسجيل استلام الناقل الفعلي','Record actual carrier receipt'],external_deliver:['تسجيل تسليم الناقل للعميل','Record carrier customer delivery'],external_return:['تسجيل تقديم مرتجع الناقل','Record carrier return presentation'],external_return_accept:['قبول مرتجع الناقل بالمخزن','Accept carrier warehouse return'],external_document:['ربط مستند شحنة خارجية','Link external shipment document'],external_cost:['تسجيل تكلفة النقل','Record freight cost'],external_invoice:['مطابقة فاتورة شحنات','Match shipment invoice'],
 propose_quantity_increase:['طلب زيادة كمية','Request quantity increase'],review_quantity_increase:['مراجعة زيادة الكمية','Review quantity increase'],report_loading_difference:['تسجيل فرق تحميل','Report loading difference'],review_loading_difference:['معالجة فرق التحميل','Review loading difference'],
 create_request:['إضافة طلب','Create request'],edit_request:['تعديل طلب','Edit request'],submit:['إرسال للمراجعة','Submit for review'],approve:['اعتماد الطلب','Approve request'],
 close:['إغلاق الطلب','Close request'],close_receipt:['إغلاق الاستلام','Close receipt'],near_expiry:['اعتماد قرب الصلاحية','Approve near-expiry batch'],exception:['تسجيل استثناء','Record exception'],resolve_exception:['معالجة استثناء','Resolve exception'],
 save_delivery_needs:['حفظ احتياجات التسليم','Save delivery needs'],approve_delivery_needs:['اعتماد احتياجات التسليم','Approve delivery needs'],propose_request_change:['اقتراح تعديل الطلب','Propose request change'],review_request_change:['مراجعة تعديل الطلب','Review request change'],propose_correction:['اقتراح تصحيح موثق','Propose documented correction'],review_correction:['مراجعة التصحيح','Review correction'],
 op_authorize:['تصريح التنفيذ','Authorize execution'],op_close:['إغلاق التشغيل','Close operation'],op_redirect:['إعادة توجيه','Redirect'],plan_task:['تخطيط مهمة','Plan task'],assign_task:['إسناد مهمة','Assign task'],complete_task:['تأكيد المهمة','Complete task'],prepare_tasks:['تجهيز المهام','Prepare tasks'],
 plan_allocations:['توزيع المنتجات والوجهات','Plan allocations'],reserve:['حجز البضاعة','Reserve stock'],assign:['إسناد التنفيذ','Assign execution'],split_reservation:['تقسيم الحجز','Split reservation'],op_plan:['تخطيط التنفيذ','Plan operation'],op_reserve:['حجز التشغيل','Reserve operation'],op_sequence:['ترتيب المهام','Sequence tasks'],create_receipt_distribution:['إنشاء توزيع من استلام','Create receipt distribution'],receipt_distribution_reserve:['حجز التوزيع','Reserve distribution'],cancel_receipt_distribution:['إلغاء التوزيع','Cancel distribution'],
 create_route:['إنشاء رحلة','Create route'],depart:['تأكيد المغادرة','Confirm departure'],arrive:['تأكيد الوصول','Confirm arrival'],handoff:['تسليم العهدة','Handoff custody'],op_collect:['تأكيد التجميع','Confirm collection'],op_arrive:['وصول التشغيل','Operation arrival'],op_deliver:['تسليم التشغيل','Operation delivery'],courier_collect:['تأكيد استلام المندوب','Courier collection'],pickup_actual:['الاستلام الفعلي','Actual pickup'],warehouse_release:['تأكيد تسليم المخزن','Confirm warehouse release'],propose_custody:['اقتراح نقل عهدة','Propose custody transfer'],accept_custody:['قبول نقل عهدة','Accept custody transfer'],cancel_custody:['إلغاء نقل عهدة','Cancel custody transfer'],plan_journey:['تخطيط مشوار','Plan journey'],start_journey:['بدء مشوار','Start journey'],end_journey:['إنهاء مشوار','End journey'],cancel_journey:['إلغاء مشوار','Cancel journey'],arrive_visit:['وصول زيارة','Visit arrival'],leave_visit:['إنهاء زيارة','Finish visit'],tracking_start:['بدء تتبع موقع','Start tracking'],tracking_point:['إرسال نقطة موقع','Record tracking point'],tracking_stop:['إيقاف تتبع موقع','Stop tracking'],receipt_distribution_collect:['استلام توزيع','Collect distribution'],receipt_distribution_arrive:['وصول توزيع','Distribution arrival'],receipt_distribution_deliver:['تسليم توزيع','Deliver distribution'],
 opening:['رصيد افتتاحي','Opening stock'],trace_opening:['تتبع الرصيد الافتتاحي','Trace opening stock'],load:['تأكيد التحميل','Confirm loading'],receive_purchase:['استلام شراء','Receive purchase'],receive_return:['قبول مرتجع بالمخزن','Accept warehouse return'],reverse:['عكس حركة موثق','Reverse movement'],op_issue:['صرف مخزني','Issue stock'],op_receive:['استلام مخزني','Warehouse receipt'],op_present:['عرض العهدة للاستلام','Present custody'],receipt_distribution_release:['صرف توزيع','Release distribution'],
 upload:['رفع مرفق','Upload attachment'],verify_documents:['تأكيد المستندات','Verify documents'],pod:['إثبات التسليم','Proof of delivery'],op_document:['تنفيذ إجراء مستندي','Execute document action'],return:['تسجيل مرتجع','Record return'],plan_return:['تخطيط مرتجع','Plan return'],return_arrive:['وصول مرتجع','Return arrival'],return_destination:['اختيار مخزن المرتجع','Select return destination'],seed:['بيانات التدريب','Training data'],reset:['إعادة ضبط معتمدة','Authorized reset'],restore:['استعادة نسخة','Restore backup'],backup:['إنشاء نسخة كاملة','Create full backup'],
 member:['تعديل العضويات القائمة','Edit existing memberships'],invite:['إنشاء دعوة','Create invitation'],revoke_invite:['سحب دعوة','Revoke invitation'],revoke_invites:['سحب الدعوات','Revoke invitations'],
};
const platformCommands = new Set(['seed','reset','restore','backup']);
const memberCommands = new Set(['member','invite','revoke_invite','revoke_invites']);
const managerCommands = new Set(['near_expiry','reverse','undo_import','trace_opening','delete','preview_delete']);
/** Kept in parity with the currently approved role/function defaults in engine.ts. */
const functionCommands: Record<string,string[]> = {
 project_manager:['plan_allocations','master','create_request','edit_request','plan_task','submit','import','op_plan','save_customer_site','save_delivery_needs','propose_request_change','propose_correction'],
 operations:['close_receipt','resolve_exception','master','approve','reserve','verify_documents','exception','import','op_authorize','op_close','op_redirect','save_customer_site','approve_delivery_needs','propose_request_change','review_request_change','propose_correction','review_correction'],
 warehouse:['warehouse_release','pickup_actual','receive_return','receive_purchase','close_receipt','master','opening','reserve','load','upload','import','op_reserve','op_issue','op_receive','propose_correction','receipt_distribution_release'],
 dispatcher:['plan_allocations','reserve','op_reserve','pickup_actual','return_destination','prepare_tasks','plan_return','assign_task','split_reservation','master','assign','create_route','depart','arrive','handoff','exception','op_plan','op_sequence','save_customer_site','propose_correction','create_receipt_distribution','receipt_distribution_reserve','plan_journey','start_journey','end_journey','cancel_journey','arrive_visit','leave_visit','cancel_receipt_distribution'],
 representative:['cancel_custody','propose_custody','accept_custody','courier_collect','return_destination','pickup_actual','op_present','plan_return','return_arrive','depart','arrive','deliver','pod','return','upload','exception','close','op_collect','op_arrive','op_deliver','op_document','propose_correction','receipt_distribution_collect','receipt_distribution_arrive','receipt_distribution_deliver','start_journey','end_journey','cancel_journey','arrive_visit','leave_visit','tracking_start','tracking_point','tracking_stop'],
};
const groups = {operations:['التشغيل','Operations'],masters:['البيانات الأساسية','Master data'],admin:['الإدارة','Administration']} as const;
const descriptors: PermissionDescriptor[] = Object.entries(groups).map(([group,[ar,en]])=>({key:'group.'+group,group,screen:'',action:'group',ar,en}));
for (const [screen,[group,ar,en]] of Object.entries(screenLabels)) {
 descriptors.push({key:'screen.'+screen,group,screen,action:'screen',ar,en,parent:'group.'+group,ownerOnly:screen==='access'});
 descriptors.push({key:screen+'.view',group,screen,action:'view',ar:'عرض '+ar,en:'View '+en,parent:'screen.'+screen,ownerOnly:screen==='access'});
 for (const command of commandsByScreen[screen]||[]) descriptors.push({key:screen+'.'+command,group,screen,action:command,ar:commandLabels[command]?.[0]||command,en:commandLabels[command]?.[1]||command,parent:'screen.'+screen,command,ownerOnly:platformCommands.has(command)||memberCommands.has(command)});
}
// The master-data API is one existing service with kind-specific permission keys.
for (const screen of ['projects','products','customers','warehouse','orders','tasks','trips','proofs','returns','reports']) {
 const group=screenLabels[screen][0];
 for(const [action,ar,en] of [['master','إضافة وتعديل البيانات','Add and edit data'],['import','استيراد','Import'],['preview_import','معاينة الاستيراد','Preview import'],['delete','حذف السجل المسموح','Delete eligible record'],['preview_delete','معاينة حذف','Preview deletion'],['undo_import','عكس استيراد','Undo import']] ) {
 if(action==='master'&&!['projects','products','customers','warehouse'].includes(screen))continue;
 if(['import','preview_import'].includes(action)&&!['projects','products','customers','warehouse','orders'].includes(screen))continue;
 if(['delete','preview_delete'].includes(action)&&!['projects','products','customers','warehouse','orders','tasks','trips','proofs','reports'].includes(screen))continue;
 if(action==='undo_import'&&screen!=='reports')continue;
 descriptors.push({key:screen+'.'+action,group,screen,action,ar,en,parent:'screen.'+screen,command:action});
 }
}
for (const [key,screen,ar,en] of [
 ['customers.save_customer_site','customers','حفظ عنوان العميل','Save customer address'],
 ['trips.deliver','trips','تسجيل التسليم','Record delivery'],
 ['reports.export','reports','تصدير التقرير','Export report'],
 ['proofs.download','proofs','تنزيل المرفق','Download attachment'],['users.manage','users','إدارة حسابات العميل','Manage client accounts'],
 ['access.manage','access','إدارة تفويض العميل','Manage client delegation'],
] ) descriptors.push({key,group:screenLabels[screen][0],screen,action:key.slice(key.indexOf('.')+1),ar,en,parent:'screen.'+screen,ownerOnly:screen==='access',...(['save_customer_site','deliver'].includes(key.slice(key.indexOf('.')+1))?{command:key.slice(key.indexOf('.')+1)}:{})});
for (const [screen,[group]] of Object.entries(screenLabels)) {
 if(screen==='access')continue;
 for(const [action,ar,en] of [['export','تصدير البيانات المسموحة','Export permitted data']]) {
  if(!['reports','orders','customers','products','tasks','warehouse','proofs','returns','trips'].includes(screen))continue;
  const key=screen+'.'+action;if(!descriptors.some(d=>d.key===key))descriptors.push({key,group,screen,action,ar,en,parent:'screen.'+screen});
 }
}
descriptors.push({key:'orders.draft',group:'operations',screen:'orders',action:'draft',ar:'حفظ مسودة الطلب',en:'Save request draft',parent:'screen.orders'});
export const permissionRegistry: readonly PermissionDescriptor[] = Object.freeze(descriptors.map(d=>Object.freeze(d)));
const registry = new Map(permissionRegistry.map(d=>[d.key,d]));
const directCommands = new Map<string,string>();
for(const d of permissionRegistry) if(d.command&&!['master','import','preview_import','delete','preview_delete','undo_import'].includes(d.command)) directCommands.set(d.command,d.key);
directCommands.set('save_customer_site','customers.save_customer_site');directCommands.set('deliver','trips.deliver');
const context = (a: Actor): AccessContext | undefined => (a as Actor & {access?:AccessContext}).access;
export function screenForKind(kind: Kind | string): string {
 if(['external_shipments','external_custody','external_carrier_performance','external_invoice_coverage','external_followup'].includes(kind))return 'trips';
 if(['projects'].includes(kind))return 'projects';
 if(['customer_deliveries'].includes(kind))return 'orders';
 if(['customer_returns'].includes(kind))return 'returns';
 if(['courier_summary','journey_details','visit_details','travel_events'].includes(kind))return 'trips';
 if(kind==='opening')return 'warehouse';
 if(['products','units','batches'].includes(kind))return 'products';
 if(['customers','customer_sites'].includes(kind))return 'customers';
 if(['warehouses','locations','movements'].includes(kind))return 'warehouse';
 if(['resources','carriers','routes','stops','journey_runs','visit_events','tracking_sessions','tracking_points','assignments'].includes(kind))return 'trips';
 if(['documents','pods'].includes(kind))return 'proofs';
 if(kind==='returns')return 'returns';if(kind==='tasks')return 'tasks';if(kind==='imports')return 'reports';
 if(['requests','lines','reservations','deliveries','exceptions','approvals','handoffs','delivery_needs'].includes(kind))return 'orders';
 return 'unknown';
}
function masterScreen(kind: unknown): string {
 const k=String(kind||'');
 if(['warehouses','locations','resources','carriers'].includes(k))return 'warehouse';
 if(['customers','customer_sites'].includes(k))return 'customers';
 if(k==='projects')return 'projects';if(['products','units','batches'].includes(k))return 'products';return screenForKind(k);
}
export function commandPermissionKey(c: Command): string | null {
 if(c.type==='undo_import')return 'reports.undo_import';
 if(['master','import','preview_import','delete','preview_delete'].includes(c.type))return masterScreen(c.kind)+'.'+c.type;
 if(c.type==='complete_task')return c.taskType==='documents'?'proofs.verify_documents':c.taskType==='pickup'?'warehouse.load':'trips.deliver';
 return directCommands.get(c.type)||null;
}
export function roleCommandDefault(a: Actor, command: string): boolean {
 if(command.startsWith('external_'))return externalCommandAllowed(a,command);
 if(!a.active||a.role==='viewer')return false;
 if(platformCommands.has(command)||memberCommands.has(command))return a.role==='owner';
 if(managerCommands.has(command)&&!['owner','manager'].includes(a.role))return false;
 if(['review_quantity_increase','review_loading_difference'].includes(command))return ['owner','manager'].includes(a.role)||['project_manager','dispatcher'].includes(a.function);
 if(['propose_quantity_increase','report_loading_difference'].includes(command))return ['owner','manager'].includes(a.role)||['project_manager','dispatcher','warehouse','representative','operations'].includes(a.function);
 if(command==='preview_import')command='import';
 if(['owner','manager'].includes(a.role)||a.function==='all')return true;
 return !!functionCommands[a.function]?.includes(command);
}
export function defaultPermission(a: Actor, key: string): boolean {
 const d=registry.get(key);if(!d||!a.active)return false;
 const ctx=context(a);
 if(d.ownerOnly||d.screen==='access')return ctx?.platformOwner===true;
 if(d.key==='users.manage'||d.screen==='users'&&['screen','view'].includes(d.action))return ctx?.platformOwner===true||ctx?.clientAdmin===true||(!ctx?.enabled&&a.role==='owner');
 if(d.command)return roleCommandDefault(a,d.command);
 if(d.key==='orders.draft')return a.role!=='viewer';
 // Reading existing operational screens remains available to all active roles;
 // scope checks still restrict their records. Exports preserve the prior read policy.
 return true;
}
function deniedByOverride(ctx: AccessContext, d:PermissionDescriptor): string | null {
 const keys=[d.key,'screen.'+d.screen,'group.'+d.group];
 if(d.action!=='view'&&d.action!=='screen'&&d.action!=='group')keys.push(d.screen+'.view');
 return keys.find(key=>ctx.overrides?.[key]==='deny')||null;
}
export function permissionDecision(a: Actor, key: string, defaultAllowed?: boolean): PermissionDecision {
 const ctx=context(a),d=registry.get(key);
 if(!a.active)return {allowed:false,source:'inactive',reason:'الحساب موقوف / Account disabled'};
 if(!ctx?.enabled)return {allowed:defaultAllowed??defaultPermission(a,key),source:'role',reason:'افتراضي الدور الحالي / Existing role default'};
 if(!d)return {allowed:false,source:'unknown',reason:'إجراء غير معرّف / Undefined permission'};
 if(d.ownerOnly&&!ctx.platformOwner)return {allowed:false,source:'platform-owner',reason:'ملكية المنصة الموثقة مطلوبة / Verified platform ownership required'};
 const denied=deniedByOverride(ctx,d);
 if(denied)return {allowed:false,source:'deny',reason:'منع صريح: '+denied+' / Explicit deny'};
 const parent=['group','screen'].includes(d.action);
 if(!parent&&!ctx.platformOwner&&!ctx.ceiling?.includes('*')&&!ctx.ceiling?.includes(key))return {allowed:false,source:'ceiling',reason:'خارج سقف التفويض / Outside delegation ceiling'};
 if(!parent&&d.action!=='view') {
  const view=permissionDecision(a,d.screen+'.view');
  if(!view.allowed)return {allowed:false,source:view.source,reason:'عرض الشاشة مطلوب أولًا / Screen view required: '+view.reason};
 }
 const explicit=ctx.overrides?.[key];
 if(explicit==='allow')return {allowed:true,source:'override',reason:'سماح للحساب داخل سقف التفويض / Account allow within ceiling'};
 return {allowed:defaultAllowed??defaultPermission(a,key),source:'role',reason:'افتراضي الدور الحالي / Existing role default'};
}
export function canViewScreen(a: Actor, screen:string): boolean {return permissionDecision(a,screen+'.view').allowed;}
export function assertCommandPermission(a: Actor, c: Command, defaultAllowed: boolean): void {
 if(!context(a)?.enabled){demand(defaultAllowed,'Your operational function cannot do this / وظيفتك لا تسمح بهذا الإجراء','FORBIDDEN',403);return;}
 const key=commandPermissionKey(c),decision=key?permissionDecision(a,key,defaultAllowed):{allowed:false,reason:'إجراء غير معرّف / Undefined action'};
 demand(decision.allowed,decision.reason,'FORBIDDEN',403);
}
/** A second projection after existing project/warehouse/resource scoping, never its replacement. */
export function permissionScopedState(s:State,a:Actor):State {
 if(!context(a)?.enabled)return s;
 const out={...s};for(const kind of Object.keys(s) as Kind[])if(!canViewScreen(a,screenForKind(kind)))out[kind]=[];
 return out;
}

/** Used after identity and record scope validation on read-only API paths. */
export function assertReadPermission(a: Actor, kind: Kind|string, action:'view'|'export'|'print'|'download'='view'): void {
 if(!context(a)?.enabled)return;
 const key=screenForKind(kind)+'.'+action,decision=permissionDecision(a,key);
 demand(decision.allowed,decision.reason,'FORBIDDEN',403);
}
