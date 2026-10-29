import assert from 'node:assert/strict';
import {commandNav,visibleCommandNav,activeCommandNav,commandDestination,restoreCommandPosition,type CommandPosition} from '../app/command-navigation';
import {filterColumns} from '../lib/report-filters';

let passed=0;
const test=(name:string,fn:()=>void)=>{fn();passed++;console.log('PASS',name);};
const base:CommandPosition={view:0,masterKind:'projects',reportTab:'reports',reportKind:'requests'};
const destination=(id:string)=>commandNav.find(n=>n.id===id)!;
const columns={requests:[{key:'status'}],customer_returns:[{key:'pending'},{key:'executor'},{key:'returnedAt'}]};
test('Owner has thirteen real destinations preserving all original ten destinations',()=>{
 assert.equal(visibleCommandNav(true).length,13);
 assert.equal(new Set(commandNav.map(n=>n.id)).size,13);
 assert.equal(destination('master').ar,'المشاريع');
 for(const id of ['dashboard','tasks','orders','assignment','trips','warehouse','proofs','reports','master','users'])assert(destination(id));
});
test('Products, customers and generic master data do not highlight each other',()=>{
 for(const [id,kind] of [['products','products'],['customers','customers'],['master','projects']]){
  const state=commandDestination(destination(id),base);
  assert.equal(state.view,1);assert.equal(state.masterKind,kind);assert.equal(activeCommandNav(state,true).id,id);
 }
 assert.equal(activeCommandNav({...base,view:1,masterKind:'batches'},true).id,'master');
});
test('Returns opens the actual return table and reports remains independently reachable',()=>{
 const returns=commandDestination(destination('returns'),base);
 assert.equal(returns.view,6);assert.equal(returns.reportTab,'reports');assert.equal(returns.reportKind,'customer_returns');
 assert.equal(activeCommandNav(returns,true).id,'returns');
 const reports=commandDestination(destination('reports'),returns);
 assert.equal(reports.reportKind,'requests');assert.equal(activeCommandNav(reports,true).id,'reports');
 assert.equal(activeCommandNav({...returns,reportTab:'audit'},true).id,'reports');
});
test('Permission management is absent for every nonowner and restored admin state falls back safely',()=>{
 assert(!visibleCommandNav(false).some(n=>n.id==='users'));
 assert.equal(visibleCommandNav(false).length,12);
 assert.equal(restoreCommandPosition({view:6,reportTab:'admin'},false,columns).reportTab,'reports');
 assert.equal(restoreCommandPosition({view:6,reportTab:'admin'},true,columns).reportTab,'admin');
});
test('Return report and combined numeric/name/date filters survive storage and resume exact filtered records',()=>{
 const saved=JSON.parse(JSON.stringify({view:6,masterKind:'products',reportTab:'reports',reportKind:'customer_returns',reportFilters:{pending:{op:'range',min:'1',max:'10'},executor:{op:'equals',value:'Courier A'},returnedAt:{op:'range',min:'2026-10-01',max:'2026-10-14'}}}));
 const restored=restoreCommandPosition(saved,true,columns);
 assert.equal(restored.reportKind,'customer_returns');assert.equal(restored.masterKind,'products');
 assert.equal(activeCommandNav({...base,...restored},true).id,'returns');
 const rows=[{id:'pending-A',pending:3,executor:'Courier A',returnedAt:'2026-10-13T23:00:00Z'},{id:'accepted-A',pending:0,executor:'Courier A',returnedAt:'2026-10-13T23:00:00Z'},{id:'pending-B',pending:3,executor:'Courier B',returnedAt:'2026-10-13T23:00:00Z'},{id:'old-A',pending:3,executor:'Courier A',returnedAt:'2026-09-30T23:00:00Z'}];
 assert.deepEqual(filterColumns(rows,restored.reportFilters,columns.customer_returns.map(c=>c.key)).map(r=>r.id),['pending-A']);
});
test('Corrupt saved state cannot restore unsupported report or restricted filter column',()=>{
 const restored=restoreCommandPosition({view:90,masterKind:'opening',reportKind:'private-table',reportFilters:{pending:{op:'range',min:'1'},status:{op:'invalid'},secret:{op:'contains',value:'x'}}},false,columns);
 assert.equal(restored.view,undefined);assert.equal(restored.masterKind,undefined);assert.equal(restored.reportKind,'requests');assert.deepEqual(restored.reportFilters,{});
 assert.deepEqual(restoreCommandPosition(null,true,columns),{});
});
console.log(`${passed} navigation checks passed`);
