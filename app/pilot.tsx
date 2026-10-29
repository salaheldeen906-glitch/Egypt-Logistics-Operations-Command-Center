'use client';
import {AccessManagement,PasswordSignIn} from './access-management';
import {canViewScreen,permissionDecision,screenForKind} from '@/lib/access-policy';
import {CollapsiblePanel} from './collapsible-panel';
import {ReportsOverview} from './reports-overview';
import {OrdersAnalytics} from './orders-analytics';
import {GeoValueReports} from './geo-value-reports';
import {StockAvailability} from './stock-availability';
import {WarehouseIssueReport} from './warehouse-issue-report';
import {QuantityReviewQueue} from './quantity-control';
import {CustomerGeography,customerGeographyIds} from './customer-geography';
import {TableExportContext} from './table-export-context';
import {EGYPT_GOVERNORATES,normalizePriceMetadata} from '@/lib/delivery-metadata';
import {EgyptTrips} from './egypt-trips';
import {EgyptDashboard} from './egypt-dashboard';
import {CustodyTransfers} from './custody-transfer';
import {AllocationPlanner} from './allocation-planner';
import {RequestEvolution} from './request-evolution';
import {CustomerDestinations,emptyDestination,deliveryNeedsFromDraft} from './customer-destinations';
import {CourierReports} from './courier-reports';
import {JourneyWorkspace} from './journey-workspace';
import {ExternalTransportWorkspace,ExternalTransportReports} from './external-transport';
import {ManagedTable} from './managed-table';

import {RequestWorkframe} from './request-workframe';
import {ActualWorkspace} from './actual-workspace';
import {AttachmentInput} from './attachment-input';
import {DraftScope} from './use-task-draft';
import {CentralDraftProvider,DraftTransport,usePersistentDraft} from './central-draft';
import {EvidenceTable} from './evidence-table';
import GridTable,{TableScope} from './grid-table';
import {ImportCenter,ExportPanel,InvitationPanel} from './file-workspace';
import {ReturnWorkspace} from './return-workspace';
import {taskSource,taskTravelFrom,taskNext,pendingFor} from '@/lib/task-trace';
import { useState, useEffect, useRef, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { LayoutDashboard, Database, ClipboardList, Warehouse, Truck, FileCheck, BarChart3, ArrowUpRight, Plus, Search, RefreshCw, Globe, ShieldCheck, ChevronLeft, ChevronRight, Package, Users, Download, Upload, Check, Clock, AlertTriangle, Lock, LogOut, MoreHorizontal, Activity, MapPin, ArrowLeft, Boxes, Link as LinkIcon, X, Sun, Moon, ListChecks, GitBranch } from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from 'sonner';
import { emptyState, balance, statusAr, flows, isQuantity, quantityRequirement, type State, type Row, type Kind, type Command } from '@/lib/model';
import { defaultBoxChoice, findBoxUnit } from '@/lib/default-unit';
import { productHasInventoryHistory } from '@/lib/product-tracking';
import { authorize } from '@/lib/engine';
import {exportColumns,exportedRows} from '@/lib/tabular-export';
import { filterRequests, queueNames, cairoDay, closeReason } from '@/lib/insights';
import { CommandCenter, InventorySummary, DispatchBoard, OperationDetails, DeleteDialog, MemberEditor, FileAnalysis } from './enhancements';
import {AssistantAccess,ServerSearch} from './workspace-tools';
import {OperationWorkspace} from './operation-workspace';
import {operationTypes,operationFields,documentActions,extended} from '@/lib/operation-types';
import {WorkflowGuide} from './workflow-guide';
import {isReceipt,requestFlow,typeLabel,responsible} from '@/lib/workflow';
import {nextAction} from '@/lib/insights';
import {RequestTasks} from './tasks';
import {guidedStep} from '@/lib/guided-step';
import {laneAllows} from '@/lib/role-work';
import {commandNav,activeCommandNav,visibleCommandNav,commandDestination,restoreCommandPosition} from './command-navigation';
import './command-center.css';
import './integrated-reports.css';
const actorAccessStamp=(actor:any,datasetId:string)=>JSON.stringify([actor?.userId,datasetId,actor?.role,actor?.function,actor?.access?.accountRevision,actor?.access?.grantRevision,actor?.projectIds,actor?.warehouseIds,actor?.resourceIds,actor?.access?.overrides]);
const nav = [{ ar: 'مركز القيادة', en: 'Command center', icon: LayoutDashboard }, { ar: 'البيانات الأساسية', en: 'Master data', icon: Database }, { ar: 'المشروعات والطلبات', en: 'Projects & requests', icon: ClipboardList }, { ar: 'المخازن والمخزون', en: 'Warehouse & inventory', icon: Warehouse }, { ar: 'التوزيع والرحلات', en: 'Dispatch & routes', icon: Truck }, { ar: 'المستندات والتسليم', en: 'Documents & delivery', icon: FileCheck }, { ar: 'التقارير والإدارة', en: 'Reports & administration', icon: BarChart3 }];
const commandIcons={dashboard:LayoutDashboard,tasks:ListChecks,orders:ClipboardList,assignment:GitBranch,trips:Truck,warehouse:Warehouse,proofs:FileCheck,reports:BarChart3,products:Package,customers:Users,returns:ArrowLeft,master:Database,users:Users};
const kindNames: Record<string, [
    string,
    string
]> = { projects: ['المشروعات', 'Projects'], products: ['المنتجات', 'Products'], units: ['الوحدات', 'Units'], customers: ['العملاء', 'Customers'], warehouses: ['المخازن', 'Warehouses'], locations: ['المواقع', 'Locations'], batches: ['الدفعات', 'Batches'], resources: ['المندوبون والموارد', 'Resources'], carriers: ['الناقلون', 'Carriers'], requests: ['الطلبات', 'Requests'], opening: ['الأرصدة الافتتاحية', 'Opening balances'] };
const roleNames: Record<string, string> = { owner: 'المالك', manager: 'المدير', contributor: 'مشارك تشغيلي', viewer: 'مشاهد' };
const functionNames: Record<string, string> = { all: 'كل الوظائف', project_manager: 'مدير مشروع', operations: 'عمليات', warehouse: 'مخزن', dispatcher: 'موزع', representative: 'مندوب' };
function Pick({ value, onChange, options, label }: {
    value: string;
    onChange: (v: string) => void;
    options: {
        value: string;
        label: string;
    }[];
    label: string;
}) { return <Select value={value || undefined} onValueChange={onChange}>
<SelectTrigger aria-label={label} className="picker">
<SelectValue placeholder={label}/>
</SelectTrigger>
<SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
</Select>; }
function Status({ value, ar }: {
    value: string;
    ar: boolean;
}) { return <span className={`status status-${value}`}>{ar ? statusAr[value] || value : value.replaceAll('_', ' ')}</span>; }
function CommandJourney({s,r,ar,can,onReview}:{s:State;r:Row;ar:boolean;can:(type:string)=>boolean;onReview?:(step:string)=>void}) {
    const [open,setOpen]=useState(false);
    useEffect(()=>setOpen(window.matchMedia('(min-width: 960px)').matches),[r.id]);
    return <details className="cc-request-journey" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{ar?'خط سير الطلب — المكتمل والحالي والمتبقي':'Request journey — done, current and remaining'}</summary><WorkflowGuide s={s} r={r} ar={ar} can={can} onReview={onReview}/></details>;
}
type Field = {
    key: string;
    label: string;
    type?: string;
    options?: {
        value: string;
        label: string;
    }[];
    required?: boolean;
    disabled?: boolean;
    requiredWhen?: (values:any)=>boolean;
};
type Modal = {
    productTracking?:boolean;
    draftKey?:string;
    attachment?:{upload:(f:File|undefined,p:string,t?:string)=>Promise<any>;purpose:string};
    title: string;
    subtitle?: string;
    fields: Field[];
    initial?: any;
    lines?: boolean;
    requestTypeChoice?: boolean;
    multiple?: Row[];
    submit: (v: any) => Promise<any>;
};
function FormModal({ modal, close, busy, products, ar,s,canSaveSites }: {
    modal: Modal | null;
    close: () => void;
    busy: boolean;
    products: Row[];
    ar: boolean;
    s:State;
    canSaveSites:boolean;
}) { const [error,setError]=useState(''),[fileBusy,setFileBusy]=useState(false),scope=useContext(DraftScope),transport=useContext(DraftTransport),draftKey=modal?.draftKey?'daf-form-v2:'+scope+':'+modal.draftKey:'';
 const initial=useMemo(()=>modal?{...modal.initial,lines:modal.initial?.lines||[{productId:'',quantity:1}],destinations:modal.initial?.destinations||[emptyDestination()],requestIds:[]}:{},[modal]);
 const draft=usePersistentDraft<any>(draftKey,initial,modal?.initial?.requestId),v=draft.value,set=draft.setValue;
 useEffect(()=>setError(''),[modal]);
 const leave=async()=>{try{await draft.flush();close();}catch(e:any){setError(e.message);}};
 const change = (k: string, x: any) => set((old: any) => ({ ...old, [k]: x, ...(modal?.productTracking&&k==='expiry'&&x===true?{tracked:true}:{}) })); return <Dialog open={!!modal} onOpenChange={o => { if (!o && !busy)
    void leave(); }}>
<DialogContent className="form-dialog">
<DialogHeader>
<DialogTitle>{modal?.title}</DialogTitle>
<DialogDescription>{modal?.subtitle || 'PILOT / TEST'}</DialogDescription>
</DialogHeader>{modal && <form onSubmit={async (e) => { e.preventDefault(); if(!draft.ready)return; setError(''); try {
    const missing=modal.fields.find(f=>f.requiredWhen?.(v)&&(!v[f.key]||v[f.key]==='none'));
    if(missing)throw new Error((ar?'اختار ':'Choose ')+missing.label);
    if(modal.fields.some(f=>f.key==='quantity')&&!isQuantity(v.quantity))throw new Error(quantityRequirement);
    const multiCustomer=modal.requestTypeChoice&&(v.requestType||'delivery')==='delivery';
    if(modal.lines&&!multiCustomer&&v.requestType!=='documents'&&(v.lines||[]).some((line:any)=>!isQuantity(line.quantity)))throw new Error(quantityRequirement);
    const needs=multiCustomer?deliveryNeedsFromDraft(v.destinations||[]):undefined;
    const pricedLines=modal.lines&&['warehouse_transfer','distribution'].includes(v.requestType)?v.lines.map((line:any)=>({...line,...normalizePriceMetadata(line)})):undefined;
    await draft.flush();await modal.submit({...v,...(pricedLines?{lines:pricedLines}:{}),...(needs?{needs}:{})});
    try{await draft.clear();}catch{toast.warning(ar?'العملية اتسجلت؛ تعذر مسح المسودة القديمة. لا تعيد التأكيد.':'Operation saved; old draft cleanup failed. Do not confirm again.');}close();
}
catch (e: any) {
    setError(e.message);
} }}>
{draft.error&&<p role="alert" className="error">{draft.error} <Button type="button" variant="outline" onClick={()=>void draft.retry().catch((e:any)=>setError(e.message))}>{ar?'إعادة محاولة حفظ المسودة':'Retry saving draft'}</Button></p>}<fieldset disabled={!draft.ready||busy||fileBusy||draft.status==='conflict'} className="draft-fields">{modal.attachment&&v.documentId&&v.documentId!=='none'&&<p role="status">{ar?'مرفق محفوظ ومختار لهذه العملية':'Saved attachment selected for this action'}</p>}{modal.attachment&&<AttachmentInput ar={ar} disabled={busy||fileBusy} onFile={async f=>{setFileBusy(true);try{const id=await modal.attachment!.upload(f,modal.attachment!.purpose,v.taskId);if(id)change('documentId',id);}finally{setFileBusy(false);}}}/>}{modal.draftKey&&<p className="panel-caption" role="status">{transport.enabled?(draft.error?(ar?'مدخلاتك موجودة هنا؛ حفظ المسودة يحتاج إعادة محاولة.':'Your input remains here; retry saving the draft.'):draft.status==='saved'?(ar?'مسودتك محفوظة في حسابك. الرجوع لا يلغي الكميات المؤكدة.':'Draft saved to your account. Going back preserves confirmed quantities.'):(ar?'جارٍ حفظ مدخلاتك في حسابك…':'Saving your draft to your account…')):(ar?'المدخلات تُحفظ على هذا الجهاز. الرجوع لا يلغي الكميات التي أكّدتها.':'Draft fields are kept on this device. Going back does not reverse confirmed quantities.')}</p>}{modal.requestTypeChoice&&<fieldset className="request-type-choice"><legend>{ar?'١ — نوع الطلب':'1 — Request type'}</legend>{operationTypes.map(([value,arabic,english])=><label key={value}><input type="radio" name="requestType" checked={(v.requestType||'delivery')===value} onChange={()=>change('requestType',value)}/><span>{ar?arabic:english}</span></label>)}<p>{ar?'اختار نوع العملية. تسليم العملاء يقبل عدة عملاء وعناوين داخل طلب واحد. التوزيع يشمل مخازن وعملاء.':'Choose the operation. Customer delivery accepts several clients and addresses under one request. Distribution includes warehouses and customers.'}</p></fieldset>}
{modal.requestTypeChoice&&v.requestType==='courier_receipt'&&<p className="panel-caption">{ar?'المصدر مندوب، وليس موردًا. للبضاعة الموجودة بعهدة مسجلة استخدم نقل العهدة بتأكيد الطرفين.':'Source is a courier, not a supplier. Use two-party custody transfer for goods already recorded in custody.'}</p>}<div className="form-grid">{modal.fields.filter(f=>!modal.requestTypeChoice||operationFields(v.requestType||'delivery').includes(f.key)&&!((v.requestType||'delivery')==='delivery'&&['customerId','destination'].includes(f.key))).map(f => <label key={f.key} className={f.type === 'textarea' ? 'span-two' : ''}>
<span>{v.requestType==='customer_return'&&f.key==='notes'?(ar?'سبب المرتجع وحالة البضاعة':'Return reason and goods condition'):f.label}</span>{f.type === 'select' ? <Pick label={f.label} value={v[f.key] || ''} onChange={x => change(f.key, x)} options={f.options || []}/> : f.type === 'checkbox' ? <Checkbox aria-label={f.label} disabled={f.disabled||(modal.productTracking&&f.key==='tracked'&&!!v.expiry)} checked={!!v[f.key]} onCheckedChange={x => change(f.key, x === true)}/> : f.type === 'textarea' ? <Textarea required={f.required !== false||(v.requestType==='customer_return'&&f.key==='notes')} value={v[f.key] || ''} onChange={e => change(f.key, e.target.value)}/> : <Input required={f.required !== false} type={f.type || 'text'} min={f.type === 'number' ? (f.key === 'quantity' ? 1 : 0.001) : undefined} step={f.type === 'number' ? '0.001' : undefined} value={v[f.key] ?? ''} onChange={e => change(f.key, e.target.value)}/>}</label>)}</div>{modal.requestTypeChoice&&(v.requestType||'delivery')==='delivery'&&<><CustomerDestinations s={s} projectId={v.projectId} value={v.destinations||[]} onChange={x=>change('destinations',x)} ar={ar} canSave={canSaveSites}/>{products.filter(p=>p.projectId===v.projectId).map(product=>{const quantity=(v.destinations||[]).reduce((n:number,d:any)=>n+(d.items||[]).filter((x:any)=>x.productId===product.id).reduce((sum:number,x:any)=>sum+Number(x.quantity||0),0),0);return quantity>0?<StockAvailability key={product.id} s={s} ar={ar} input={{projectId:v.projectId,productId:product.id,quantity,requestId:v.requestId,lineId:s.lines.find(line=>line.requestId===v.requestId&&line.productId===product.id)?.id,includeLineHeld:true}}/>:null;})}</>} {modal.lines && v.requestType!=='documents' && !(modal.requestTypeChoice&&(v.requestType||'delivery')==='delivery') && <div className="line-editor">
<h3>{ar ? 'بنود الطلب' : 'Request lines'}</h3>{(v.lines || []).map((l: any, i: number) => <div className="line-row" key={i}>
<Pick label={ar ? 'المنتج' : 'Product'} value={l.productId} options={products.filter(p => !v.projectId || p.projectId === v.projectId).map(p => ({ value: p.id, label: p.code + ' · ' + p.name }))} onChange={p => change('lines', v.lines.map((x: any, j: number) => j === i ? { ...x, productId: p } : x))}/>
<Input aria-label={'Quantity ' + (i + 1)} type="number" min="1" step="0.001" value={l.quantity} onChange={e => change('lines', v.lines.map((x: any, j: number) => j === i ? { ...x, quantity: e.target.value } : x))}/>
{['warehouse_transfer','distribution'].includes(v.requestType)&&<><label className="outward-price">{ar?'سعر الوحدة · ج.م':'Unit price · EGP'}<Input aria-label={(ar?'سعر الوحدة ':'Unit price ')+(i+1)} type="number" min="0" step="0.01" value={l.unitPrice??''} disabled={!!l.free} onChange={e=>change('lines',v.lines.map((x:any,j:number)=>j===i?{...x,unitPrice:e.target.value,priceMinor:undefined,currency:'EGP'}:x))}/></label><label className="evolution-checkbox"><input type="checkbox" checked={!!l.free} onChange={e=>change('lines',v.lines.map((x:any,j:number)=>j===i?{...x,free:e.target.checked,unitPrice:e.target.checked?'0':'',priceMinor:undefined,currency:'EGP'}:x))}/>{ar?'بضاعة مجانية':'Free goods'}</label></>}
<Button type="button" variant="ghost" aria-label="Remove line" disabled={v.lines.length === 1} onClick={() => change('lines', v.lines.filter((_: any, j: number) => i !== j))}>
<X size={16}/>
</Button>
</div>)}{['warehouse_transfer','distribution','delivery'].includes(v.requestType)&&[...new Set((v.lines||[]).map((line:any)=>line.productId))].filter(Boolean).map(productId=><StockAvailability key={String(productId)} s={s} ar={ar} input={{projectId:v.projectId,productId:String(productId),quantity:(v.lines||[]).filter((line:any)=>line.productId===productId).reduce((n:number,line:any)=>n+Number(line.quantity||0),0),warehouseId:v.sourceWarehouseId,requestId:v.requestId,requestType:v.requestType,lineId:s.lines.find(line=>line.requestId===v.requestId&&line.productId===productId)?.id,includeLineHeld:true}}/>)}<Button type="button" variant="outline" onClick={() => change('lines', [...v.lines, { productId: '', quantity: 1 }])}>
<Plus />{ar ? 'إضافة بند' : 'Add line'}</Button>
</div>}{modal.multiple && <div className="table-shell"><p className="panel-caption">{ar?'اختار المحطات ثم حرّكها لأعلى أو لأسفل لتحديد ترتيب الرحلة.':'Select stops, then move them up or down to set the route order.'}</p><ManagedTable tableId="pilot:1"><table><thead><tr><th>{ar?'اختيار':'Select'}</th><th>{ar?'الرقم':'Number'}</th><th>{ar?'الوجهة':'Destination'}</th><th>{ar?'الترتيب':'Order'}</th></tr></thead><tbody>{modal.multiple.map(r=><tr key={r.id}><td><Checkbox aria-label={r.code} checked={v.requestIds?.includes(r.id)} onCheckedChange={checked=>change('requestIds',checked?[...v.requestIds,r.id]:v.requestIds.filter((x:string)=>x!==r.id))}/></td><td>{r.code}</td><td>{r.destination}</td><td>{v.requestIds?.includes(r.id)&&<>{v.requestIds.indexOf(r.id)+1} <Button type="button" size="sm" variant="ghost" disabled={v.requestIds.indexOf(r.id)===0} onClick={()=>{const ids=[...v.requestIds],i=ids.indexOf(r.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];change('requestIds',ids);}}>{ar?'قبل':'Up'}</Button><Button type="button" size="sm" variant="ghost" disabled={v.requestIds.indexOf(r.id)===v.requestIds.length-1} onClick={()=>{const ids=[...v.requestIds],i=ids.indexOf(r.id);[ids[i],ids[i+1]]=[ids[i+1],ids[i]];change('requestIds',ids);}}>{ar?'بعد':'Down'}</Button></>}</td></tr>)}</tbody></table></ManagedTable></div>}</fieldset>{error && <p role="alert" className="error">{error}</p>}<div className="form-footer">
<Button type="button" variant="outline" onClick={()=>void leave()} disabled={busy}>{modal.draftKey?(ar?'رجوع وحفظ المدخلات':'Back & keep draft'):(ar?'رجوع':'Back')}</Button>
<Button type="submit" disabled={busy||fileBusy||!draft.ready||draft.status==='conflict'}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ وتنفيذ' : 'Save & execute')}<Check size={16}/>
</Button>
</div>
</form>}</DialogContent>
</Dialog>; }
export default function Pilot({commandCenter=false}:{commandCenter?:boolean}={}) {
    const [reviewStep,setReviewStep]=useState(''),[travelRequestId,setTravelRequestId]=useState('');
    const [reportKind,setReportKind]=useState('requests');
    const [reportArea,setReportArea]=useState('basic'),[customerArea,setCustomerArea]=useState('master');
    const [orderDrillIds,setOrderDrillIds]=useState<string[]|null>(null);
    const [reportSelected,setReportSelected]=useState<string[]>([]),[reportVisible,setReportVisible]=useState<string[]>([]);
    const [theme,setTheme]=useState<'dark'|'light'>('dark'),[myTaskFilter,setMyTaskFilter]=useState('ready');
    const [warehouse,setWarehouse]=useState('all'),[queue,setQueue]=useState('all');
    const [deleteTarget,setDeleteTarget]=useState<{kind:Kind;id:string}|null>(null),[editMember,setEditMember]=useState<any>(null);
    const [ar, setAr] = useState(true), [view, setView] = useState(0), [snap, setSnap] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [auth, setAuth] = useState(''), [online, setOnline] = useState(true), [busy, setBusy] = useState(false), [query, setQuery] = useState(''), [project, setProject] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [clock, setClock] = useState(''), [returnTo, setReturnTo] = useState('/'), [masterKind, setMasterKind] = useState<Kind>(commandCenter?'projects':'products'), [selected, setSelected] = useState<string | null>(null), [modal, setModal] = useState<Modal | null>(null), [confirm, setConfirm] = useState<any>(null), [reportTab, setReportTab] = useState('reports');
 const [reportFilters,setReportFilters]=useState<Record<string,any>>({});
    const refreshSequence=useRef(0),accessSignature=useRef(''),accessDirty=useRef(false);
    const [passwordEnabled,setPasswordEnabled]=useState(false);
    useEffect(()=>{void fetch('/api/access-auth/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then((v:any)=>setPasswordEnabled(v?.enabled===true)).catch(()=>{});const dirty=(e:Event)=>{accessDirty.current=!!(e as CustomEvent).detail?.dirty;};window.addEventListener('daf-access-dirty',dirty);return()=>window.removeEventListener('daf-access-dirty',dirty);},[]);
    const inFlight = useRef(false), pending = useRef<{
        hash: string;
        id: string;
    } | null>(null);
    const l = (a: string, e: string) => ar ? a : e;
    const s: State = snap?.state || emptyState();
    const a = snap?.actor;
    const exportIdentity=useRef({userId:'',datasetId:'',context:''});
    const verifiedExportVersion=useRef<number|null>(null);
    const tableExportLocation=useRef('');
    tableExportLocation.current=JSON.stringify([view,masterKind,reportKind,reportArea,customerArea,project,warehouse,queue,query,from,to]);
    exportIdentity.current={userId:a?.userId||'',datasetId:snap?.dataset?.id||'',context:actorAccessStamp(a,snap?.dataset?.id||'')};
    const loadOverviewExportState=async(metric='requests')=>{
        const expected={userId:a?.userId||'',datasetId:snap?.dataset?.id||'',context:actorAccessStamp(a,snap?.dataset?.id||'')};
        const response=await fetch('/api/access/export-state?kind='+encodeURIComponent(metric),{cache:'no-store'}),current=await response.json() as any;
        if(!response.ok)throw new Error(current.error||l('تعذّر التحقق من صلاحية التصدير.','Could not verify export access.'));
        if(!expected.userId||!expected.datasetId||current.actor?.userId!==expected.userId||current.dataset?.id!==expected.datasetId||exportIdentity.current.userId!==expected.userId||exportIdentity.current.datasetId!==expected.datasetId||exportIdentity.current.context!==expected.context||actorAccessStamp(current.actor,current.dataset?.id||'')!==expected.context)throw new Error(l('تغيّر الحساب أو مجموعة البيانات؛ حدّث الصفحة قبل التصدير.','Account or dataset changed; refresh before exporting.'));
        verifiedExportVersion.current=current.dataset?.version??null;
        return current.state as State;
    };
    const loadGeoExportState=()=>loadOverviewExportState('geo_values');
    const can = (type: string,kind?:Kind) => { if (!a)
        return false; try {
        authorize(a, { type, ...(['master','import','delete','preview_import','preview_delete'].includes(type)?{kind:kind||masterKind}:{}) });
        return true;
    }
    catch {
        return false;
    } };
    const owner = a?.access?.enabled ? a?.platformOwner===true : a?.role === 'owner';
    const accountAdmin=owner||a?.clientAdmin===true;
    const accessScopeKey=actorAccessStamp(a,snap?.dataset?.id||'');
    const restoredUser=useRef('');
    useEffect(()=>{
        if(!a?.userId)return;
        const key=(commandCenter?'daf-command-position-':'daf-position-')+a.userId+':'+snap?.dataset?.id;
        if(restoredUser.current!==key){
            restoredUser.current=key;
            try{
                const saved=JSON.parse(localStorage.getItem(key)||'{}');
                if(Number.isInteger(saved.view)&&saved.view>=0&&saved.view<=(commandCenter?9:6)&&!(saved.view===9&&!owner))setView(saved.view);
                if(saved.selected&&s.requests.some(x=>x.id===saved.selected))setSelected(saved.selected);
                if(typeof saved.query==='string')setQuery(saved.query.slice(0,180));
                if(saved.project==='all'||s.projects.some(p=>p.id===saved.project))setProject(saved.project);
                if(typeof saved.from==='string'&&(!saved.from||/^\d{4}-\d{2}-\d{2}$/.test(saved.from)))setFrom(saved.from);
                if(typeof saved.to==='string'&&(!saved.to||/^\d{4}-\d{2}-\d{2}$/.test(saved.to)))setTo(saved.to);
                if(saved.warehouse==='all'||s.warehouses.some(w=>w.id===saved.warehouse))setWarehouse(saved.warehouse);
                if(saved.queue==='all'||queueNames.some(q=>q[0]===saved.queue))setQueue(saved.queue);
                if(commandCenter){
                    const restored=restoreCommandPosition(saved,owner,exportColumns);
                    if(restored.masterKind)setMasterKind(restored.masterKind);
                    if(restored.reportTab)setReportTab(restored.reportTab);
                    if(restored.reportKind)setReportKind(restored.reportKind);
                    if(restored.reportFilters)setReportFilters(restored.reportFilters);
                    if(['basic','analytics'].includes(saved.reportArea))setReportArea(saved.reportArea);
                    if(['master','geography'].includes(saved.customerArea))setCustomerArea(saved.customerArea);
                }
            }catch{}
            return;
        }
        try{localStorage.setItem(key,JSON.stringify({view,selected,query,project,warehouse,queue,from,to,...(commandCenter?{reportTab,masterKind,reportKind,reportFilters,reportArea,customerArea}:{})}));}catch{}
    },[a?.userId,snap?.dataset?.id,view,selected,query,project,warehouse,queue,from,to,commandCenter,reportTab,masterKind,reportKind,reportFilters,reportArea,customerArea,owner]);
    useEffect(()=>setOrderDrillIds(null),[project,warehouse,query,from,to,queue,accessScopeKey]);
    const refresh = useCallback(async () => { const sequence=++refreshSequence.current; try {
        const r = await fetch(commandCenter?'/api/command-center/state':'/api/state', { cache: 'no-store' }), d = await r.json() as any;
        if(sequence!==refreshSequence.current)return;
        if (!r.ok) {
            setAuth(d.code);
            if ([401,403].includes(r.status)) { setSnap(null);setSelected(null);setModal(null);setDeleteTarget(null);setEditMember(null); }
            throw new Error(d.error);
        }
        const signature=actorAccessStamp(d.actor,d.dataset?.id||'');
        if(accessSignature.current&&accessSignature.current!==signature){setSelected(null);setModal(null);setDeleteTarget(null);setEditMember(null);setReportFilters({});setReportSelected([]);setReportVisible([]);setQuery('');setProject('all');setWarehouse('all');setQueue('all');}
        accessSignature.current=signature;
        setSnap(d);
        setSelected(current=>d.state.requests.some((r:Row)=>r.id===current)?current:null);
        setProject(current=>current==='all'||d.state.projects.some((p:Row)=>p.id===current)?current:'all');
        setError('');
        setAuth('');
        setOnline(true);
        return d;
    }
    catch (e: any) {
        if(sequence!==refreshSequence.current)return;
        setError(e.message);
        setOnline(false);
    }
    finally {
        if(sequence===refreshSequence.current)setLoading(false);
    } }, [commandCenter]);
    useEffect(() => { setReturnTo(window.location.pathname + window.location.search); setAr(localStorage.getItem('daf-language') !== 'en'); void refresh(); const t = setInterval(() => { if (!document.hidden && !inFlight.current)
        void refresh(); }, 20000); const tick = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000); return () => { clearInterval(t); clearInterval(tick); }; }, [refresh]);
    useEffect(() => { document.documentElement.dir = ar ? 'rtl' : 'ltr'; document.documentElement.lang = ar ? 'ar' : 'en'; }, [ar]);
    useEffect(()=>{if(!commandCenter)return;setTheme(localStorage.getItem('daf-command-theme')==='light'?'light':'dark');},[commandCenter]);
    useEffect(()=>{if(!commandCenter)return;document.body.dataset.dafCommandCenter=theme;return()=>{delete document.body.dataset.dafCommandCenter;};},[commandCenter,theme]);
    async function run(command: Command) { if (inFlight.current)
        throw new Error(l('انتظر اكتمال الحفظ', 'Wait for the current save')); inFlight.current = true; setBusy(true); const serialized = JSON.stringify(command); if (pending.current?.hash !== serialized)
        pending.current = { hash: serialized, id: crypto.randomUUID() }; try {
        const r = await fetch(commandCenter?'/api/command-center/action':'/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, operationId: pending.current.id, version: snap.dataset.version }) });
        const d = await r.json() as any;
        if (!r.ok) {
            if(r.status===409){pending.current=null;await refresh();}
            throw new Error(d.error);
        }
        pending.current = null;
        const fresh=await refresh();
        if (!['preview_import','preview_delete'].includes(command.type)) {
            const savedRequest=fresh?.state.requests.find((x:Row)=>x.id===(command.requestId||(command.type==='create_request'?d.id:'')));
            const next=savedRequest?nextAction(fresh.state,savedRequest):null;
            toast.success(l('تم الحفظ على الخادم', 'Saved to shared database'),{description:next?(ar?next.ar:next.en)+' · '+responsible(next.action,ar):undefined,duration:7000});
        }
        return d;
    }
    catch (e: any) {
        toast.error(e.message);
        throw e;
    }
    finally {
        if(command.password)pending.current=null;
        inFlight.current = false;
        setBusy(false);
    } }
    async function safe(command: Command) { try {
        await run(command);
    }
    catch { } }
    async function backup(type: string, extra: any = {}) { if (inFlight.current)
        throw new Error('Wait for the current save'); inFlight.current = true; setBusy(true); const serialized = JSON.stringify({ type, ...extra }); if (pending.current?.hash !== serialized)
        pending.current = { hash: serialized, id: crypto.randomUUID() }; try {
        const r = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, version: snap.dataset.version, operationId: pending.current.id, ...extra }) });
        const d = await r.json() as any;
        if (!r.ok)
            throw new Error(d.error);
        pending.current = null;
        await refresh();
        toast.success(l('تم حفظ نسخة استرجاع', 'Recovery copy saved'));
        return d;
    }
    catch (e: any) {
        toast.error(e.message);
        throw e;
    }
    finally {
        inFlight.current = false;
        setBusy(false);
    } }
    const name = (k: Kind, id: string) => s[k].find(x => x.id === id)?.name || s[k].find(x => x.id === id)?.code || '—';
    const opts = (k: Kind) => s[k].map(x => ({ value: x.id, label: x.code + ' · ' + (x.name || x.destination || '') + (k==='products'&&x.sku?' · SKU '+x.sku:'') }));
    const field = (key: string, arLabel: string, en: string, type = 'text', options?: any[]): Field => ({ key, label: l(arLabel, en), type, options });
    const scopeRows = useMemo(()=>filterRequests(s,{project,warehouse,from,to,query,queue:'all'}),[s,project,warehouse,from,to,query]);
    const requestRows = useMemo(()=>queue==='all'?scopeRows:filterRequests(s,{project,warehouse,from,to,query,queue}),[s,scopeRows,project,warehouse,from,to,query,queue]);
    const requestIds=new Set(requestRows.map(r=>r.id));
    const activeRequestNeeds=(id:string)=>s.delivery_needs.filter(n=>n.requestId===id&&n.active!==false&&n.status!=='superseded');
    const requestCustomerNames=(r:Row)=>[...new Set([r.customerId,...activeRequestNeeds(r.id).map(n=>n.customerId)].filter(Boolean))].map(id=>name('customers',id)).join(' / ');
    const requestGovernorates=(r:Row)=>[...new Set([r.governorate,...activeRequestNeeds(r.id).map(n=>n.governorate)].filter(Boolean))].map(code=>ar?(EGYPT_GOVERNORATES.find(g=>g[0]===code)?.[1]||code):String(code).replace(/-/g,' ')).join(' / ');
    const customerProjectIds=useMemo(()=>customerGeographyIds(s,project),[s,project]);
    const myTaskRows=useMemo(()=>commandCenter&&!(a?.function==='representative'&&!a?.resourceIds?.length)&&!(a?.function==='warehouse'&&!a?.warehouseIds?.length)?requestRows.map(request=>{
        const step=guidedStep(s,request),wide=['owner','manager'].includes(a?.role)||a?.function==='all',allowed=!!a&&!!step.action&&(step.action!=='courier_collect'||a.function==='representative')&&laneAllows(a,wide?step.role:a.function,step.action,step.command.taskType),completed=!step.action;
        return {id:request.id,request,step,ready:allowed&&!step.blocked,state:completed?'completed':allowed&&!step.blocked?'ready':'waiting'};
    }):[],[s,a,commandCenter,requestRows]);
    const navPosition={view,masterKind,reportTab,reportKind};
    const accessNav={id:'access',view:9,ar:'إدارة الوصول',en:'Access management',icon:'users' as const,group:'settings' as const,ownerOnly:true};
    const activeNav=commandCenter?(view===9&&owner?accessNav:activeCommandNav(navPosition,accountAdmin)):nav[view];
    const currentNav=commandCenter&&view===1?{...activeNav,ar:masterKind==='projects'?'المشاريع':kindNames[masterKind]?.[0]||activeNav.ar,en:kindNames[masterKind]?.[1]||activeNav.en}:activeNav;
    const availableCommandNav=[...visibleCommandNav(accountAdmin),...(owner&&a?.access?.enabled?[accessNav]:[])].filter(n=>!a?.access?.enabled||canViewScreen(a,n.id==='master'?'projects':n.id));
    function navigateCommand(n:(typeof commandNav)[number]){
        if(n.ownerOnly&&!(n.id==='users'?accountAdmin:owner))return;
        if(accessDirty.current&&!window.confirm(l('يوجد تعديل وصول غير محفوظ. هل تغادر؟','Unsaved access changes. Leave this page?')))return;
        const next=commandDestination(n,navPosition);
        setView(next.view);setMasterKind(next.masterKind);setReportTab(next.reportTab);
        if(next.reportKind!==reportKind){setReportKind(next.reportKind);setReportFilters({});setReportSelected([]);setReportVisible([]);}
        setQuery('');
    }
    useEffect(()=>{
        if(!a?.access?.enabled)return;
        const screen=view===9?'access':view===6?(reportTab==='admin'?'users':reportTab==='audit'?'audit':'reports'):view===1?(masterKind==='customers'?'customers':masterKind==='projects'?'projects':masterKind==='warehouses'||masterKind==='locations'?'warehouse':'products'):(['dashboard','','orders','warehouse','trips','proofs','','tasks','assignment'][view]);
        if(screen&&!canViewScreen(a,screen)){const first=availableCommandNav.find(n=>n.id!=='access');if(first){const next=commandDestination(first,navPosition);setView(next.view);setMasterKind(next.masterKind);setReportTab(next.reportTab);}setSelected(null);setModal(null);}
    },[accessScopeKey,view,reportTab,masterKind]);
    const routeRows=s.routes.filter(rt=>s.stops.some(st=>st.routeId===rt.id&&requestIds.has(st.requestId)));
    const products = s.products.filter(p => project === 'all' || p.projectId === project);
    const r = s.requests.find(x => x.id === selected && (project==='all'||x.projectId===project));
    useEffect(()=>setReviewStep(''),[selected]);
    const deleteButton=(kind:Kind,id:string)=>can('delete',kind)?<Button variant="ghost" size="sm" onClick={()=>setDeleteTarget({kind,id})}>{l('مسح','Delete')}</Button>:null;
    const priorityField=field('priority','الأولوية','Priority','select',[{value:'low',label:l('منخفضة','Low')},{value:'normal',label:l('عادية','Normal')},{value:'high',label:l('عالية','High')},{value:'urgent',label:l('عاجلة','Urgent')}]);
    const taskField=(lineId?:string)=>s.tasks.some(t=>t.requestId===r?.id)?[field('taskId','مهمة التسليم / الوجهة','Delivery task / destination','select',s.tasks.filter(t=>t.requestId===r?.id&&t.taskType==='delivery'&&(!lineId||t.lineId===lineId)).map(t=>({value:t.id,label:t.code+' · '+t.destination+' · '+t.quantity})))]:[];
    const reqFields = [priorityField,field('code', 'كود الطلب', 'Request code'), field('projectId', 'المشروع', 'Project', 'select', opts('projects')), field('customerId', 'العميل', 'Customer', 'select', opts('customers')), field('dueDate', 'الموعد المطلوب', 'Due date', 'date'), field('destination', 'عنوان التسليم', 'Destination'), { ...field('notes', 'ملاحظات', 'Notes', 'textarea'), required: false }];
    function createReq() { setModal({ draftKey:'new-request',title: l('طلب تشغيلي جديد', 'New operational request'), subtitle:l('اختار النوع، ثم أضف العملاء والعناوين وحصة كل منتج. يبقى للطلب رقم واحد، والحركة توزع مسؤوليات التنفيذ بعد الاعتماد.','Choose the type, then customers, addresses and product quotas. One request number; dispatch assigns execution after approval.'), fields: [...reqFields,field('sourceExecutorId','المندوب المسلم — جهة الاستلام','Source courier — not supplier','select',opts('resources')),field('supplierName','اسم المورد','Supplier'),field('purchaseReference','مرجع اعتماد الشراء','Approved purchase reference'),field('warehouseId','مخزن الاستلام','Receiving warehouse','select',opts('warehouses')),field('sourceWarehouseId','من مخزن','Source warehouse','select',opts('warehouses')),field('sourceAddress','عنوان الاستلام / من','Pickup address / from'),field('referenceCode','مرجع التسليم السابق أو إذن المرتجع','Original delivery / return authorization reference'),field('documentAction','المطلوب في المستند','Document action','select',documentActions.map(x=>({value:x[0],label:l(x[1],x[2])}))),field('documentDescription','اسم المستند والمطلوب عمله','Document name and required action')], requestTypeChoice:true, initial: { requestType:'delivery', priority:'normal', code: 'REQ-' + Date.now().toString().slice(-6), dueDate: new Date().toISOString().slice(0, 10), projectId: project === 'all' ? s.projects[0]?.id : project }, lines: true, submit: async (v) => { const d = await run({ type: 'create_request', ...v }); setSelected(d.id); setView(2); } }); }
    function masterForm(kind: Kind, existing?: Row) { const boxUnit=findBoxUnit(s.units),boxOptions=boxUnit?opts('units'):[{value:defaultBoxChoice,label:l('صندوق','Box')},...opts('units')],trackingLocked=kind==='products'&&!!existing&&productHasInventoryHistory(s,existing.id); let fields = [field('code', 'الكود', 'Code'), field('name', 'الاسم بالعربية / الإنجليزية', 'Arabic / English name')]; if (existing){
        fields = [field('name', 'الاسم', 'Name')];
        if(kind==='products')fields.push({...field('tracked','تتبع الدفعات','Batch tracking','checkbox'),disabled:trackingLocked},{...field('expiry','يتطلب تاريخ صلاحية','Expiry required','checkbox'),disabled:trackingLocked});
    }
    else if (kind === 'products')
        fields.push(field('projectId', 'المشروع', 'Project', 'select', opts('projects')), field('unitId', 'الوحدة', 'Unit', 'select', boxOptions), field('tracked', 'تتبع الدفعات', 'Batch tracking', 'checkbox'), field('expiry', 'يتطلب تاريخ صلاحية', 'Expiry required', 'checkbox'));
    else if (kind === 'locations')
        fields.push(field('warehouseId', 'المخزن', 'Warehouse', 'select', opts('warehouses')));
    else if (kind === 'batches')
        fields.push(field('productId', 'المنتج', 'Product', 'select', opts('products')), { ...field('expiryDate', 'تاريخ الصلاحية', 'Expiry date', 'date'), required: false });
    else if (kind === 'carriers')
        fields.push({ ...field('custodyLocationId', 'موقع العهدة إن وجد', 'Custody location if applicable', 'select', opts('locations')), required: false });
    if(kind==='carriers')fields.push(...['contactName','phone','email','serviceType','address','notes'].map((key,i)=>({...field(key,['اسم مسؤول التواصل','الهاتف','البريد الإلكتروني','نوع الخدمة','عنوان الناقل','ملاحظات'][i],['Contact name','Phone','Email','Service type','Carrier address','Notes'][i]),required:false})),{...field('relationshipStatus','حالة التعامل','Relationship status','select',[{value:'active',label:l('نشط','Active')},{value:'suspended',label:l('موقوف','Suspended')}]),required:false});
    if(kind==='customers')fields.push({...field('address','العنوان المرجعي للعميل','Customer reference address'),required:false},{...field('governorate','المحافظة المرجعية','Reference governorate','select',[{value:'',label:l('غير محدد','Unassigned')},...EGYPT_GOVERNORATES.map(g=>({value:g[0],label:ar?g[1]:g[0].replace(/-/g,' ')}))]),required:false});
    setModal({ title: (existing ? l('تعديل ', 'Edit ') : l('إضافة ', 'New ')) + (kindNames[kind]?.[ar ? 0 : 1] || kind), productTracking:kind==='products',...(kind==='products'&&existing?{subtitle:trackingLocked?l('إعدادات الباتش والصلاحية محفوظة بعد أول حركة مخزنية أو حجز. يمكنك تعديل الاسم.','Batch and expiry settings are locked after the first stock movement or reservation. You can edit the name.'):l('يمكن ضبط الباتش والصلاحية قبل أول حركة مخزنية أو حجز. الصلاحية تفعّل تتبع الدفعات.','Set batch and expiry tracking before the first stock movement or reservation. Expiry enables batch tracking.')}:{}), fields, initial: existing || { projectId: s.projects[0]?.id, unitId: boxUnit?.id || defaultBoxChoice }, submit: v => run({ type: 'master', kind, id: existing?.id, data: {...v,...(kind==='carriers'?{relationshipStatus:v.relationshipStatus||'active'}:{}),...(kind==='products'&&!existing&&v.unitId===defaultBoxChoice?{unitId:undefined}:{})} }) }); }
    function requestForm(type: string, title: string, fields: Field[], initial: any = {}) { setModal({ title,draftKey:(r?.id||'')+':'+type+':'+(initial.reservationId||initial.lineId||initial.taskId||''),attachment:['deliver','receive_purchase','pod'].includes(type)?{upload:uploadFile,purpose:type==='pod'?'pod':'other'}:undefined,fields:fields.map(f=>f.key==='documentId'?{...f,required:false,options:[{value:'none',label:l('بدون مرفق — تجاوز','No attachment — skip')},...(f.options||[])]}:f), initial:{requestId:r?.id,...initial}, submit: v => run({ type, requestId: r?.id, ...v, ...(v.documentId==='none'?{documentId:''}:{}),...(v.participantId==='none'?{participantId:''}:{}),...(v.taskId==='none'?{taskId:''}:{}) }) }); }
    async function uploadFile(file: File | undefined, purpose: string, taskId?:string) { if (!file || !r)
        return; setBusy(true); try {
        const form = new FormData();
        form.set('file', file);
        form.set('requestId', r.id);
        form.set('purpose', purpose); if(taskId)form.set('taskId',taskId);
        form.set('version', String(snap.dataset.version));
        form.set('operationId', crypto.randomUUID());
        const response = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await response.json() as any;
        if (!response.ok)
            throw new Error(data.error);
        toast.success(l('تم رفع المرفق', 'Attachment saved'));
        await refresh();return data.id;
    }
    catch (e: any) {
        toast.error(e.message);
    }
    finally {
        setBusy(false);
    } }
    async function exportRows() {try{
        const fresh=await loadOverviewExportState('requests');
        const requests=filterRequests(fresh,{project,warehouse,from,to,query,queue});
        const content=JSON.stringify({scope:'Filtered requests only; not a full backup',exportedAt:new Date().toISOString(),requests,lines:fresh.lines.filter(x=>requests.some(r=>r.id===x.requestId))},null,2);
        const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));try{const link=document.createElement('a');link.href=url;link.download='DAF_REQUESTS_EXPORT.json';link.click();}finally{URL.revokeObjectURL(url);}
    }catch(e:any){toast.error(e.message||l('تعذر التصدير','Export failed'));}}

    useEffect(() => { const context = (document as any).modelContext; if (!context?.registerTool)
        return; const controller = new AbortController(); Promise.resolve(context.registerTool({ name: 'navigate_daf_section', description: 'Navigate to one of the seven DAF Logistics sections. Does not change saved data.', inputSchema: { type: 'object', properties: { section: { type: 'integer', minimum: 0, maximum: 6 } }, required: ['section'], additionalProperties: false }, annotations: { readOnlyHint: true }, execute: (input: any) => { if (!Number.isInteger(input?.section) || input.section < 0 || input.section > 6)
            throw new Error('section must be 0–6'); setView(input.section); return { section: input.section, label: nav[input.section].en }; } }, { signal: controller.signal })).catch(() => { }); return () => controller.abort(); }, []);
    const requestColumns = [{ key: 'code', label: l('رقم الطلب', 'Request'), render: (x: Row) => <button className="row-link" onClick={() => setSelected(x.id)}>
<b dir="ltr">{x.code}</b>
<span>{isReceipt(x)?x.supplierName:name('customers', x.customerId)}</span>
</button> }, { key:'requestType',label:l('نوع الطلب','Request type'),value:(x:Row)=>typeLabel(x,ar),render:(x:Row)=>typeLabel(x,ar) }, { key: 'projectId', label: l('المشروع', 'Project'),value:(x:Row)=>name('projects',x.projectId), render: (x: Row) => <span className="project-tag">{name('projects', x.projectId)}</span> }, { key: 'destination', label: l('الوجهة', 'Destination') }, { key: 'dueDate', label: l('موعد التسليم', 'Due date') }, { key: 'status', label: l('الحالة', 'Status'),value:(x:Row)=>ar?statusAr[x.status]||x.status:x.status, render: (x: Row) => <Status value={x.status} ar={ar}/> }, {key:'responsible',label:l('عند مين؟','Responsible'),value:(x:Row)=>responsible(nextAction(s,x).action,ar),render:(x:Row)=>responsible(nextAction(s,x).action,ar)}, {key:'next',label:l('المطلوب الآن','Next step'),value:(x:Row)=>{const n=nextAction(s,x);return ar?n.ar:n.en;},render:(x:Row)=>{const n=nextAction(s,x);return <button className="next-step-link" onClick={()=>setSelected(x.id)}>{ar?n.ar:n.en}{n.action&&can(n.action)&&(n.action!=='op_plan'||can('assign_task'))&&<span className="your-turn-tag">{l('دورك','Your turn')}</span>}</button>;} }, { key: 'open', label: '',filterable:false, render: (x: Row) => <Button aria-label={l('فتح الطلب', 'Open request') + ' ' + x.code} variant="ghost" size="icon" onClick={() => setSelected(x.id)}>
<ArrowUpRight size={18}/>
</Button> },{key:'customer',label:l('العميل / الوجهة','Customer / destination'),value:requestCustomerNames,render:(x:Row)=>requestCustomerNames(x)||l('غير متاح','Unavailable')},{key:'governorate',label:l('المحافظات','Governorates'),value:requestGovernorates,render:(x:Row)=>requestGovernorates(x)||l('غير محدد','Unassigned')},{key:'currentStep',label:l('الخطوة الحالية','Current step'),value:(x:Row)=>ar?statusAr[x.status]||x.status:x.status,render:(x:Row)=>ar?statusAr[x.status]||x.status:x.status},{key:'action',label:l('الإجراء','Action'),filterable:false,render:(x:Row)=><Button size="sm" variant="ghost" onClick={()=>setSelected(x.id)}>{l('مراجعة','Review')}</Button>}];
    const tableExportKind=(id:string)=>id.startsWith('report:')?id.slice(7):({'pilot-table-1':'requests','pilot-table-3':masterKind,'pilot-table-4':'requests','pilot-table-5':'tasks','pilot-table-6':'movements','pilot-table-7':'movements','pilot-table-8':'requests','pilot-table-9':'tasks','pilot-table-10':'assignments','pilot-table-11':'documents','pilot-table-16':'lines','pilot:1':'requests','pilot:2':'routes','pilot:3':'reservations','travel:summary':'courier_summary','travel:journeys':'journey_details','travel:visits':'visit_details','travel:events':'travel_events','travel:courier-units':'courier_summary','customers:sites':'customer_sites','customers:activity':'customer_activity'} as Record<string,string>)[id]||'';
    const tableExportAllowed=!!a&&(!a.access?.enabled||permissionDecision(a,'reports.export').allowed);
    const exportSourceAllowed=(kind:string)=>!!kind&&tableExportAllowed&&(!a?.access?.enabled||(kind==='geo_values'?['customer_deliveries','customer_returns']:kind==='customer_activity'?['customers','customer_deliveries','customer_returns']:[kind]).every(source=>permissionDecision(a,screenForKind(source)+'.export').allowed));
    const authorizeTableExport=async(id:string)=>{const kind=tableExportKind(id),location=tableExportLocation.current,version=snap?.dataset?.version;if(!kind)throw Error(l('استخدم التصدير المخصص لهذا القسم.','Use the dedicated export for this section.'));await loadOverviewExportState(kind);if(location!==tableExportLocation.current||verifiedExportVersion.current!==version)throw Error(l('تغيرت البيانات أو الفلاتر؛ حدّث الجدول وراجع النتائج قبل التصدير.','Data or filters changed; refresh and review the table before exporting.'));};
    return <TableScope.Provider value={(a?.userId||'anonymous')+':'+(snap?.dataset?.id||'')}><TableExportContext.Provider value={{allowed:tableExportAllowed,allowedFor:id=>exportSourceAllowed(tableExportKind(id)),authorize:authorizeTableExport,ar}}><CentralDraftProvider key={accessScopeKey} enabled={commandCenter} datasetId={snap?.dataset?.id||''} userId={a?.userId||''}><DraftScope.Provider value={(a?.userId||'anonymous')+':'+(snap?.dataset?.id||'')}><SidebarProvider dir={ar?'rtl':'ltr'} className={commandCenter?`command-center cc-theme-${theme}`:undefined}>
<Toaster position="top-center" richColors/>
<Sidebar side={ar ? 'right' : 'left'} className="daf-sidebar">
<SidebarHeader>
<div className="brand">
<div className="brand-mark">DAF</div>
<div>
<b>Logistics</b>
<span>{commandCenter?'EGYPT · مصر':'TEAM PILOT'}</span>
</div>
</div>
<div className="workspace-card">
<span className="workspace-icon">
<Boxes size={20}/>
</span>
<div>
<b>{commandCenter?l('مركز التشغيل', 'Operations center'):l('مساحة عمل الفريق', 'Team workspace')}</b>
<span>{commandCenter?l('مصر','Egypt'):'PILOT / TEST'}</span>
</div>
<ChevronRight size={15}/>
</div>
</SidebarHeader>
<SidebarContent>
<div className="nav-label">{l('مساحة التشغيل', 'WORKSPACE')}</div>
{commandCenter?<nav aria-label={l('مجموعات التشغيل','Operations navigation')} className="cc-navigation">{['work','settings'].map(group=><div key={group} className="cc-nav-group">{group==='settings'&&<div className="nav-label">{l('البيانات والإدارة','DATA & ADMIN')}</div>}<SidebarMenu>{availableCommandNav.filter(n=>n.group===group).map(n=>{const Icon=commandIcons[n.icon];return <SidebarMenuItem key={n.id}><SidebarMenuButton isActive={currentNav===n} aria-current={currentNav===n?'page':undefined} onClick={()=>navigateCommand(n)} tooltip={ar?n.ar:n.en} className="nav-button"><Icon size={18}/><span><b>{ar?n.ar:n.en}</b><small>{ar?n.en:n.ar}</small></span>{n.view===2&&s.requests.some(r=>r.status!=='closed')&&<em>{s.requests.filter(r=>r.status!=='closed').length}</em>}</SidebarMenuButton></SidebarMenuItem>;})}</SidebarMenu></div>)}</nav>:<SidebarMenu>{nav.map((n, i) => <SidebarMenuItem key={n.en}>
<SidebarMenuButton isActive={view === i} onClick={() => { setView(i); setQuery(''); }} tooltip={n.en} className="nav-button">
<n.icon size={19}/>
<span>
<b>{ar ? n.ar : n.en}</b>
<small>{ar ? n.en : n.ar}</small>
</span>{i === 2 && s.requests.length > 0 && <em>{s.requests.filter(r => r.status !== 'closed').length}</em>}</SidebarMenuButton>
</SidebarMenuItem>)}</SidebarMenu>}
<div className="side-note">
<div className="egypt-landmark" role="img" aria-label="أبو الهول وأهرامات الجيزة / Sphinx and Giza pyramids"/>
<b>{l('مصر — مركز العمليات', 'Egypt — Operations center')}</b>
<p>{commandCenter?l('حفظ مركزي. كل إجراء محفوظ باسم منفذه.','Central saving. Every action is attributed to its operator.'):l('بيانات افتراضية فقط. كل إجراء محفوظ باسم منفذه.', 'Test data only. Every action is attributed to its operator.')}</p>
</div>
</SidebarContent>
<SidebarFooter>
<div className="profile">
<span className="avatar">{a?.name?.slice(0, 1) || 'D'}</span>
<div>
<b>{a?.name || l('سجّل الدخول', 'Sign in')}</b>
<small>{a ? l(roleNames[a.role], a.role) : 'ChatGPT account'}</small>
</div>{a && <a aria-label={l('تسجيل الخروج','Sign out')} href="/signout-with-chatgpt?return_to=/" target="_top" onClick={async e=>{if(!passwordEnabled)return;e.preventDefault();refreshSequence.current++;setSnap(null);setSelected(null);setModal(null);try{const response=await fetch('/api/access-auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error(l('تعذر إنهاء الجلسة؛ أعد المحاولة.','Could not end session. Try again.'));window.location.assign('/signout-with-chatgpt?return_to=/');}catch(e:any){setError(e.message);}}}>
<LogOut size={16}/>
</a>}</div>
</SidebarFooter>
</Sidebar>
<SidebarInset>
<div className="spider-strip"/>
<header className="topbar">{commandCenter&&<div className="cc-title"><strong>{l("مركز قيادة العمليات اللوجستية — مصر","Egypt Logistics Operations Command Center")}</strong><small>Logistics Operations Command Center · EGYPT</small></div>}
<div className="crumb">
<SidebarTrigger />
<span>DAF Logistics</span>
<ChevronLeft size={14}/>
<b>{ar ? currentNav.ar : currentNav.en}</b>
</div>
<div className="topbar-actions">
<span className="pilot-tag">{commandCenter?'مصر / EGYPT':'PILOT'}</span>
{commandCenter&&<Button variant="ghost" size="sm" aria-label={theme==='dark'?l('تفعيل الوضع الفاتح','Switch to light theme'):l('تفعيل الوضع الداكن','Switch to dark theme')} onClick={()=>{const next=theme==='dark'?'light':'dark';setTheme(next);localStorage.setItem('daf-command-theme',next);}}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}<span>{theme==='dark'?l('فاتح','Light'):l('داكن','Dark')}</span></Button>}
<span className="clock" dir="ltr">
<Clock size={14}/>{clock || '—:—:—'}</span>
<Button variant="ghost" size="sm" onClick={() => { setAr(!ar); localStorage.setItem('daf-language', ar ? 'en' : 'ar'); }}>
<Globe size={16}/>{ar ? 'EN' : 'العربية'}</Button>
</div>
</header>
<main className="workspace">
<div className="page-heading">
<div>
<span className="eyebrow">{view === 0 ? 'OPERATIONS OVERVIEW' : currentNav.en.toUpperCase()}</span>
<h1>{ar ? currentNav.ar : currentNav.en}</h1>
<p>{commandCenter?l('افتح الصف المطلوب؛ خطوة التنفيذ التالية تظهر داخل الطلب.','Open a row to see the next required step in its request.'):view === 0 ? l('طلباتك ومخزونك ورحلاتك، في مكان واحد.', 'Your requests, inventory and routes, in one place.') : l('مجموعة اختبار مشتركة · تحديث كل 20 ثانية', 'Shared pilot dataset · refresh every 20 seconds')}</p>
</div>
<div className="heading-actions"><a href="/walkthrough" className="text-link">{l("تدريب خطوة بخطوة","Step-by-step training")}</a>
{commandCenter&&<Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin);toast.success(l('تم نسخ رابط التطبيق. صلاحيات التشغيل تُحدَّد من المستخدمين والصلاحيات.','App link copied. Operational access is assigned in Users & permissions.'));}catch{toast.error(l('تعذر النسخ؛ انسخ الرابط من شريط العنوان.','Could not copy; copy the link from the address bar.'));}}}><LinkIcon size={16}/>{l('نسخ رابط التطبيق','Copy app link')}</Button>}
<Button variant="outline" disabled={loading || busy} onClick={() => void refresh()}>
<RefreshCw size={16}/>{l('تحديث', 'Refresh')}</Button>{a&&<ServerSearch ar={ar} onRequest={setSelected}/>}{can('create_request') && <Button onClick={createReq}>
<Plus size={17}/>{l('طلب جديد', 'New request')}</Button>}</div>
</div>
    {error && <div className="notice error" role="alert">
<AlertTriangle size={20}/>
<div>{error}{auth === 'AUTH' && <p>
<a href={'/signin-with-chatgpt?return_to=' + encodeURIComponent(returnTo)} target="_top" onClick={async e=>{if(!passwordEnabled)return;e.preventDefault();try{const r=await fetch('/api/access-auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error(l('تعذر إنهاء الجلسة السابقة؛ أعد المحاولة.','Could not clear the previous session; try again.'));window.location.assign('/signin-with-chatgpt?return_to='+encodeURIComponent(returnTo));}catch(e:any){setError(e.message);}}}>{l('تسجيل الدخول بحساب ChatGPT', 'Sign in with ChatGPT')}</a>
</p>}{auth === 'MEMBERSHIP' && <Button onClick={async () => { try {
        const token = new URLSearchParams(window.location.search).get('join');
        const resp = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        const d = await resp.json() as any;
        if (!resp.ok)
            throw new Error(d.error);
        history.replaceState(null, '', '/');
        await refresh();
    }
    catch (e: any) {
        toast.error(e.message);
    } }}>{l('الانضمام للفريق بالرابط', 'Join with invitation')}</Button>}</div>
</div>}
        {!snap&&!loading&&passwordEnabled&&<PasswordSignIn ar={ar} onSignedIn={async()=>{setLoading(true);await refresh();}}/>}
        {loading ? <div className="loading-grid">{[1, 2, 3, 4].map(x => <Skeleton key={x} className="h-40 rounded-2xl"/>)}</div> : snap ? <>
<div className="filterbar">
<div className="project-chips">
<button className={project === 'all' ? 'active' : ''} onClick={() => setProject('all')}>{l('الكل', 'All projects')}</button>{s.projects.map(p => <button key={p.id} className={project === p.id ? 'active' : ''} onClick={() => setProject(p.id)}>{p.name}</button>)}{can('master','projects') && <button aria-label="Add project" className="add-chip" onClick={() => masterForm('projects')}>
<Plus size={15}/>
</button>}</div>
<div className="dates">
<label>{l('من', 'From')}<Input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)}/>
</label>
<span>—</span>
<label>{l('إلى', 'To')}<Input aria-label="To date" type="date" value={to} onChange={e => setTo(e.target.value)}/>
</label>
</div>
</div>
<div className="filterbar"><Pick label={l('المخزن','Warehouse')} value={warehouse} onChange={setWarehouse} options={[{value:'all',label:l('كل المخازن','All warehouses')},...opts('warehouses')]}/><Pick label={l('قائمة الطلبات','Request queue')} value={queue} onChange={setQueue} options={[{value:'all',label:l('كل الحالات','All statuses')},...queueNames.map(([value,a,e])=>({value,label:l(a,e)})),...flows.filter(v=>!queueNames.some(q=>q[0]===v)).map(value=>({value,label:ar?statusAr[value]:value}))]}/><Button variant="ghost" onClick={()=>{setProject('all');setWarehouse('all');setQueue('all');setFrom('');setTo('');setQuery('');}}>{l('إعادة ضبط الفلاتر','Reset filters')}</Button><small>{l('آخر تحديث ناجح','Last successful refresh')}: {new Date(snap.serverTime).toLocaleTimeString(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo'})}</small></div>
        {!s.projects.length && <div className="notice">
<Boxes />
<div>
<b>{l('مساحة الاختبار جاهزة لاستقبال البيانات', 'Your pilot is ready for its first records')}</b>
<p>{l('ابدأ ببيانات تجريبية تشمل المشروعات والمنتجات والمخزن وطلبًا متعدد البنود.', 'Start with sample projects, products, stock and a request with multiple lines.')}</p>
</div>{owner && <Button disabled={busy} onClick={() => safe({ type: 'seed' })}>{l('تحميل بيانات تجريبية', 'Load sample data')}</Button>}</div>}
        {view === 0 && <>
<AssistantAccess actor={a} refresh={refresh} onRequest={setSelected} ar={ar}/>
<CommandCenter s={s} rows={scopeRows} ar={ar} onQueue={v=>{setQueue(v);setView(2);}} onRequest={setSelected} onProject={id=>{setProject(id);setQueue('all');setView(2);}}/>
{commandCenter&&<EgyptDashboard s={s} rows={scopeRows} ar={ar} project={project} warehouse={warehouse} onPeriod={(f,t)=>{setFrom(f);setTo(t);setQueue('all');setView(2);}} onWarehouse={id=>{setWarehouse(id);setView(3);}} onStatus={id=>{setQueue(id);setView(2);}} onRequest={setSelected} onCustomer={customer=>{setView(6);setReportTab('reports');setReportKind('customer_deliveries');setReportFilters({customer:{op:'equals',value:customer}});}}/>}
<CollapsiblePanel sectionId="dashboard-requests" ar={ar} title={l('الطلبات الحالية','Current requests')} header={<div className="section-heading"><h2>{l('الطلبات الحالية','Current requests')}</h2></div>}><GridTable tableId={"pilot-table-1"} columns={requestColumns} rows={[...requestRows].reverse()}/></CollapsiblePanel>
<CollapsiblePanel sectionId="dashboard-events" ar={ar} title={l('آخر الأحداث','Recent events')}><GridTable tableId={"pilot-table-2"} rows={snap.audit.slice(0,15)} columns={[{key:'at',label:l('الوقت','Time'),render:x=>new Date(x.at).toLocaleString(ar?'ar-EG':'en-GB',{timeZone:'Africa/Cairo'})},{key:'actor',label:l('المنفذ','Operator')},{key:'action',label:l('الإجراء','Action')}]} /></CollapsiblePanel>
</>}
        {view === 1 && <Tabs value={commandCenter&&masterKind==='customers'?customerArea:'master'} onValueChange={setCustomerArea}>
{commandCenter&&masterKind==='customers'&&<TabsList aria-label={l('عرض العملاء','Customer views')}><TabsTrigger value="master">{l('بيانات العملاء','Customer records')}</TabsTrigger><TabsTrigger value="geography">{l('الفروع والمحافظات والتحليل','Branches, governorates & analysis')}</TabsTrigger></TabsList>}
<TabsContent value="master"><CollapsiblePanel sectionId={"master-records:"+masterKind} ar={ar} title={kindNames[masterKind]?.[ar?0:1]||l('البيانات الأساسية','Master data')} header={<div className="section-heading">
<Pick label={l('نوع البيانات', 'Data type')} value={masterKind} onChange={v => { setMasterKind(v as Kind); setQuery(''); }} options={Object.entries(kindNames).filter(([k]) => !['requests', 'opening'].includes(k)).map(([k, v]) => ({ value: k, label: v[ar ? 0 : 1] }))}/>
<div className="inline-actions">
<div className="search">
<Search size={17}/>
<Input placeholder={l('بحث بالكود أو الاسم', 'Search code or name')} value={query} onChange={e => setQuery(e.target.value)}/>
</div>{can('master') && <Button onClick={() => masterForm(masterKind)}>
<Plus size={16}/>{l('إضافة', 'Add')}</Button>}</div>
</div>}>
<GridTable tableId={"pilot-table-3"} columns={[{ key: 'code', label: l('الكود', 'Code'), render: x => <b className="mono">{x.code}</b> }, { key: 'name', label: l('الاسم', 'Name') }, ...(masterKind === 'products' ? [{key:'sku',label:l('SKU الأصلي','Original SKU')},{key:'sourceProductId',label:l('رقم المنتج في المصدر','Source product ID')},{key:'category',label:l('الفئة','Category')},{key:'companyName',label:l('الشركة','Company')},{ key: 'projectId', label: l('المشروع', 'Project'),value:(x:Row)=>name('projects',x.projectId), render: (x: any) => name('projects', x.projectId) }, { key: 'unitId', label: l('الوحدة', 'Unit'),value:(x:Row)=>name('units',x.unitId), render: (x: any) => name('units', x.unitId) }, { key: 'tracked', label: l('التتبع', 'Tracking'), render: (x: any) => x.expiry ? 'FEFO' : x.tracked ? l('دفعات', 'Batches') : l('بدون صلاحية', 'No expiry') }] : []),...(masterKind==='carriers'?[{key:'contactName',label:l('مسؤول التواصل','Contact')},{key:'phone',label:l('الهاتف','Phone')},{key:'email',label:l('البريد','Email')},{key:'serviceType',label:l('نوع الخدمة','Service type')},{key:'relationshipStatus',label:l('حالة التعامل','Relationship status'),value:(x:Row)=>x.relationshipStatus==='suspended'?l('موقوف','Suspended'):x.relationshipStatus==='active'?l('نشط','Active'):l('غير محدد','Unassigned')}]:[]),...(masterKind==='customers'?[{key:'address',label:l('العنوان المرجعي','Reference address')},{key:'governorate',label:l('المحافظة المرجعية','Reference governorate'),value:(x:Row)=>ar?(EGYPT_GOVERNORATES.find(g=>g[0]===x.governorate)?.[1]||''):x.governorate||''}]:[]), { key: 'edit', label: l('الإجراءات','Actions'),filterable:false, render: x => <div className="inline-actions">{can('master') && masterKind !== 'batches' && <Button variant="ghost" onClick={() => masterForm(masterKind, x)}>{l('تعديل', 'Edit')}</Button>}{deleteButton(masterKind,x.id)}</div> }]} rows={s[masterKind].filter(x => [x.code,x.name,...(masterKind==='products'?[x.sku,x.sourceProductId,x.category,x.companyName]:masterKind==='carriers'?[x.contactName,x.phone,x.email,x.serviceType]:[])].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()) && (masterKind !== 'products' || project === 'all' || x.projectId === project)&&(masterKind!=='customers'||project==='all'||x.projectId===project||customerProjectIds.has(x.id)))}/>
</CollapsiblePanel></TabsContent>{commandCenter&&masterKind==='customers'&&<TabsContent value="geography"><CustomerGeography s={s} ar={ar} project={project} run={run} canSave={can('save_customer_site')} onOpenRequest={setSelected} canExport={tableExportAllowed} loadExportState={loadOverviewExportState}/></TabsContent>}</Tabs>}
        {view === 2 && <>{commandCenter&&a&&<QuantityReviewQueue s={{...s,requests:scopeRows}} actor={a} ar={ar} onOpenRequest={setSelected}/>}<CollapsiblePanel sectionId="operational-requests" ar={ar} title={l('الطلبات الحالية', 'Current requests')} header={<div className="section-heading">
<h2>{l('الطلبات الحالية', 'Current requests')}</h2>
<div className="search">
<Search size={18}/>
<Input value={query} onChange={e => setQuery(e.target.value)} placeholder={l('بحث عن طلب أو عميل', 'Search request or customer')}/>
</div>
</div>}>
{orderDrillIds!==null&&<Button variant="outline" size="sm" onClick={()=>setOrderDrillIds(null)}>{l('عرض كل الطلبات','Show all requests')}</Button>}<GridTable tableId={"pilot-table-4"} columns={requestColumns} rows={[...requestRows].filter(r=>orderDrillIds===null||orderDrillIds.includes(r.id)).reverse()}/>
</CollapsiblePanel>{commandCenter&&<OrdersAnalytics s={s} ar={ar} filters={{project,warehouse,query,from,to,queue}} onSelectRequests={setOrderDrillIds} canExport={tableExportAllowed&&(!a?.access?.enabled||permissionDecision(a,'orders.export').allowed)} loadExportState={loadOverviewExportState}/>}</>}
        {commandCenter&&view===7&&<section className="panel cc-my-tasks">{a&&<QuantityReviewQueue s={{...s,requests:scopeRows}} actor={a} ar={ar} onOpenRequest={setSelected}/>}{a?.function==='representative'&&s.handoffs.some(h=>h.type==='custody_transfer'&&h.status==='awaiting_receiver')&&<CustodyTransfers s={s} actor={a} directory={snap?.courierDirectory||[]} run={run} ar={ar}/>}{((a?.function==='representative'&&!a?.resourceIds?.length)||(a?.function==='warehouse'&&!a?.warehouseIds?.length))&&<div className="notice" role="status"><ShieldCheck size={18}/><div><b>{l('حسابك يحتاج ربطًا قبل ظهور المهام','Your account needs an assignment link')}</b><p>{a?.function==='representative'?l('اطلب من المالك ربط حسابك بالمندوب من المستخدمين والصلاحيات؛ بعدها تظهر تكليفاتك هنا.','Ask the owner to link your courier profile in Users & permissions; your assignments will then appear here.'):l('اطلب من المالك تحديد مخازنك من المستخدمين والصلاحيات؛ بعدها تظهر مهام الاستلام والصرف هنا.','Ask the owner to set your warehouse scope in Users & permissions; receipt and issue tasks will then appear here.')}</p></div></div>}<div className="cc-task-intro"><div><strong>{l('المطلوب منك الآن','What you need to do now')}</strong><p>{l('افتح المهمة وسجّل الكمية الفعلية. بعد الحفظ تظهر الخطوة التالية ومن ينفذها.','Open the task and enter the actual quantity. Saving shows the next step and its responsible role.')}</p></div><span>{l('دورك','Your role')}: <strong>{ar?(functionNames[a?.function]||roleNames[a?.role]||'—'):(a?.function==='all'?a?.role:a?.function)||'—'}</strong></span></div><div className="cc-task-filters" role="group" aria-label={l('حالة مهامي','My task status')}>{[['ready','جاهز لدوري','Ready for me'],['waiting','بانتظار خطوة','Waiting'],['completed','مكتمل','Completed'],['all','كل ما يخصني','All assigned']].map(([key,arabic,english])=><button key={key} type="button" aria-pressed={myTaskFilter===key} onClick={()=>setMyTaskFilter(key)}>{l(arabic,english)} · {myTaskRows.filter(x=>key==='all'||x.state===key).length}</button>)}</div><CollapsiblePanel sectionId="my-task-records" ar={ar} title={l('قائمة مهامي','My task list')} className="cc-task-list"><GridTable tableId={"pilot-table-5"} empty={l('لا توجد مهام في هذه الحالة ضمن الفلاتر الحالية.','No tasks in this status within the current filters.')} rows={myTaskRows.filter(x=>myTaskFilter==='all'||x.state===myTaskFilter)} columns={[
{key:'request',label:l('رقم الطلب / المهمة','Request / task'),render:x=><button className="row-link" onClick={()=>setSelected(x.request.id)}><b dir="ltr">{x.request.code}</b>{x.step.task&&<span dir="ltr">{x.step.task.code}</span>}</button>},
{key:'type',label:l('نوع الطلب','Request type'),render:x=>typeLabel(x.request,ar)},
{key:'project',label:l('المشروع','Project'),render:x=>name('projects',x.request.projectId)},
{key:'status',label:l('مكان الطلب الآن','Current status'),render:x=><Status value={x.request.status} ar={ar}/>},
{key:'required',label:l('المطلوب الآن','Required now'),render:x=><span>{x.step.action?(ar?x.step.ar:x.step.en):l('اكتمل الطلب','Request completed')}{x.step.blocked&&<small>{x.step.blocked}</small>}</span>},
{key:'responsible',label:l('عند مين؟','Responsible'),render:x=>x.step.executor||responsible(x.step.action,ar)},
{key:'from',label:l('من','From'),render:x=>x.step.source||'—'},
{key:'to',label:l('إلى','To'),render:x=>x.step.destination||'—'},
{key:'quantity',label:l('المخطط للمهمة','Task planned'),render:x=>x.step.task?.quantity??'—'},
{key:'available',label:l('المتاح لهذه الخطوة','Available for step'),render:x=>x.step.max??'—'},
{key:'assignedBy',label:l('كلّفك مين؟','Assigned by'),render:x=>snap.members?.find((m:any)=>m.userId===(x.step.task?.assignedBy||x.step.task?.createdBy))?.name||(x.step.task?.createdBy===a?.userId?a.name:'—')},
{key:'dueDate',label:l('الموعد','Due date'),render:x=>x.step.task?.dueDate||x.request.dueDate||'—'},
{key:'action',label:l('الخطوة التالية','Next step'),render:x=><Button size="sm" variant={x.ready?'default':'outline'} onClick={()=>setSelected(x.request.id)}>{x.ready?l('ابدأ الخطوة','Start step'):l('افتح المتابعة','View progress')}</Button>}
]}/></CollapsiblePanel></section>}
        {view === 3 && <>
<InventorySummary s={s} project={project} warehouse={warehouse} ar={ar}/>
<CollapsiblePanel sectionId="inventory-balances" ar={ar} title={l('رصيد المخزون', 'Stock ledger balance')} header={<div className="section-heading">
<h2>{l('رصيد المخزون', 'Stock ledger balance')}</h2>
<div className="inline-actions">{can('opening') && <Button onClick={() => setModal({ title: l('رصيد افتتاحي حسب كود المنتج', 'Opening balance by Product Code'), subtitle: l('لا يُنشأ باتش أو تاريخ صلاحية تلقائيًا. اترك الدفعة فارغة إن لم تتوفر بياناتها.', 'No batch or expiry is invented. Leave batch empty when trace data is unavailable.'), fields: [field('productCode', 'كود المنتج', 'Product Code', 'select', s.products.map(x => ({ value: x.code, label: x.code + ' · ' + x.name }))), field('warehouseId', 'المخزن', 'Warehouse', 'select', opts('warehouses')), field('quantity', 'الكمية', 'Quantity', 'number'), { ...field('batchId', 'الدفعة الاختيارية', 'Optional batch', 'select', opts('batches')), required: false }, field('reason', 'سبب القيد', 'Reason')], initial: { warehouseId: s.warehouses[0]?.id, reason: 'Pilot opening balance' }, submit: v => run({ type: 'opening', ...v }) })}>
<Plus size={16}/>{l('رصيد افتتاحي', 'Opening balance')}</Button>}</div>
</div>}>
<GridTable tableId={"pilot-table-6"} columns={[{ key: 'code', label: l('المنتج', 'Product'), render: x => <div className="cell-stack">
<b>{x.code}</b>
<span>{x.name}</span>
</div> }, { key: 'warehouse', label: l('المخزن', 'Warehouse') }, { key: 'batch', label: l('الدفعة / الصلاحية', 'Batch / expiry') }, { key: 'onHand', label: l('الموجود', 'On hand') }, { key: 'reserved', label: l('المحجوز', 'Reserved') }, { key: 'available', label: l('المتاح', 'Available') }]} rows={products.flatMap(p => s.warehouses.filter(w=>warehouse==='all'||w.id===warehouse).flatMap(w => { const ms = s.movements.filter(x => x.productId === p.id && x.warehouseId === w.id); return [...new Set(ms.map(x => x.batchId || ''))].map(b => ({ ...p, id: p.id + w.id + b, ...balance(s, p.id, w.id, b), warehouse: w.name, batch: b ? (name('batches', b) + ' · ' + (s.batches.find(x => x.id === b)?.expiryDate || '—')) : p.tracked ? l('محظور للصرف · بيانات التتبع ناقصة', 'Blocked · missing trace data') : '—' })); }))}/>
</CollapsiblePanel>
<CollapsiblePanel sectionId="inventory-movements" ar={ar} title={l('الحركات المرحّلة', 'Posted movements')} header={<div className="section-heading">
<h2>{l('الحركات المرحّلة', 'Posted movements')}</h2>
<span className="subtle">{l('تصحيح بالحركة العكسية فقط', 'Corrections use reversal movements')}</span>
</div>}>
<GridTable tableId={"pilot-table-7"} columns={[{ key: 'code', label: 'ID' }, { key: 'type', label: l('الحركة', 'Movement') }, { key: 'productId', label: l('المنتج', 'Product'), render: x => name('products', x.productId) }, { key: 'delta', label: l('الكمية', 'Quantity') }, { key: 'postedAt', label: l('الوقت', 'Time'), render: x => new Date(x.postedAt).toLocaleString(ar ? 'ar-EG' : 'en-GB') }, { key: 'actions', label: '', render: x => x.type === 'opening' && can('reverse') ? <div className="inline-actions">{!x.batchId && s.products.find(p => p.id === x.productId)?.tracked && <Button variant="outline" onClick={() => setModal({ title: l('استكمال بيانات الدفعة', 'Complete batch trace'), fields: [field('batchId', 'الدفعة', 'Batch', 'select', opts('batches')), field('quantity', 'الكمية', 'Quantity', 'number'), field('reason', 'السبب', 'Reason')], submit: v => run({ type: 'trace_opening', movementId: x.id, ...v }) })}>{l('استكمال التتبع', 'Complete trace')}</Button>}<Button variant="ghost" onClick={() => setModal({ title: l('عكس رصيد افتتاحي', 'Reverse opening movement'), fields: [field('reason', 'سبب التصحيح', 'Correction reason')], submit: v => run({ type: 'reverse', movementId: x.id, ...v }) })}>{l('عكس', 'Reverse')}</Button>
</div> : null }]} rows={[...s.movements].filter(m=>(warehouse==='all'||m.warehouseId===warehouse)&&products.some(p=>p.id===m.productId)&&(!from||cairoDay(m.postedAt)>=from)&&(!to||cairoDay(m.postedAt)<=to)).reverse()}/>
</CollapsiblePanel>
</>}
        {(view === 4 || commandCenter&&view===8) && <>{commandCenter&&view===4&&<>{a&&<ExternalTransportWorkspace s={s} actor={a} ar={ar} run={run} can={can} onOpenRequest={setSelected} filters={{project,warehouse,query,from,to,queue}} canExport={exportSourceAllowed('external_shipments')} loadExportState={()=>loadOverviewExportState('external_shipments')}/>}<JourneyWorkspace s={s} actor={a} ar={ar} run={run} onOpenRequest={setSelected} filters={{project,warehouse,query,from,to,queue}}/><EgyptTrips s={s} routes={routeRows} ar={ar} onRequest={setSelected}/></>}
{(!commandCenter||view===8)&&<>
<DispatchBoard s={s} rows={requestRows} ar={ar} onRequest={setSelected}/>
<CollapsiblePanel sectionId="dispatch-awaiting" ar={ar} title={l('طلبات تحتاج تكليفًا','Requests awaiting assignment')} header={<div className="section-heading"><h2>{l('طلبات تحتاج تكليفًا','Requests awaiting assignment')}</h2><Input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={l('بحث عن طلب أو عميل','Search request or customer')}/></div>}><GridTable tableId={"pilot-table-8"} columns={requestColumns} rows={requestRows.filter(r=>['approved','reserved','awaiting_assignment'].includes(r.status))}/></CollapsiblePanel>
</>}
{(!commandCenter||view===4)&&<CollapsiblePanel sectionId="dispatch-route-plans" ar={ar} title={l('خطط الرحلات', 'Route plans')} header={<div className="section-heading">
<div>
<span className="eyebrow">DISPATCH CONTROL</span>
<h2>{l('خطط الرحلات', 'Route plans')}</h2>
</div>{can('create_route') && <Button onClick={() => setModal({ draftKey:'new-route',title: l('رحلة متعددة المحطات', 'Multi-stop route'), subtitle: l('ترتيب اختيار الطلبات هو ترتيب المحطات', 'Selected order is the stop sequence'), fields: [field('code', 'كود الرحلة', 'Route code'), field('name', 'اسم الرحلة', 'Route name'), field('date', 'التاريخ', 'Date', 'date')], initial: { code: 'RT-' + Date.now().toString().slice(-6), date: new Date().toISOString().slice(0, 10) }, multiple: s.requests.filter(x => x.status === 'documents_ready'&&!s.tasks.some(t=>t.requestId===x.id&&!t.autoGenerated)), submit: v => run({ type: 'create_route', ...v }) })}>
<Plus size={16}/>{l('تخطيط رحلة', 'Plan route')}</Button>}{can('create_route')&&<Button variant="outline" onClick={()=>setModal({draftKey:'new-task-route',title:l('رحلة من مهام التسليم','Route from delivery tasks'),fields:[field('code','كود الرحلة','Route code'),field('name','اسم الرحلة','Route name'),field('date','التاريخ','Date','date')],initial:{date:cairoDay()},multiple:s.tasks.filter(t=>t.taskType==='delivery'&&!t.routeId&&t.executorId&&s.requests.some(r=>r.id===t.requestId&&r.status==='documents_ready')),submit:v=>run({type:'create_route',code:v.code,name:v.name,date:v.date,taskIds:v.requestIds})})}>{l('رحلة بالمهام والوجهات','Route by tasks & destinations')}</Button>}</div>}>{!routeRows.length ? <div className="empty">
<Truck size={32}/>
<p>{l('اعتمد المستندات ثم أنشئ رحلة من الطلبات الجاهزة', 'Verify documents, then plan a route from ready requests')}</p>
</div> : <div className="table-shell"><ManagedTable tableId="pilot:2"><table><thead><tr>{[l('الرحلة / التاريخ','Route / date'),l('ترتيب','Stop'),l('الطلب / المهمة','Request / task'),l('المسؤول','Executor'),l('من','From'),l('إلى','To'),l('بعدها إلى','Then to'),l('الحالة','Status'),l('المطلوب الآن','Next action')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{routeRows.flatMap(rt=>{const stops=s.stops.filter(x=>x.routeId===rt.id).sort((a,b)=>a.sequence-b.sequence);return stops.map((st,i)=>{const t=s.tasks.find(t=>t.id===st.taskId),nextStop=stops[i+1];return <tr key={st.id}><td><b>{rt.name}</b><small>{rt.code} · {rt.date}</small></td><td>{st.sequence}</td><td><button className="text-link" onClick={()=>setSelected(st.requestId)}>{name('requests',st.requestId)}</button><small>{t?.code||s.tasks.filter(t=>t.requestId===st.requestId&&t.autoGenerated).map(t=>t.code).join(' / ')}</small></td><td>{t?name('resources',t.executorId):[...new Set(s.assignments.filter(x=>x.requestId===st.requestId).map(x=>name('resources',x.executorId)))].join(' / ')}</td><td>{i?stops[i-1].destination:t?taskSource(s,t):[...new Set(s.assignments.filter(x=>x.requestId===st.requestId).map(x=>name('warehouses',x.warehouseId)))].join(' / ')}</td><td>{st.destination}</td><td>{nextStop?.destination||l('نهاية محطات الرحلة؛ راجع أي مرتجع','End of route; check pending returns')}</td><td><Status ar={ar} value={st.status}/></td><td>{rt.status==='planned'&&i===0&&<Button size="sm" disabled={busy||!can('depart')} onClick={()=>safe({type:'depart',routeId:rt.id})}>{l('تأكيد المغادرة','Depart')}</Button>}{rt.status==='in_transit'&&['planned','failed'].includes(st.status)&&<Button size="sm" disabled={busy||!can('arrive')} onClick={()=>safe({type:'arrive',stopId:st.id})}>{l('وصلت للوجهة','Arrived')}</Button>}{st.status==='arrived'&&<Button size="sm" variant="outline" onClick={()=>setSelected(st.requestId)}>{l('سجّل نتيجة المهمة','Record task result')}</Button>}</td></tr>})})}</tbody></table></ManagedTable></div>}</CollapsiblePanel>
}
<CollapsiblePanel sectionId="dispatch-tasks" ar={ar} title={l('كل المهام — مين هيعمل إيه وهيروح فين؟','All tasks — who, what and where?')} header={<div className="section-heading"><h2>{l('كل المهام — مين هيعمل إيه وهيروح فين؟','All tasks — who, what and where?')}</h2></div>}><GridTable tableId={"pilot-table-9"} rows={s.tasks.filter(t=>requestIds.has(t.requestId))} columns={[{key:'code',label:l('رقم المهمة','Task number')},{key:'requestId',label:l('الطلب','Request'),render:t=><button className="text-link" onClick={()=>setSelected(t.requestId)}>{name('requests',t.requestId)}</button>},{key:'executorId',label:l('المسؤول','Executor'),render:t=>t.executorId?name('resources',t.executorId):l('بانتظار مسؤول الحركة','Awaiting assignment')},{key:'source',label:l('من','From'),render:t=>taskTravelFrom(s,t)},{key:'destination',label:l('إلى','To')},{key:'quantity',label:l('الكمية','Quantity')},{key:'next',label:l('بعدها','Then'),render:t=>taskNext(s,t)},{key:'status',label:l('الحالة','Status'),render:t=><Status ar={ar} value={t.status}/>},{key:'action',label:l('المطلوب','Action'),render:t=><Button size="sm" variant="outline" onClick={()=>setSelected(t.requestId)}>{t.taskType==='return'?l('متابعة المرتجع','Return steps'):l('افتح خطوات المهمة','Open task steps')}</Button>}]} /></CollapsiblePanel>
<CollapsiblePanel sectionId="dispatch-custody" ar={ar} title={l('الإسنادات والعهدة', 'Assignments & custody')} header={<div className="section-heading">
<h2>{l('الإسنادات والعهدة', 'Assignments & custody')}</h2>
</div>}>
<GridTable tableId={"pilot-table-10"} columns={[{ key: 'requestId', label: l('الطلب', 'Request'), render: x => <button className="text-link" onClick={() => setSelected(x.requestId)}>{name('requests', x.requestId)}</button> }, { key: 'warehouseId', label: l('المخزن', 'Warehouse'), render: x => name('warehouses', x.warehouseId) }, { key: 'executorId', label: l('المندوب', 'Executor'), render: x => name('resources', x.executorId) }, { key: 'carrierId', label: l('الناقل', 'Carrier'), render: x => name('carriers', x.carrierId) }, { key: 'handoff', label: '', render: x => !commandCenter&&can('handoff') ? <Button variant="ghost" onClick={() => setModal({ title: l('تسليم عهدة لمندوب آخر', 'Custody handover'), fields: [field('toId', 'المندوب المستلم', 'Receiving executor', 'select', opts('resources')), field('reason', 'السبب', 'Reason')], submit: v => run({ type: 'handoff', assignmentId: x.id, ...v }) })}>{l('تسليم عهدة', 'Hand over')}</Button> : null }]} rows={s.assignments.filter(x=>requestIds.has(x.requestId))}/><CustodyTransfers s={s} actor={a} directory={snap?.courierDirectory||[]} run={run} ar={ar}/>
</CollapsiblePanel>
</>}
        {view === 5 && <>
<CollapsiblePanel sectionId="documents-records" ar={ar} title={l('المستندات وإثباتات التسليم', 'Documents & proof of delivery')} header={<div className="section-heading">
<h2>{l('المستندات وإثباتات التسليم', 'Documents & proof of delivery')}</h2>
<span className="subtle">صورة أو أي ملف / Photo or file · 5 MB</span>
</div>}>
<EvidenceTable s={s} docs={s.documents.filter(x=>requestIds.has(x.requestId))} ar={ar} openRequest={setSelected}/>

</CollapsiblePanel>
<CollapsiblePanel sectionId="exceptions-returns" ar={ar} title={l('الاستثناءات والمرتجعات', 'Exceptions & returns')} header={<div className="section-heading">
<h2>{l('الاستثناءات والمرتجعات', 'Exceptions & returns')}</h2>
</div>}>
<GridTable tableId={"pilot-table-11"} columns={[{ key: 'requestId', label: l('الطلب', 'Request'), render: x => name('requests', x.requestId) }, { key: 'reason', label: l('السبب', 'Reason') }, { key: 'type', label: l('النوع', 'Type') }, { key: 'quantity', label: l('الكمية', 'Quantity') }, { key: 'resolve', label: '', render: x => x.type === 'exception' && !x.resolved && can('resolve_exception') ? <Button variant="outline" onClick={() => setModal({ title: l('إغلاق الاستثناء', 'Resolve exception'), fields: [field('reason', 'كيف تمت المعالجة', 'Resolution')], submit: v => run({ type: 'resolve_exception', id: x.id, ...v }) })}>{l('معالجة', 'Resolve')}</Button> : x.resolved ? <Check size={17}/> : null }]} rows={[...s.exceptions.filter(x=>requestIds.has(x.requestId)).map(x => ({ ...x, type: 'exception' })), ...s.returns.filter(x=>requestIds.has(x.requestId)).map(x => ({ ...x, type: 'return' }))]}/>
</CollapsiblePanel>
</>}
        {view === 6 && <Tabs value={reportTab} onValueChange={setReportTab}>
<TabsList className="report-tabs">
<TabsTrigger value="analysis">{l('تحليل ملف','Analyze file')}</TabsTrigger>
<TabsTrigger value="reports">{l('التقارير', 'Reports')}</TabsTrigger>
<TabsTrigger value="import">{l('الاستيراد', 'Import')}</TabsTrigger>
<TabsTrigger value="audit">{l('سجل التدقيق', 'Audit trail')}</TabsTrigger>
<TabsTrigger value="admin" disabled={!accountAdmin}>
<Lock size={14}/>{l('إدارة الفريق', 'Team admin')}</TabsTrigger>
</TabsList>
<TabsContent value="analysis"><FileAnalysis ar={ar}/></TabsContent>
<TabsContent value="reports">
{commandCenter&&<div className="inline-actions reports-sample-action"><Button variant="outline" asChild><a href="/reports-sample.html" target="_blank" rel="noopener noreferrer">{l('تجربة ببيانات وهمية','Try with sample data')} ↗</a></Button><small className="subtle">{l('منفصلة عن بيانات التشغيل','Separate from operational data')}</small></div>}
<Tabs value={reportArea} onValueChange={setReportArea}><TabsList aria-label={l('عرض التقارير','Report views')}><TabsTrigger value="basic">{l('التقارير الأساسية','Basic reports')}</TabsTrigger><TabsTrigger value="analytics">{l('المحافظات وقيمة بضاعة العملاء','Governorates & customer goods value')}</TabsTrigger></TabsList><TabsContent value="basic">
{commandCenter&&<><ReportsOverview s={s} ar={ar} filters={{project,warehouse,query,from,to,queue}} onOpenRequest={setSelected} loadExportState={a?.access?.enabled&&!permissionDecision(a,'reports.export').allowed?undefined:loadOverviewExportState}/><WarehouseIssueReport s={s} ar={ar} filters={{project,warehouse,query,from,to,queue}} onOpenRequest={setSelected} loadExportState={loadOverviewExportState} canExport={tableExportAllowed&&(!a?.access?.enabled||permissionDecision(a,'reports.export').allowed)}/>{travelRequestId&&<p className="notice">{l('تفاصيل الرحلات للطلب','Journey details for request')} {s.requests.find(x=>x.id===travelRequestId)?.code}<Button variant="ghost" onClick={()=>setTravelRequestId('')}>{l('عرض كل الطلبات','Show all requests')}</Button></p>}<CollapsiblePanel sectionId="reports-courier" ar={ar} title={l('المناديب والرحلات والزيارات','Couriers, journeys and visits')}><CourierReports s={s} actor={a} ar={ar} run={run} onOpenRequest={setSelected} filters={{project,warehouse,query,from,to,queue}} requestIds={travelRequestId?[travelRequestId]:undefined}/></CollapsiblePanel></>}
{commandCenter&&a&&<ExternalTransportReports s={s} ar={ar} onOpenRequest={setSelected} filters={{project,warehouse,query,from,to,queue}} canExport={exportSourceAllowed('external_shipments')}/>}
<CollapsiblePanel sectionId="reports-data" ar={ar} title={l('تقارير البيانات والمنتجات والتسليم والمرتجع','Data, products, deliveries and returns reports')} defaultOpen={reportKind==='customer_returns'}>
<section className="panel">
<div className="section-heading">
<h2>{reportKind==='customer_returns'?l('تفاصيل المرتجع والعهدة','Returns & custody report'):l('تقرير البيانات المختار', 'Selected data report')}</h2>
<Button variant="outline" disabled={!!a?.access?.enabled&&(!permissionDecision(a,'reports.export').allowed||!permissionDecision(a,'orders.export').allowed)} onClick={()=>void exportRows()}>
<Download size={16}/>{l('تصدير JSON التفصيلي', 'Export detailed JSON')}</Button>
</div>
<p className="panel-caption">{l('يشمل كل النتائج المطابقة للمشروع والمخزن والفترة والبحث والحالة، وليس الصفحة الحالية فقط. ليس نسخة احتياطية.', 'All results matching project, warehouse, date, search and status filters; not just the current page. This is not a full backup.')}</p>
{commandCenter&&reportKind==='customer_returns'&&<div className="return-report-shortcuts"><Button variant="outline" onClick={()=>{setReportFilters({pending:{op:'range',min:'0.001'}});setReportSelected([]);}}>{l('المرتجع الذي لم يقبله المخزن بعد','Returns pending warehouse acceptance')}</Button><Button variant="ghost" onClick={()=>setReportFilters({})}>{l('عرض كل المرتجعات','Show all returns')}</Button><Button variant="outline" onClick={()=>setView(3)}>{l('ملخص عهدة النقل والمخزون','Transport custody & stock summary')}</Button></div>}<label>{l('جدول التقرير','Report table')}<select value={reportKind} onChange={e=>{setReportKind(e.target.value);setReportSelected([]);setReportFilters({});}}>{Object.entries({requests:'الطلبات / Requests',products:'الأصناف / Products',customers:'العملاء / Customers',tasks:'المهام / Tasks',movements:'الحركات المرحّلة / Movements',documents:'المستندات / Documents',customer_deliveries:'تفاصيل تسليم العملاء / Customer deliveries',customer_returns:'تفاصيل المرتجع والعهدة / Returns & custody'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
<ExportPanel key={reportKind} ar={ar} kind={reportKind} filters={{project,warehouse,from,to,query,queue,columnFilters:reportFilters}} selectedIds={reportSelected.filter(id=>exportedRows(s,reportKind,{project,warehouse,from,to,query,queue}).some(r=>r.id===id))} visibleColumns={reportVisible}/><GridTable tableId={'report:'+reportKind} rows={exportedRows(s,reportKind,{project,warehouse,from,to,query,queue})} columns={exportColumns[reportKind].map(c=>({key:c.key,label:ar?c.ar:c.en,type:c.type}))} columnFilters={reportFilters} onColumnFilters={setReportFilters} selectedIds={reportSelected} onSelection={setReportSelected} onVisibleColumns={setReportVisible}/>
</section>
</CollapsiblePanel>
</TabsContent><TabsContent value="analytics"><GeoValueReports s={s} ar={ar} filters={{project,warehouse,query,from,to,queue}} onOpenRequest={setSelected} canExport={exportSourceAllowed('geo_values')} loadExportState={loadGeoExportState}/></TabsContent></Tabs>
</TabsContent>
<TabsContent value="audit">
<CollapsiblePanel sectionId="audit-events" ar={ar} title={l('سجل التدقيق', 'Audit trail')} header={<div className="section-heading">
<h2>{l('سجل التدقيق', 'Audit trail')}</h2>
<span className="subtle">{l('آخر 200 إجراء · السجل الكامل في النسخ الاحتياطية', 'Latest 200 actions · full history in backups')}</span>
</div>}>
<GridTable tableId={"pilot-table-12"} rows={snap.audit} columns={[{ key: 'at', label: l('الوقت', 'Time'), render: x => new Date(x.at).toLocaleString(ar ? 'ar-EG' : 'en-GB') }, { key: 'actor', label: l('المنفذ', 'Operator') }, { key: 'action', label: l('الإجراء', 'Action') }, { key: 'record_id', label: l('معرّف السجل', 'Record ID') }, { key: 'reason', label: l('السبب', 'Reason') },{key:'channel',label:l('المصدر','Source') }]}/>
</CollapsiblePanel>
</TabsContent>
<TabsContent value="import">
<ImportCenter s={s} ar={ar} run={run} can={['products','customers','projects','requests','opening'].some(kind=>can('import',kind as Kind))} busy={busy}/>
<CollapsiblePanel sectionId="import-batches" ar={ar} title={l('دفعات الاستيراد', 'Import batches')} header={<div className="section-heading">
<h2>{l('دفعات الاستيراد', 'Import batches')}</h2>
</div>}>
<GridTable tableId={"pilot-table-13"} rows={s.imports} columns={[{key:'code',label:'Import Batch ID'},{key:'name',label:l('الملف','File')},{key:'count',label:l('الصفوف','Rows')},{key:'status',label:l('الحالة','Status')},{key:'delete',label:l('الإجراءات','Actions'),render:x=>deleteButton('imports',x.id)}]}/>
</CollapsiblePanel>
</TabsContent>
<TabsContent value="admin">{a?.access?.enabled&&accountAdmin&&<AccessManagement ar={ar} platformOwner={false} onChanged={refresh}/>} {owner && <>
{!a?.access?.enabled&&<><CollapsiblePanel sectionId="member-directory" ar={ar} title={l('أعضاء الفريق والصلاحيات', 'Team members & permissions')} header={<div className="section-heading">
<h2>{l('أعضاء الفريق والصلاحيات', 'Team members & permissions')}</h2>
</div>}>
<p className="panel-caption">{l('بعد انضمام زميل بالرابط يظهر هنا. اختر تعديل الصلاحيات لتحديد دوره ووظيفته ومشاريعه. المالك وحده يدير العضويات.','After a teammate joins by invitation, they appear here. Edit permissions to set their role, function and projects. Only the owner manages memberships.')}</p>
<GridTable tableId={"pilot-table-14"} rows={snap.members} columns={[{key:'name',label:l('الاسم','Name')},{key:'role',label:l('الدور','Role'),render:x=>l(roleNames[x.role],x.role)},{key:'function',label:l('الوظيفة','Function'),render:x=>l(functionNames[x.function],x.function)},{key:'scope',label:l('المشاريع','Projects'),render:x=>x.projectIds==null?l('كل المشاريع','All projects'):x.projectIds.map((id:string)=>name('projects',id)).join(' · ')||l('لا مشاريع','No projects')},{key:'active',label:l('الحالة','Status'),render:x=>x.active?l('نشط','Active'):l('موقوف','Disabled')},{key:'edit',label:'',render:x=>x.role!=='owner'?<Button variant="outline" onClick={()=>setEditMember(x)}>{l('تعديل الصلاحيات','Edit permissions')}</Button>:<ShieldCheck size={18}/>}]} />
</CollapsiblePanel>
</>}<InvitationPanel s={s} ar={ar} run={run} invites={snap.invitations||[]} busy={busy}/>
<section className="panel admin-panel">
<h2>{l('النسخ الاحتياطي والاستعادة', 'Backup & recovery')}</h2>
<p>{l('نسخة كاملة للبيانات والمرفقات وسجل التدقيق. الاستعادة تنشئ Dataset جديدة وتحتفظ بالسابقة. حد المرفقات للنسخة 20 MB.', 'Full dataset, attachments and audit history. Restore creates a new dataset and retains the previous one. Backup attachment limit: 20 MB.')}</p>
<div className="inline-actions">
<Button disabled={busy} onClick={async () => { try {
            await backup('backup');
        }
        catch { } }}>
<Download size={16}/>{l('إنشاء نسخة كاملة', 'Create full backup')}</Button>
<Button variant="outline" className="danger-button" onClick={() => setModal({ title: l('إعادة ضبط بيانات الاختبار', 'Reset pilot dataset'), subtitle: l('ستُحفظ نسخة كاملة أولًا ثم تُنشأ مجموعة فارغة جديدة. اكتب RESET.', 'A full recovery copy is saved first, then a new empty dataset is created. Type RESET.'), fields: [field('confirmation', 'اكتب RESET', 'Type RESET')], submit: v => backup('reset', v) })}>{l('إعادة ضبط', 'Reset demo data')}</Button>
</div>
<GridTable tableId={"pilot-table-15"} rows={snap.backups} columns={[{ key: 'at', label: l('التاريخ', 'Created'), render: x => new Date(x.at).toLocaleString() }, { key: 'id', label: 'Backup ID' }, { key: 'actions', label: '', render: x => <div className="inline-actions">
<a className="text-link" href={'/api/backup?id=' + x.id}>{l('تنزيل', 'Download')}</a>
<Button variant="ghost" onClick={() => setConfirm({ title: l('استعادة إلى مجموعة جديدة', 'Restore to a new dataset'), description: l('ستُحفظ المجموعة الحالية قبل الانتقال إلى نسخة مستعادة مستقلة.', 'The current dataset will be backed up before switching to an independent restored copy.'), action: () => backup('restore', { backupId: x.id }) })}>{l('استعادة', 'Restore')}</Button>
</div> }]}/>
</section>
</>}</TabsContent>
</Tabs>}
        {view===9&&owner&&a?.access?.enabled&&<AccessManagement ar={ar} platformOwner={true} onChanged={refresh}/>}
        <footer className="workspace-footer">
<span>
<span className={'sync-dot ' + (online ? '' : 'offline')}/>{online ? l('متصل · تحديث كل 20 ثانية', 'Connected · refreshes every 20 seconds') : l('غير متصل · البيانات قديمة', 'Disconnected · data may be stale')}</span>
<span>{snap.dataset.name} · v{snap.dataset.version}</span>
<span>{l('بيانات تجريبية فقط', 'Test data only')}</span>
</footer>
</> : <section className="panel welcome">
<ShieldCheck size={40}/>
<h2>{l('مساحة تشغيل الفريق', 'Team operations workspace')}</h2>
<p>{l('تسجيل الدخول مطلوب للوصول للطلبات والمخزون والمستندات المشتركة.', 'Sign in to access shared requests, inventory and documents.')}</p>
<a className="login-link" target="_top" href={'/signin-with-chatgpt?return_to=' + encodeURIComponent(returnTo)}>{l('تسجيل الدخول بحساب ChatGPT', 'Sign in with ChatGPT')}<ArrowUpRight size={17}/>
</a>
<a href="/walkthrough" className="text-link">{l('جرّب الدورة ببيانات تدريبية','Try the training walkthrough')}</a><small>{l('يلزم تصريح فتح الموقع وعضوية داخل التطبيق', 'Site access and app membership are both required')}</small>
</section>}
    </main>
</SidebarInset>
    <Sheet open={!!r} onOpenChange={o => { if (!o)
        setSelected(null); }}>
<SheetContent ref={node=>{if(node&&r)try{node.scrollTop=Number(localStorage.getItem('daf-scroll-v9:'+a?.userId+':'+snap?.dataset?.id+':'+r.id)||0);}catch{}}} onScroll={e=>{if(r)try{localStorage.setItem('daf-scroll-v9:'+a?.userId+':'+snap?.dataset?.id+':'+r.id,String(e.currentTarget.scrollTop));}catch{}}} side={ar ? 'left' : 'right'} className="request-sheet">
<SheetHeader>
<Button type="button" variant="outline" size="sm" onClick={()=>setSelected(null)}>{l('رجوع للقائمة — مكانك محفوظ','Back to list — position saved')}</Button><span className="eyebrow">REQUEST WORKSPACE</span>
<SheetTitle>{r?.code}</SheetTitle>
<SheetDescription>{r?.destination} · {r && name('customers', r.customerId)}</SheetDescription>
</SheetHeader>{r && <div className="request-body">
<div className="request-summary">
<Status value={r.status} ar={ar}/>
<span>{name('projects', r.projectId)}</span>
<span>{r.dueDate}</span>
</div>
<Progress value={Math.max(0, requestFlow(r).indexOf(r.status) + 1) / requestFlow(r).length * 100}/>
<div className={commandCenter?'cc-request-layout':undefined}>{commandCenter&&<CommandJourney s={s} r={r} ar={ar} can={type=>type!=='courier_collect'||a?.function==='representative'?can(type):false} onReview={setReviewStep}/>}<div className={commandCenter?'cc-request-main':undefined}><RequestEvolution key={'evolution:'+r.id} s={s} r={r} actor={a} ar={ar} run={run} can={can} reviewStep={reviewStep} onReviewClosed={()=>setReviewStep('')} onReport={()=>{setTravelRequestId(r.id);setSelected(null);setView(6);setReportTab('reports');}}/><AllocationPlanner key={r.id} s={s} r={r} ar={ar} run={run} editable={can('plan_allocations')&&['draft','approved','assigned','documents_ready','ready'].includes(r.status)&&!s.reservations.some(x=>x.requestId===r.id&&x.status==='issued')&&!s.handoffs.some(h=>h.requestId===r.id&&h.type==='loading_confirmation')&&!s.stops.some(st=>st.requestId===r.id&&s.routes.some(rt=>rt.id===st.routeId&&rt.status!=='planned'))}/><RequestWorkframe key={r.id} s={s} r={r} actor={a} ar={ar} run={run} upload={uploadFile} showJourney={!commandCenter} onReview={setReviewStep}>{({can:workCan,run:workRun,section,role,showReturns})=><>
{section==='returns'&&<ReturnWorkspace s={s} r={r} ar={ar} can={workCan} run={workRun} upload={uploadFile} role={role}/>}
{section==='quantities'&&<ActualWorkspace s={s} r={r} ar={ar} can={()=>false} run={workRun} upload={uploadFile}/>}
{section==='documents'&&<>        <h3>{l('مستندات الطلب', 'Request documents')}</h3>
<EvidenceTable s={s} docs={s.documents.filter(x=>x.requestId===r.id)} ar={ar}/>{r.status!=='closed'&&workCan('upload')&&<AttachmentInput ar={ar} disabled={busy} onFile={f=>uploadFile(f,isReceipt(r)?'other':'pod')}/>}{['arrived', 'delivering', 'delivered'].includes(r.status) && workCan('pod') && <Button variant="outline" onClick={() => requestForm('pod', l('اعتماد إثبات التسليم', 'Record proof of delivery'), [...taskField(),field('documentId', 'ملف إثبات التسليم', 'POD file', 'select', s.documents.filter(x => x.requestId === r.id && x.purpose === 'pod').map(x => ({ value: x.id, label: x.name }))), field('recipient', 'المستلم', 'Recipient')])}>{l('تسجيل POD', 'Record POD')}</Button>}{s.pods.filter(x => x.requestId === r.id).map(x => <p className="notice" key={x.id}>
<Check size={17}/>{l('إثبات تسليم مسجل باسم', 'POD recorded for')} {x.recipient}</p>)}
</>}
{section==='execution'&&<>{s.reservations.some(x=>x.requestId===r.id&&x.status==='held')&&['representative','warehouse'].includes(role)&&<ActualWorkspace s={s} r={r} ar={ar} can={workCan} run={workRun} upload={uploadFile}/>}{extended(r)?<><OperationWorkspace s={s} r={r} ar={ar} can={workCan} run={workRun} upload={uploadFile} onDelete={id=>setDeleteTarget({kind:'tasks',id})}/>{deleteButton('requests',r.id)}</>:<><div className="sheet-actions">{[{ state: 'draft', type: 'submit', ar: 'إرسال للمراجعة', en: 'Submit for review' }, { state: 'review', type: 'approve', ar: 'اعتماد العمليات', en: 'Approve request' }, { state: 'approved', type: 'reserve', ar: 'حجز المخزون FEFO', en: 'Reserve stock · FEFO' }, { state: 'assigned', type: 'verify_documents', ar: 'متابعة — المرفق اختياري', en: 'Continue — attachment optional' }, { state: '__manual_pickup', type: 'load', ar: 'تأكيد الاستلام الفعلي', en: 'Actual pickup' }].filter(x => x.state === r.status && workCan(x.type)).map(x => <Button key={x.type} disabled={busy} onClick={() => safe({ type: x.type, requestId: r.id })}>{l(x.ar, x.en)}<ArrowUpRight size={16}/>
</Button>)}{r.status === 'draft' && workCan('edit_request') && <Button variant="outline" onClick={() => setModal({ draftKey:r.id+':edit-request',title: l('تعديل المسودة', 'Edit draft'), fields: [priorityField,field('dueDate','الموعد المطلوب','Due date','date'),...(!isReceipt(r)?[field('destination', 'عنوان التسليم', 'Destination')]:[]), { ...field('notes', 'ملاحظات', 'Notes', 'textarea'), required: false }], initial: { ...r, requestId:r.id, lines: s.lines.filter(x => x.requestId === r.id) }, lines: !s.tasks.some(t=>t.requestId===r.id), submit: v => run({ ...v,type: 'edit_request', requestId: r.id,lines:s.tasks.some(t=>t.requestId===r.id)?undefined:v.lines }) })}>{l('تعديل', 'Edit')}</Button>}{r.status === 'documents_ready' && workCan('create_route') && <Button onClick={() => { setSelected(null); setView(4); }}>{l('انتقل لتخطيط الرحلة', 'Go to route planning')}</Button>}{['arrived', 'delivering', 'delivered'].includes(r.status) && workCan('close') && <Button disabled={busy||!!closeReason(s,r)} title={closeReason(s,r)} onClick={() => setConfirm({ title: l('إغلاق الطلب', 'Close request'), description: l('سيتحقق الخادم من تسوية كل الكميات والمهام ومعالجة الاستثناءات. المرفق اختياري.', 'All quantities, tasks and exceptions will be verified before closure. Attachments are optional.'), action: () => run({ type: 'close', requestId: r.id }) })}>{l('إغلاق الطلب', 'Close request')}</Button>}</div>
{!isReceipt(r)&&<details><summary>{l('بيانات الطلب والتاريخ','Request details')}</summary><OperationDetails s={s} r={r} ar={ar} can={workCan}/></details>}
{isReceipt(r)&&<><p className="receipt-context">{l('المورد','Supplier')}: {r.supplierName} · {l('اعتماد الشراء','Purchase approval')}: {r.purchaseReference} · {l('المخزن','Warehouse')}: {name('warehouses',r.warehouseId)}</p>{r.status==='received'&&workCan('close_receipt')&&<Button disabled={busy||s.exceptions.some(e=>e.requestId===r.id&&!e.resolved)} onClick={()=>setConfirm({title:l('إغلاق طلب الاستلام','Close receipt request'),description:l('تم استلام جميع الكميات. سيبقى الطلب والمستند والرصيد محفوظين.','All quantities received. The request, document and stock remain saved.'),action:()=>run({type:'close_receipt',requestId:r.id})})}>{l('إغلاق طلب الاستلام','Close receipt request')}</Button>}</>}
<details open={['dispatcher','warehouse'].includes(role)||nextAction(s,r).action==='complete_task'}><summary>{l('المهام والمسؤولون','Tasks and assignees')}</summary><RequestTasks s={s} r={r} ar={ar} can={workCan} run={workRun} onDelete={id=>setDeleteTarget({kind:'tasks',id})}/></details>
{deleteButton('requests',r.id)}
<h3>{l('بنود الطلب', 'Request lines')}</h3>
<GridTable tableId={"pilot-table-16"} rows={s.lines.filter(x => x.requestId === r.id)} columns={[{ key: 'productId', label: l('المنتج', 'Product'), render: x => <div className="cell-stack">
<b>{s.products.find(p => p.id === x.productId)?.code}</b>
<span>{name('products', x.productId)}</span>
</div> }, { key: 'quantity', label: l('المطلوب', 'Requested') },...(isReceipt(r)?[{key:'received',label:l('مستلم / متبقي','Received / remaining'),render:(line:Row)=>{const n=s.movements.filter(m=>m.type==='purchase_receipt'&&m.lineId===line.id).reduce((n,m)=>n+m.delta,0);return `${n} / ${Math.round((line.quantity-n)*1000)/1000}`;}},{key:'receive',label:l('الاستلام','Receipt'),render:(line:Row)=>{const n=s.movements.filter(m=>m.type==='purchase_receipt'&&m.lineId===line.id).reduce((n,m)=>n+m.delta,0);return ['awaiting_receipt','partially_received'].includes(r.status)&&workCan('receive_purchase')&&line.quantity>n?<Button size="sm" disabled={busy} onClick={()=>requestForm('receive_purchase',l('تسجيل الاستلام الفعلي','Record actual receipt'),[field('quantity','الكمية المستلمة الآن','Quantity received now','number'),field('recipient','اسم المستلم بالمخزن','Warehouse recipient'),field('documentId','مستند الاستلام المرفوع','Receipt document','select',s.documents.filter(d=>d.requestId===r.id&&d.purpose==='other').map(d=>({value:d.id,label:d.name}))),...(s.products.find(p=>p.id===line.productId)?.tracked?[field('batchId','دفعة المنتج','Product batch','select',s.batches.filter(b=>b.productId===line.productId).map(b=>({value:b.id,label:b.code+' · '+(b.expiryDate||'')})))]:[]),field('reason','ملاحظة الاستلام','Receipt note')],{lineId:line.id,quantity:'',recipient:a?.name,reason:'استلام مشتريات معتمدة'})}>{l('تسجيل استلام','Record receipt')}</Button>:null;}}]:[]),{key:'delete',label:l('الإجراءات','Actions'),render:x=>deleteButton('lines',x.id)}]}/>
        {r.status === 'approved' && workCan('near_expiry') && <Button variant="outline" onClick={() => requestForm('near_expiry', l('اعتماد استثناء صلاحية ≤ 90 يومًا', 'Approve near-expiry exception ≤ 90 days'), [field('lineId', 'البند', 'Line', 'select', s.lines.filter(x => x.requestId === r.id).map(x => ({ value: x.id, label: name('products', x.productId) }))), field('batchId', 'الدفعة', 'Batch', 'select', opts('batches')), field('quantity', 'الكمية المعتمدة', 'Approved quantity', 'number'), field('reason', 'سبب الاستثناء', 'Exception reason')])}>{l('اعتماد استثناء الصلاحية', 'Near-expiry approval')}</Button>}
        {!isReceipt(r)&&<h3>{l('الحجوزات والإسناد', 'Reservations & assignments')}</h3>}<div className="table-shell"><ManagedTable tableId="pilot:3"><table><thead><tr>{[l('الصنف','Product'),l('مخزن المصدر / الدفعة','Source / batch'),l('المندوب','Executor'),l('العهدة الأصلية','Issued quantity'),l('مسلّم','Delivered'),l('مرتجع مستلم','Returned'),l('منتظر رجوع','Pending return'),l('متبقي للتسليم','Remaining delivery'),l('الإجراء','Action')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{s.reservations.filter(x=>x.requestId===r.id).map(res=>{const as=s.assignments.find(x=>x.reservationId===res.id),delivered=s.deliveries.filter(x=>x.reservationId===res.id).reduce((n,x)=>n+x.quantity,0),returned=s.returns.filter(x=>x.reservationId===res.id&&x.source==='custody').reduce((n,x)=>n+x.quantity,0),pending=pendingFor(s,'reservationId',res.id),remaining=Math.round((res.quantity-delivered-returned-pending)*1000)/1000;return <tr key={res.id}><td>{name('products',res.productId)}</td><td>{name('warehouses',res.warehouseId)}<small>{res.batchId?name('batches',res.batchId):l('بدون دفعة','No batch')}</small></td><td>{as?name('resources',as.executorId):l('لم يسند بعد','Unassigned')}{as?.participantId&&<small>{name('resources',as.participantId)}</small>}</td><td>{res.quantity}</td><td>{delivered}</td><td>{returned}</td><td>{pending}</td><td>{remaining}</td><td><div className="inline-actions">{['reserved', 'assigned'].includes(r.status) && workCan('assign') && <Button size="sm" variant="outline" onClick={() => requestForm('assign', l('إسناد التنفيذ', 'Assign fulfillment'), [field('executorId', 'المندوب الرئيسي', 'Lead executor', 'select', opts('resources')), {...field('participantId','مندوب مشارك اختياري','Optional participant','select',[{value:'none',label:l('بدون مشارك','No participant')},...opts('resources')]),required:false}, field('carrierId', 'الناقل', 'Carrier', 'select', opts('carriers'))], { reservationId: res.id, participantId:as?.participantId || 'none', executorId: as?.executorId || '', carrierId: as?.carrierId || '' })}>{l('إسناد', 'Assign')}</Button>}{['reserved', 'assigned'].includes(r.status) && workCan('split_reservation') && <Button variant="ghost" size="sm" onClick={() => requestForm('split_reservation', l('تقسيم الحجز لمندوب آخر', 'Split reservation for another executor'), [field('quantity', 'كمية الجزء الجديد', 'New split quantity', 'number')], { reservationId: res.id })}>{l('تقسيم', 'Split')}</Button>}{res.status==='issued'&&remaining>0&&['arrived', 'delivering'].includes(r.status) && workCan('deliver') && <Button size="sm" onClick={() => requestForm('deliver', l('تسجيل كمية مسلّمة', 'Record delivered quantity'), [...taskField(res.lineId),field('quantity', 'الكمية', 'Quantity', 'number'), field('recipient', 'اسم المستلم', 'Recipient')], { reservationId: res.id,taskId:res.taskId||s.tasks.find(t=>t.autoGenerated&&t.reservationId===res.id)?.id||'', quantity:'' })}>{l('تسجيل تسليم', 'Deliver')}</Button>}{res.status==='issued'&&workCan('plan_return')&&<Button size="sm" variant="outline" onClick={showReturns}>{l('افتح المتبقي والمرتجع','Open returns')}</Button>}</div></td></tr>})}</tbody></table></ManagedTable></div>
        {r.status !== 'closed' && workCan('exception') && <Button variant="ghost" className="exception-button" onClick={() => requestForm('exception', l('تسجيل استثناء أو تعذر تسليم', 'Report exception / failed delivery'), [field('reason', 'وصف المشكلة', 'Issue details'), {...field('taskId','مهمة التسليم / الوجهة — مطلوبة عند تعذر تسليم متعدد المحطات','Delivery task / destination — required for multiple failed stops','select',[{value:'none',label:l('استثناء عام دون مهمة محددة','General exception without a specific task')},...s.tasks.filter(t=>t.requestId===r.id&&t.taskType==='delivery').map(t=>({value:t.id,label:t.code+' · '+t.destination+' · '+name('resources',t.executorId)}))]),required:false,requiredWhen:v=>!!v.failed&&s.stops.filter(st=>st.requestId===r.id).length>1}, field('failed', 'تعذر التسليم', 'Delivery failed', 'checkbox')],{taskId:'none',failed:false})}>
<AlertTriangle size={16}/>{l('تسجيل استثناء', 'Report exception')}</Button>}<p className="subtle">{l('التغييرات تُحفظ لكل أعضاء الفريق بعد نجاح الحفظ الخادمي.', 'Changes are shared with the team after the server confirms the save.')}</p>
</>}</>}
</>}</RequestWorkframe></div></div></div>}</SheetContent>
</Sheet>
    <DeleteDialog target={deleteTarget} close={()=>setDeleteTarget(null)} run={run} ar={ar}/>
{editMember&&<MemberEditor key={editMember.userId} member={editMember} s={s} ar={ar} close={()=>setEditMember(null)} run={run}/>}
    <FormModal key={modal?(modal.draftKey||modal.title):'closed'} modal={modal} close={() => setModal(null)} busy={busy} products={s.products} s={s} canSaveSites={can('save_customer_site')} ar={ar}/>
<AlertDialog open={!!confirm} onOpenChange={o => { if (!o && !busy)
        setConfirm(null); }}>
<AlertDialogContent>
<AlertDialogHeader>
<AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
<AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
</AlertDialogHeader>
<AlertDialogFooter>
<AlertDialogCancel>{l('إلغاء', 'Cancel')}</AlertDialogCancel>
<AlertDialogAction disabled={busy} onClick={async (e) => { e.preventDefault(); try {
        await confirm.action();
        setConfirm(null);
    }
    catch { } }}>{l('تأكيد', 'Confirm')}</AlertDialogAction>
</AlertDialogFooter>
</AlertDialogContent>
</AlertDialog>
</SidebarProvider></DraftScope.Provider></CentralDraftProvider></TableExportContext.Provider></TableScope.Provider>;
}
