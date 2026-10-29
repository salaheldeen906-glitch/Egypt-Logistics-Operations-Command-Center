import {type State, code, demand, text} from './model';

/** The source product ID owns identity. SKU is descriptive and may repeat or contain '/'. */
export const dentalCatalogSource = 'daf_products_skus';
export type DentalCatalogIssue = {row:number;code:string;message:string;productId?:string};
export type DentalCatalogOptions = {
  projectId:string;
  unitId:string;
  sourceFileSha256:string;
  sourceFileName:string;
};
export type DentalCatalogPlan = {
  projectId:string;
  rows:Record<string,any>[];
  existing:{sourceRow:number;productId:string;code:string}[];
  errors:DentalCatalogIssue[];
  warnings:DentalCatalogIssue[];
  sourceRowCount:number;
  signature:string;
};

const normalized = (value:unknown) => String(value ?? '').trim();
const nameKey = (value:unknown) => normalized(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ');

/** Optional descriptive fields only. They confer no stock, pricing, scope or approval authority. */
export function productCatalogMetadata(data:Record<string,any>):Record<string,any> {
  const result:Record<string,any>={};
  for(const [key,max] of Object.entries({sourceProductId:50,sku:250,category:180,companyName:180,catalogSource:64,sourceFileName:250})) {
    if(data[key]!==undefined&&data[key]!==null&&data[key]!=='')result[key]=text(data[key],max);
  }
  if(data.sourceSku!==undefined&&data.sourceSku!==null&&data.sourceSku!=='') {
    demand(typeof data.sourceSku==='string'&&data.sourceSku.trim().length>0&&data.sourceSku.length<=250,'Source SKU must be text with at most 250 characters');
    result.sourceSku=data.sourceSku;
  }
  if(data.sourceFileSha256!==undefined&&data.sourceFileSha256!==null&&data.sourceFileSha256!=='') {
    demand(typeof data.sourceFileSha256==='string'&&/^[a-f0-9]{64}$/i.test(data.sourceFileSha256),'Invalid source SHA256');
    result.sourceFileSha256=data.sourceFileSha256.toLowerCase();
  }
  if(data.sourceRow!==undefined&&data.sourceRow!==null&&data.sourceRow!=='') {
    const n=typeof data.sourceRow==='string'&&/^\d+$/.test(data.sourceRow)?Number(data.sourceRow):data.sourceRow;
    demand(typeof n==='number'&&Number.isInteger(n)&&n>=2&&n<=1048576,'Source row must be an Excel data row number');
    result.sourceRow=n;
  }
  return result;
}

/** Pure preparation only: never mutates the state, creates stock, or changes existing records. */
export function prepareDentalCatalog(sourceRows:Record<string,any>[],state:State,options:DentalCatalogOptions):DentalCatalogPlan {
  const project=state.projects.find(p=>p.id===options.projectId);
  const unit=state.units.find(u=>u.id===options.unitId);
  demand(project,'Select an existing permitted Dental project / اختر مشروع الدنتال الموجود');
  demand(unit,'Select an existing box unit / اختر وحدة الصندوق الموجودة');
  demand(/^[a-f0-9]{64}$/i.test(options.sourceFileSha256),'Invalid source SHA256');
  demand(sourceRows.length>0&&sourceRows.length<=2000,'Catalog must contain 1–2000 products');
  const plan:DentalCatalogPlan={projectId:project.id,rows:[],existing:[],errors:[],warnings:[],sourceRowCount:sourceRows.length,signature:`dental-catalog:${project.id}:${options.sourceFileSha256.toLowerCase()}`};
  const ids=new Map<string,number[]>(),skus=new Map<string,number[]>();
  for(const [i,r] of sourceRows.entries()) {
    const sourceRow=Number.isInteger(r.__sourceRow)?r.__sourceRow:i+2;
    const id=normalized(r.productId),sku=normalized(r.SKU);
    if(id)ids.set(id.toLowerCase(),[...(ids.get(id.toLowerCase())||[]),sourceRow]);
    if(sku)skus.set(nameKey(sku),[...(skus.get(nameKey(sku))||[]),sourceRow]);
  }
  for(const [i,r] of sourceRows.entries()) {
    const sourceRow=Number.isInteger(r.__sourceRow)?r.__sourceRow:i+2;
    const sourceProductId=normalized(r.productId);
    const fail=(issueCode:string,message:string)=>plan.errors.push({row:sourceRow,code:issueCode,message,productId:sourceProductId});
    let data:Record<string,any>;
    try {
      demand(sourceProductId.length>0&&sourceProductId.length<=43&&/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(sourceProductId),'Source productId must be a valid nonempty identifier');
      if((ids.get(sourceProductId.toLowerCase())||[]).length!==1) {fail('DUPLICATE_SOURCE_ID','Source productId is repeated; no duplicate rows are imported');continue;}
      const sku=text(r.SKU,250),name=text(r.productName),category=text(r.Category);
      const companyName=text(r['Company Name ']??r['Company Name']??r.companyName);
      data={code:code(`DENTAL-${sourceProductId}`),name,projectId:project.id,projectCode:project.code,unitId:unit.id,unitCode:unit.code,
        sourceProductId,sku,sourceSku:String(r.SKU),category,companyName,catalogSource:dentalCatalogSource,
        sourceFileSha256:options.sourceFileSha256.toLowerCase(),sourceFileName:text(options.sourceFileName,250),sourceRow,__sourceRow:sourceRow};
    } catch(e) {fail('INVALID_SOURCE',e instanceof Error?e.message:String(e));continue;}
    if((skus.get(nameKey(data.sku))||[]).length>1)plan.warnings.push({row:sourceRow,code:'REPEATED_SKU',message:'SKU repeats across distinct source products; retained as supplied, not used as identity',productId:sourceProductId});
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,49}$/.test(data.sku))plan.warnings.push({row:sourceRow,code:'NON_CODE_SKU',message:'SKU is not a valid app code; retained without splitting or alteration',productId:sourceProductId});
    const identityMatches=state.products.filter(p=>p.projectId===project.id&&p.catalogSource===dentalCatalogSource&&String(p.sourceProductId)===sourceProductId);
    const codeMatches=state.products.filter(p=>String(p.code).toLowerCase()===data.code.toLowerCase());
    const found=[...new Map([...identityMatches,...codeMatches].map(p=>[p.id,p])).values()];
    if(found.length) {
      const prior=found[0];
      if(found.length===1&&prior.projectId===project.id&&prior.catalogSource===dentalCatalogSource&&String(prior.sourceProductId)===sourceProductId&&['name','sku','category','companyName'].every(k=>normalized(prior[k])===normalized(data[k]))&&prior.unitId===unit.id) {
        plan.existing.push({sourceRow,productId:prior.id,code:prior.code});
      } else fail('EXISTING_ID_CONFLICT','An existing product shares this source ID or internal code; keep it unchanged and review the conflict');
      continue;
    }
    if(state.products.some(p=>p.projectId===project.id&&nameKey(p.name)===nameKey(data.name))) {
      fail('EXISTING_NAME_CONFLICT','An existing product has the same name without confirmed source identity; review before adding a duplicate');
      continue;
    }
    plan.rows.push(data);
  }
  plan.warnings.push({row:0,code:'TRACKING_UNSPECIFIED',message:'Source contains no batch/expiry policy, quantities or prices. It defines products only; no inventory or batch is inferred.'});
  return plan;
}

export function dentalCatalogImportCommand(plan:DentalCatalogPlan,name:string) {
  demand(plan.errors.length===0,'Resolve catalog conflicts before importing / راجع تعارضات المنتجات قبل الاستيراد');
  demand(plan.rows.length>0,'All source products already exist; no new rows to import');
  return {type:'import',kind:'products',mode:'add',name:text(name),signature:plan.signature,rows:plan.rows};
}
