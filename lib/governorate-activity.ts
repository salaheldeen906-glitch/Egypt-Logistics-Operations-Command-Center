import {type GeoFact,governorateLabel} from './geo-value-report';
import {type Row} from './model';

export type GovernorateActivity=Row&{
 governorate:string;governorateName:string;unitId:string;unit:string;
 delivered:number;accepted:number;net:number;requests:number;customers:number;products:number;
};
const rounded=(value:number)=>Math.round(value*1000)/1000;

/** Physical demand/activity only: each row is one governorate × UOM, independent of pricing. */
export function governorateActivity(facts:GeoFact[],ar=true):GovernorateActivity[]{
 const groups=new Map<string,GeoFact[]>();
 for(const fact of new Map(facts.map(f=>[f.id,f])).values()){
  const key=JSON.stringify([fact.governorate,fact.unitId]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key)!.push(fact);
 }
 return [...groups.entries()].map(([id,rows])=>{
  const first=rows[0],delivered=rounded(rows.filter(f=>f.eventType==='delivery').reduce((sum,f)=>sum+f.quantity,0)),accepted=rounded(rows.filter(f=>f.eventType!=='delivery').reduce((sum,f)=>sum+f.quantity,0));
  return {id,code:id,governorate:first.governorate,governorateName:governorateLabel(first.governorate,ar),unitId:first.unitId,unit:first.unit||(ar?'وحدة غير مسجلة':'Unrecorded unit'),delivered,accepted,net:rounded(delivered-accepted),requests:new Set(rows.map(f=>f.requestId).filter(Boolean)).size,customers:new Set(rows.map(f=>f.customerId).filter(Boolean)).size,products:new Set(rows.map(f=>f.productId).filter(Boolean)).size};
 }).sort((a,b)=>a.unitId.localeCompare(b.unitId)||b.net-a.net||a.governorateName.localeCompare(b.governorateName,ar?'ar':'en'));
}
