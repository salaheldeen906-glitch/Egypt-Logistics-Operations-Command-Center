import type {Kind} from '../lib/model';
import type {ColumnFilter} from '../lib/report-filters';

export type CommandDestination={
 id:string;view:number;ar:string;en:string;icon:'dashboard'|'tasks'|'orders'|'assignment'|'trips'|'warehouse'|'proofs'|'reports'|'products'|'customers'|'returns'|'master'|'users';
 group:'work'|'settings';tab?:'reports'|'admin';masterKind?:Kind;reportKind?:string;ownerOnly?:boolean;
};
export const commandNav:CommandDestination[]=[
 {id:'dashboard',view:0,ar:'لوحة المتابعة',en:'Dashboard',icon:'dashboard',group:'work'},
 {id:'tasks',view:7,ar:'مهامي الآن',en:'My tasks',icon:'tasks',group:'work'},
 {id:'orders',view:2,ar:'الطلبات والمراجعة',en:'Orders & review',icon:'orders',group:'work'},
 {id:'assignment',view:8,ar:'التوزيع والحجز',en:'Assignment & reservation',icon:'assignment',group:'work'},
 {id:'trips',view:4,ar:'الرحلات والتنفيذ',en:'Trips & execution',icon:'trips',group:'work'},
 {id:'warehouse',view:3,ar:'المخازن والمخزون',en:'Warehouse & inventory',icon:'warehouse',group:'work'},
 {id:'proofs',view:5,ar:'الإثباتات والمستندات',en:'Proofs & documents',icon:'proofs',group:'work'},
 {id:'returns',view:6,ar:'المرتجعات',en:'Returns',icon:'returns',group:'work',tab:'reports',reportKind:'customer_returns'},
 {id:'reports',view:6,ar:'التقارير والتنبيهات',en:'Reports & alerts',icon:'reports',group:'work',tab:'reports'},
 {id:'products',view:1,ar:'المنتجات',en:'Products',icon:'products',group:'settings',masterKind:'products'},
 {id:'customers',view:1,ar:'العملاء',en:'Customers',icon:'customers',group:'settings',masterKind:'customers'},
 {id:'master',view:1,ar:'المشاريع',en:'Projects',icon:'master',group:'settings'},
 {id:'users',view:6,ar:'المستخدمون والصلاحيات',en:'Users & permissions',icon:'users',group:'settings',tab:'admin',ownerOnly:true},
];
export type CommandPosition={view:number;masterKind:Kind;reportTab:string;reportKind:string};
export function visibleCommandNav(owner:boolean){return commandNav.filter(n=>!n.ownerOnly||owner);}
export function activeCommandNav(position:CommandPosition,owner:boolean){
 return visibleCommandNav(owner).find(n=>{
  if(n.view!==position.view)return false;
  if(n.view===1)return n.masterKind?position.masterKind===n.masterKind:!['products','customers'].includes(position.masterKind);
  if(n.view===6){
   if(n.tab==='admin')return position.reportTab==='admin';
   if(position.reportTab==='admin')return false;
   if(n.reportKind)return position.reportTab==='reports'&&position.reportKind===n.reportKind;
   return position.reportTab!=='reports'||position.reportKind!=='customer_returns';
  }
  return true;
 })||commandNav[0];
}
export function commandDestination(n:CommandDestination,current:CommandPosition):CommandPosition{
 return {...current,view:n.view,...(n.tab?{reportTab:n.tab}:{}),...(n.masterKind?{masterKind:n.masterKind}:n.view===1?{masterKind:'projects' as Kind}:{}),...(n.reportKind?{reportKind:n.reportKind}:n.id==='reports'&&current.reportKind==='customer_returns'?{reportKind:'requests'}:{})};
}

// Only restore supported display state. Saved navigation never grants a role
// or changes stock, quantities, membership, or confirmed operations.
export function restoreCommandPosition(saved:any,owner:boolean,columns:Record<string,{key:string}[]>) {
 const result:Partial<CommandPosition>&{reportFilters?:Record<string,ColumnFilter>}={};
 if(!saved||typeof saved!=='object'||Array.isArray(saved))return result;
 if(Number.isInteger(saved.view)&&saved.view>=0&&saved.view<=8)result.view=saved.view;
 if(['projects','products','units','customers','warehouses','locations','batches','resources','carriers'].includes(saved.masterKind))result.masterKind=saved.masterKind;
 if(['reports','analysis','import','audit','admin'].includes(saved.reportTab))result.reportTab=saved.reportTab==='admin'&&!owner?'reports':saved.reportTab;
 const kind=typeof saved.reportKind==='string'&&Object.hasOwn(columns,saved.reportKind)?saved.reportKind:'requests';
 result.reportKind=kind;
 const allowed=new Set((columns[kind]||[]).map(c=>c.key));
 if(saved.reportFilters&&typeof saved.reportFilters==='object'&&!Array.isArray(saved.reportFilters)){
  result.reportFilters=Object.fromEntries(Object.entries(saved.reportFilters).slice(0,80).filter(([key,value])=>{
   const f=value as ColumnFilter;
   return allowed.has(key)&&f&&['contains','equals','range','empty'].includes(f.op)&&[f.value,f.min,f.max].every(v=>v===undefined||typeof v==='string'&&v.length<=180);
  }).map(([key,value])=>{const f=value as ColumnFilter;return [key,{op:f.op,...(f.value!==undefined?{value:f.value}:{}),...(f.min!==undefined?{min:f.min}:{}),...(f.max!==undefined?{max:f.max}:{})}];}));
 }
 return result;
}
