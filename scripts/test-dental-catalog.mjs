import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const out='.sites-runtime/test-dental-catalog';
mkdirSync(out,{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/dental-catalog.ts','lib/engine.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync(out+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/dental-catalog.cjs'],{stdio:'inherit'});
const require=createRequire(import.meta.url);
const {parseFile,prepareImport,suggestMapping}=require('../'+out+'/import.js');
const {prepareDentalCatalog,dentalCatalogImportCommand}=require('../'+out+'/dental-catalog.js');
const {execute}=require('../'+out+'/engine.js');
const {emptyState}=require('../'+out+'/model.js');
{
  const csvState=emptyState();csvState.projects.push({id:'csv-dental',code:'DENTAL',name:'Synthetic CSV import test'});csvState.units.push({id:'csv-box',code:'BOX',name:'صندوق'});
  const original=[{productId:'9',productName:'Quoted "product", variant',Category:'Dental Materials','Company Name ':'DAF',SKU:'\u00a0bo-001 ',__sourceRow:10}];
  const plan=prepareDentalCatalog(original,csvState,{projectId:'csv-dental',unitId:'csv-box',sourceFileSha256:'a'.repeat(64),sourceFileName:'private.xlsx'});
  const headers=Object.keys(plan.rows[0]).filter(k=>!['projectId','unitId','__sourceRow'].includes(k));
  const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const csv='\uFEFF'+[headers,...plan.rows.map(r=>headers.map(h=>r[h]))].map(r=>r.map(quote).join(',')).join('\r\n');
  const parsed=await parseFile(new File([csv],'catalog-import.csv'));
  assert.equal(parsed.rows[0].sourceSku,'\u00a0bo-001 ');
  const rows=prepareImport('products',parsed.rows,suggestMapping('products',parsed.headers),csvState);
  const saved=execute(csvState,{userId:'csv-owner',name:'Isolated CSV importer',role:'owner',function:'all',active:1},{type:'import',kind:'products',mode:'add',name:'CSV catalog test',signature:'csv-private-test',rows}).state;
  assert.equal(saved.products[0].sourceSku,original[0].SKU);assert.equal(saved.products[0].sku,'bo-001');assert.equal(saved.products[0].sourceProductId,'9');assert.equal(saved.products[0].sourceRow,10);assert.equal(saved.products[0].name,original[0].productName);assert.equal(saved.movements.length,0);
  console.log('PASS prepared CSV roundtrip preserves exact raw SKU, source identity and original row through real parser/mapping/import engine');
}
// Optional private input acceptance. No source catalog is embedded in tracked test fixtures.
const sourcePath=process.argv[2];
if(sourcePath) {
  class XmlNode {
    constructor(raw){this.raw=raw;}
    get textContent(){return this.raw.text;}
    getAttribute(key){return this.raw.attributes[key]??null;}
    getElementsByTagName(tag){return (this.raw.children||[]).flatMap(c=>[...(c.tag===tag?[new XmlNode(c)]:[]),...new XmlNode(c).getElementsByTagName(tag)]);}
    querySelector(tag){return this.raw.tag===tag?this:this.getElementsByTagName(tag)[0]||null;}
  }
  const xmlPython="import xml.etree.ElementTree as E,json,sys\ndef convert(e):\n return {'tag':e.tag.split('}')[-1],'attributes':{('r:'+k.split('}')[-1] if k.startswith('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}') else k):v for k,v in e.attrib.items()},'text':(''.join(e.itertext()) if e.tag.split('}')[-1] in ['t','v'] else ''),'children':[convert(c) for c in e]}\ntry: print(json.dumps(convert(E.fromstring(sys.stdin.read())),ensure_ascii=False))\nexcept Exception: print(json.dumps({'tag':'parsererror','attributes':{},'children':[],'text':'Invalid XML'}))";
  globalThis.DOMParser=class {parseFromString(xml){return new XmlNode(JSON.parse(execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['-c',xmlPython],{input:xml,encoding:'utf8',maxBuffer:8*1024*1024})));}};
  const bytes=readFileSync(sourcePath),sha=createHash('sha256').update(bytes).digest('hex');
  const parsed=await parseFile(new File([bytes],'private-catalog.xlsx'));
  assert.equal(parsed.rows.length,254);
  const s=emptyState();s.projects.push({id:'test-dental',code:'DENTAL',name:'Synthetic Dental import test'});s.units.push({id:'test-box',code:'BOX',name:'صندوق'});
  const options={projectId:'test-dental',unitId:'test-box',sourceFileSha256:sha,sourceFileName:'All Product & SKUS Data.xlsx'};
  const plan=prepareDentalCatalog(parsed.rows,s,options);
  assert.equal(plan.errors.length,0);assert.equal(plan.rows.length,254);assert.equal(new Set(plan.rows.map(r=>r.sourceProductId)).size,254);
  assert.equal(plan.warnings.filter(w=>w.code==='REPEATED_SKU').length,15);assert.equal(plan.warnings.filter(w=>w.code==='NON_CODE_SKU').length,1);
  const importedState=execute(s,{userId:'test-owner',name:'Isolated import test',role:'owner',function:'all',active:1},dentalCatalogImportCommand(plan,'Private catalog acceptance')).state;
  assert.equal(importedState.products.length,254);assert.equal(importedState.movements.length,0);assert.equal(importedState.batches.length,0);assert.equal(importedState.reservations.length,0);
  assert.equal(importedState.products.filter(p=>p.category==='Dental Materials').length,245);assert.equal(importedState.products.filter(p=>p.category==='Dental Anesthesia').length,9);assert.equal(new Set(importedState.products.map(p=>p.companyName)).size,11);
  assert.equal(prepareDentalCatalog(parsed.rows,importedState,options).existing.length,254);
  console.log(JSON.stringify({suite:'private XLSX through real parser/planner/import engine; isolated only',sourceSha256:sha,products:254,uniqueSourceIds:254,categoryMaterials:245,categoryAnesthesia:9,companies:11,duplicateSkuRows:15,compoundSkuRows:1,inventoryMovements:0,idempotentSkips:254}));
}
