const assert = require('node:assert/strict');
const {execute,validateImport}=require('../.sites-runtime/test-domain/engine.js');
const {emptyState}=require('../.sites-runtime/test-domain/model.js');
const {findBoxUnit}=require('../.sites-runtime/test-domain/default-unit.js');
const actor={userId:'unit-test-owner',name:'Unit test owner',role:'owner',function:'all',active:1};
const now='2026-10-14T03:00:00.000Z';
const act=(state,command)=>execute(state,actor,command,now).state;
let pass=0;
function test(name,fn){fn();pass++;console.log('PASS',name);}
const initial=act(emptyState(),{type:'master',kind:'projects',data:{code:'P-UNIT',name:'Unit test project'}});
const product={code:'PRODUCT-UNIT',name:'Tracked new product',projectId:initial.projects[0].id,tracked:true,expiry:true};
test('Explicit product save atomically creates Box default and no stock or actual batches',()=>{
 const before=JSON.stringify(initial),next=act(initial,{type:'master',kind:'products',data:product});
 assert.equal(JSON.stringify(initial),before);
 assert.equal(next.units.length,1);assert.equal(next.units[0].code,'BOX');
 assert.equal(next.products[0].unitId,next.units[0].id);assert.equal(next.products[0].expiry,true);
 assert.equal(next.products[0].tracked,true);assert.equal(next.batches.length,0);assert.equal(next.movements.length,0);
});
const first=act(initial,{type:'master',kind:'products',data:product});
test('Second default product reuses the same Box unit',()=>{
 const next=act(first,{type:'master',kind:'products',data:{...product,code:'PRODUCT-UNIT-2'}});
 assert.equal(next.units.length,1);assert.equal(next.products[1].unitId,first.units[0].id);
});
test('Existing Arabic Box unit is reused without relabeling',()=>{
 const s=act(initial,{type:'master',kind:'units',data:{code:'CTN',name:'صندوق'}}),unit=structuredClone(s.units[0]);
 const next=act(s,{type:'master',kind:'products',data:product});
 assert.deepEqual(next.units,[unit]);assert.equal(next.products[0].unitId,unit.id);
 assert.equal(findBoxUnit(next.units).id,unit.id);
});
test('Explicit existing unit remains selected',()=>{
 const s=act(initial,{type:'master',kind:'units',data:{code:'EA',name:'Unit / وحدة'}});
 const next=act(s,{type:'master',kind:'products',data:{...product,unitId:s.units[0].id}});
 assert.deepEqual(next.units,s.units);assert.equal(next.products[0].unitId,s.units[0].id);
});
test('Unknown explicit unit fails atomically instead of becoming Box',()=>{
 const before=JSON.stringify(initial);
 assert.throws(()=>act(initial,{type:'master',kind:'products',data:{...product,unitId:'not-a-unit'}}),/Record not found/);
 assert.equal(JSON.stringify(initial),before);assert.equal(initial.units.length,0);
});
test('Failed product creation does not leave behind a default unit',()=>{
 const before=JSON.stringify(initial);
 assert.throws(()=>act(initial,{type:'master',kind:'products',data:{...product,projectId:'not-a-project'}}),/Record not found/);
 assert.equal(JSON.stringify(initial),before);assert.equal(initial.units.length,0);
});
test('Editing a legacy product retains its original unit and quantities',()=>{
 let s=act(initial,{type:'master',kind:'units',data:{code:'EA',name:'Unit / وحدة'}});
 s=act(s,{type:'master',kind:'products',data:{...product,unitId:s.units[0].id}});
 s.movements.push({id:'historical-move',code:'HISTORICAL',productId:s.products[0].id,delta:0.5});
 const next=act(s,{type:'master',kind:'products',id:s.products[0].id,data:{name:'Updated name'}});
 assert.equal(next.products[0].unitId,s.units[0].id);assert.deepEqual(next.units,s.units);assert.deepEqual(next.movements,s.movements);
});
test('Import does not silently replace an invalid explicit unit reference',()=>{
 const check=validateImport(initial,actor,{kind:'products',rows:[{code:'IMPORT-UNIT',name:'Imported',projectCode:'P-UNIT',unitCode:'INVALID',tracked:false,expiry:false}],name:'test.csv'});
 assert.equal(check.valid,false);assert.equal(initial.units.length,0);assert.equal(initial.products.length,0);
});
console.log(JSON.stringify({suite:'Default Box unit without migration or stock creation',pass,fail:0}));
