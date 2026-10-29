import {demand} from './model';
export type ColumnFilter={op:'contains'|'equals'|'range'|'empty';value?:string;min?:string;max?:string};
export type ColumnType='text'|'number'|'date'|'choice';
const datePattern=/^\d{4}-\d{2}-\d{2}(?:$|T)/;
export function inferColumnType(values:unknown[]):ColumnType {
 const populated=values.filter(v=>v!==null&&v!==undefined&&v!=='');
 if(populated.length&&populated.every(v=>typeof v==='number'))return 'number';
 if(populated.length&&populated.every(v=>typeof v==='string'&&datePattern.test(v)&&Number.isFinite(Date.parse(v))))return 'date';
 return 'text';
}
export function activeColumnFilters(filters:Record<string,ColumnFilter>):Record<string,ColumnFilter>{
 return Object.fromEntries(Object.entries(filters).filter(([,f])=>f.op==='empty'||(f.op==='range'?!!(f.min||f.max):!!f.value)));
}
function rangeValue(v:unknown):number {
 if(typeof v==='number')return v;
 const value=String(v??'');
 if(datePattern.test(value)){
  // Date.parse rolls invalid calendar dates into a later month; reject those.
  const parsed=Date.parse(value),day=value.slice(0,10);
  if(!Number.isFinite(parsed)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)return NaN;
  return parsed;
 }
 // Native report cells can format numeric measures with thousands separators.
 const numeric=value.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[٬,]/g,'').replace(/٫/g,'.');
 return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(numeric)?Number(numeric):NaN;
}
export function filterColumns<T extends Record<string,any>>(rows:T[],filters:Record<string,ColumnFilter>={},allowed?:string[]):T[]{
 demand(filters&&typeof filters==='object'&&!Array.isArray(filters)&&Object.keys(filters).length<=80,'Invalid column filters');
 for(const [key,f] of Object.entries(filters)){demand(!allowed||allowed.includes(key),'Restricted filter column','FORBIDDEN',403);demand(f&&['contains','equals','range','empty'].includes(f.op)&&[f.value,f.min,f.max].every(v=>v===undefined||typeof v==='string'&&v.length<=180),'Invalid filter');}
 const active=activeColumnFilters(filters);
 for(const f of Object.values(active))if(f.op==='range'){
  const min=f.min?rangeValue(f.min):undefined,max=f.max?rangeValue(f.max):undefined;
  demand((min===undefined||Number.isFinite(min))&&(max===undefined||Number.isFinite(max)),'اكتب حدًا رقميًا أو تاريخًا صحيحًا / Invalid range bound');
  demand(min===undefined||max===undefined||min<=max,'بداية النطاق يجب ألا تتجاوز نهايته / Range start must not exceed its end');
 }
 return rows.filter(r=>Object.entries(active).every(([k,f])=>{const v=r[k],str=String(v??'').toLocaleLowerCase();if(f.op==='empty')return v==null||v==='';if(f.op==='contains')return str.includes((f.value||'').toLocaleLowerCase());if(f.op==='equals')return str===(f.value||'').toLocaleLowerCase();const value=rangeValue(v);if(v==null||v===''||!Number.isFinite(value))return false;return (!f.min||value>=rangeValue(f.min))&&(!f.max||value<=rangeValue(f.max)+(/^\d{4}-\d{2}-\d{2}$/.test(f.max)?86400000-1:0));}));
}
