import { unzipSync, strFromU8 } from 'fflate';
import { type State, isQuantity, quantityRequirement } from './model';
export const fieldsForImport = (kind: string) => kind === 'products' ? ['code', 'name', 'projectCode', 'unitCode', 'tracked', 'expiry', 'sourceProductId', 'sku', 'category', 'companyName', 'sourceSku', 'catalogSource', 'sourceFileSha256', 'sourceFileName', 'sourceRow'] : kind === 'opening' ? ['productCode', 'warehouseCode', 'quantity', 'batchCode', 'reason'] : kind === 'requests' ? ['code', 'projectCode', 'customerCode', 'destination', 'dueDate', 'productCode', 'quantity'] : kind === 'batches' ? ['code', 'name', 'productCode', 'expiryDate'] : kind === 'locations' ? ['code', 'name', 'warehouseCode'] : kind === 'carriers' ? ['code', 'name', 'custodyLocationCode'] : ['code', 'name'];
function csv(text: string) { const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false; for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
        if (quoted && text[i + 1] === '"') {
            cell += '"';
            i++;
        }
        else
            quoted = !quoted;
    }
    else if (c === ',' && !quoted) {
        row.push(cell);
        cell = '';
    }
    else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n')
            i++;
        row.push(cell);
        if (row.some(x => x.trim()))
            rows.push(row);
        row = [];
        cell = '';
    }
    else
        cell += c;
} if (quoted)
    throw new Error('Unclosed CSV quote / علامة اقتباس غير مغلقة'); row.push(cell); if (row.some(x => x.trim()))
    rows.push(row); return rows; }
function xlsx(buffer: ArrayBuffer, sheetName?: string) { let total = 0; const files = unzipSync(new Uint8Array(buffer), { filter: file => { total += file.originalSize; if (total > 25 * 1024 * 1024)
        throw new Error('Workbook expands beyond 25 MB'); return file.name.endsWith('.xml') || file.name.endsWith('.rels'); } }); const xml = (name: string) => { if (!files[name])
    return null; const value = strFromU8(files[name]); if (/<!DOCTYPE|<!ENTITY/i.test(value))
    throw new Error('Unsupported XML declarations'); const doc = new DOMParser().parseFromString(value, 'application/xml'); if (doc.querySelector('parsererror'))
    throw new Error('Invalid workbook XML'); return doc; }; const shared = Array.from(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') || []).map(el => Array.from(el.getElementsByTagName('t')).map(t => t.textContent || '').join('')); const workbook = xml('xl/workbook.xml'); const available = Array.from(workbook?.getElementsByTagName('sheet') || []); const first = sheetName ? available.find(el=>el.getAttribute('name')===sheetName) : available[0]; if(!first) throw new Error('Worksheet not found / الورقة غير موجودة'); const relId = first.getAttribute('r:id'); const rel = Array.from(xml('xl/_rels/workbook.xml.rels')?.getElementsByTagName('Relationship') || []).find(e => e.getAttribute('Id') === relId); const target = rel?.getAttribute('Target'); const path = target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target) : 'xl/worksheets/sheet1.xml'; const sheet = xml(path); if (!sheet)
    throw new Error('No readable first sheet / تعذر قراءة الورقة الأولى'); if (sheet.getElementsByTagName('f').length)
    throw new Error('Import values only: replace formulas with values / حوّل المعادلات إلى قيم قبل الاستيراد'); return Array.from(sheet.getElementsByTagName('row')).map(row => { const values: string[] = []; for (const c of Array.from(row.getElementsByTagName('c'))) {
    const letters = (c.getAttribute('r') || 'A1').replace(/\d/g, '');
    const n = Array.from(letters).reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0) - 1;
    const type = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent || '';
    values[n] = type === 's' ? shared[Number(v)] || '' : type === 'inlineStr' ? Array.from(c.getElementsByTagName('t')).map(t => t.textContent).join('') : v;
} return values.map(x => x || ''); }).filter(r => r.some(x => x.trim())); }
export async function workbookSheets(file: File): Promise<string[]> {
    if(file.size>5*1024*1024) throw new Error('Maximum file size 5 MB');
    if(!file.name.toLowerCase().endsWith('.xlsx'))return [];
    let total=0; const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>{total+=f.originalSize;if(total>25*1024*1024)throw new Error('Workbook expands beyond 25 MB');return f.name==='xl/workbook.xml';}});
    if(!files['xl/workbook.xml'])throw new Error('Invalid workbook');
    const raw=strFromU8(files['xl/workbook.xml']);if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw new Error('Unsupported XML declarations');
    const doc=new DOMParser().parseFromString(raw,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Invalid workbook XML');
    return Array.from(doc.getElementsByTagName('sheet')).map(s=>s.getAttribute('name')||'').filter(Boolean);
}
export async function parseFile(file: File, sheetName?: string) { if (file.size > 5 * 1024 * 1024)
    throw new Error('Maximum file size 5 MB'); let rows: string[][]; if (file.name.toLowerCase().endsWith('.csv'))
    rows = csv((await file.text()).replace(/^\uFEFF/, ''));
else if (file.name.toLowerCase().endsWith('.xlsx'))
    rows = xlsx(await file.arrayBuffer(), sheetName);
else
    throw new Error('Choose CSV or XLSX'); if (rows.length < 2)
    throw new Error('File has no data rows'); if (rows.length > 2001)
    throw new Error('Maximum 2,000 data rows'); const headers = rows[0].map(h => h.trim()); if (new Set(headers).size !== headers.length || headers.some(h => !h))
    throw new Error('Headers must be nonempty and unique'); return { headers, rows: rows.slice(1).map((r, i) => ({ ...Object.fromEntries(headers.map((h, j) => [h, h==='sourceSku'?(r[j]||''):(r[j]?.trim() || '')])), __sourceRow: i + 2 })) }; }
export function prepareImport(kind: string, rows: any[], mapping: Record<string, string>, s: State) { return rows.map(source => { const data: any = { __sourceRow: source.__sourceRow }; for (const key of fieldsForImport(kind)) {
    data[key] = source[mapping[key]] || '';
    if (['expiryDate', 'dueDate'].includes(key) && /^\d+(\.\d+)?$/.test(data[key]))
        data[key] = new Date(Date.UTC(1899, 11, 30) + Number(data[key]) * 86400000).toISOString().slice(0, 10);
} for (const [key, table] of Object.entries({ projectCode: 'projects', unitCode: 'units', customerCode: 'customers', productCode: 'products', warehouseCode: 'warehouses', batchCode: 'batches', custodyLocationCode: 'locations' })) {
    if (data[key])
        data[key.replace('Code', 'Id')] = (s as any)[table].find((x: any) => x.code === data[key])?.id || 'UNKNOWN:' + data[key];
} if (kind === 'products') {
    if(!data.tracked||['true','false','1','0','yes','no','نعم','لا'].includes(data.tracked.toLowerCase())) data.tracked = ['true', '1', 'yes', 'نعم'].includes(data.tracked.toLowerCase());
    if(!data.expiry||['true','false','1','0','yes','no','نعم','لا'].includes(data.expiry.toLowerCase())) data.expiry = ['true', '1', 'yes', 'نعم'].includes(data.expiry.toLowerCase());
} return data; }); }

export type ImportField={key:string;ar:string;required:boolean;expected:string};
export function importSchema(kind:string):ImportField[]{
 const labels:Record<string,[string,string]>={code:['الكود','English letters / digits / . _ -; store codes as text'],name:['الاسم','Nonempty text, up to 180 characters'],projectCode:['كود المشروع','Existing project code'],unitCode:['كود الوحدة','Existing unit code'],productCode:['كود الصنف','Existing product code'],warehouseCode:['كود المخزن','Existing warehouse code'],batchCode:['كود الدفعة','Existing matching batch code'],customerCode:['كود العميل','Existing customer code'],custodyLocationCode:['موقع عهدة الناقل','Existing location code'],quantity:['الكمية',quantityRequirement],reason:['السبب','Nonempty text'],tracked:['تتبع الدفعة','true / false / yes / no / 1 / 0 / نعم / لا'],expiry:['تتبع الصلاحية','true / false / yes / no / 1 / 0 / نعم / لا'],expiryDate:['تاريخ الصلاحية','YYYY-MM-DD or Excel date serial'],dueDate:['الاستحقاق','YYYY-MM-DD or Excel date serial'],destination:['الوجهة','Nonempty destination text']};
 const catalog:Record<string,[string,string]>={sourceProductId:['رقم المنتج في المصدر','Original product identifier; text'],sku:['SKU الأصلي','Original SKU; duplicates are allowed'],category:['الفئة','Original product category'],companyName:['الشركة','Original company name'],sourceSku:['SKU بالنص الأصلي','Exact source SKU including surrounding spaces'],catalogSource:['مصدر الكتالوج','Catalog source identifier'],sourceFileSha256:['بصمة الملف','SHA256; 64 hexadecimal characters'],sourceFileName:['اسم ملف المصدر','Original filename'],sourceRow:['صف المصدر','Original Excel row; integer from 2 to 1048576']};
 Object.assign(labels,catalog);
 return fieldsForImport(kind).map(key=>({key,ar:labels[key]?.[0]||key,expected:labels[key]?.[1]||'Text',required:!['tracked','expiry','expiryDate','dueDate','batchCode','custodyLocationCode',...Object.keys(catalog)].includes(key)}));
}
export function importRowErrors(kind:string,data:any,s:State,rowNumber:number,mode='add'){
 const errors:any[]=[],push=(column:string,expected:string)=>errors.push({row:data.__sourceRow||rowNumber,column,value:String(data[column]??''),expected,message:expected});
 for(const f of importSchema(kind).filter(f=>mode!=='update'||['code','name'].includes(f.key))){
  if(f.key.endsWith('Code')&&!data[f.key]&&data[f.key.replace('Code','Id')])continue;
  if(kind==='requests'&&['productCode','quantity'].includes(f.key)&&data.lines?.length)continue;
  const value=data[f.key],raw=typeof value==='boolean'?String(value):String(value??'');
  if(f.required&&!raw.trim())push(f.key,'Required value / قيمة مطلوبة');
  if(['code','productCode','projectCode','warehouseCode','unitCode','customerCode','batchCode','custodyLocationCode'].includes(f.key)&&raw&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,49}$/.test(raw))push(f.key,'Valid code: letters, digits, . _ - / كود صحيح');
  if(f.key==='quantity'&&!isQuantity(raw))push(f.key,quantityRequirement);
  if(['dueDate','expiryDate'].includes(f.key)&&raw&&(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString().slice(0,10)!==raw))push(f.key,'Valid date YYYY-MM-DD / تاريخ صحيح');
  if(['tracked','expiry'].includes(f.key)&&raw&&!['true','false','yes','no','1','0','نعم','لا'].includes(raw.toLowerCase()))push(f.key,'Use true/false, yes/no, 1/0 or نعم/لا');
 }
 for(const [key,table] of Object.entries({projectCode:'projects',unitCode:'units',customerCode:'customers',productCode:'products',warehouseCode:'warehouses',batchCode:'batches',custodyLocationCode:'locations'}))if(data[key]&&!s[table as keyof State].some(r=>r.code===data[key]))push(key,'Code must exist in permitted data / الكود موجود في البيانات المسموحة');
 return errors;
}
export function suggestMapping(kind:string,headers:string[]){
 const normalized=(v:string)=>v.toLowerCase().replace(/[\s_\-]/g,'');
 return Object.fromEntries(importSchema(kind).map(f=>[f.key,headers.find(h=>[f.key,f.ar].some(v=>normalized(h)===normalized(v)))||'']));
}
