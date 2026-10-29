import {demand,type Row,type State} from './model';

/** Explicit administrative region only; never infer a governorate from free text. */
export const EGYPT_GOVERNORATES=[
 ['cairo','القاهرة'],['giza','الجيزة'],['alexandria','الإسكندرية'],['qalyubia','القليوبية'],['sharqia','الشرقية'],['daqahlia','الدقهلية'],['gharbia','الغربية'],['monufia','المنوفية'],['beheira','البحيرة'],['kafr-elsheikh','كفر الشيخ'],['damietta','دمياط'],['port-said','بورسعيد'],['ismailia','الإسماعيلية'],['suez','السويس'],['fayoum','الفيوم'],['beni-suef','بني سويف'],['minya','المنيا'],['assiut','أسيوط'],['sohag','سوهاج'],['qena','قنا'],['luxor','الأقصر'],['aswan','أسوان'],['red-sea','البحر الأحمر'],['new-valley','الوادي الجديد'],['matrouh','مطروح'],['north-sinai','شمال سيناء'],['south-sinai','جنوب سيناء']
] as const;
const governorates=new Set<string>(EGYPT_GOVERNORATES.map(v=>v[0]));
const owns=(v:any,key:string)=>!!v&&Object.prototype.hasOwnProperty.call(v,key);
export function normalizeGovernorate(value:unknown):string|null {
 if(value===undefined||value===null||value===''||value==='unknown')return null;
 demand(typeof value==='string'&&governorates.has(value),'اختر محافظة صحيحة / Invalid governorate');return value as string;
}
export function recordedGovernorate(value:unknown):string|null{return typeof value==='string'&&governorates.has(value)?value:null;}
export type PriceMetadata={unitPrice:string|null;priceMinor:number|null;currency:'EGP'|null;free:boolean};
const unknownPrice=():PriceMetadata=>({unitPrice:null,priceMinor:null,currency:null,free:false});
export function hasPriceMetadata(v:any){return owns(v,'unitPrice')||owns(v,'priceMinor')||owns(v,'free');}

/** Canonical decimal price, never a product-master price or inventory valuation. */
export function normalizePriceMetadata(v:any):PriceMetadata {
 const free=v?.free===true||v?.free==='true';
 demand(v?.currency===undefined||v.currency===null||v.currency===''||v.currency==='EGP','العملة المدعومة لهذا السعر هي EGP / Unsupported price currency');
 let raw=v?.unitPrice;
 if((raw===undefined||raw===null||raw==='')&&v?.priceMinor!==undefined&&v.priceMinor!==null){demand(Number.isSafeInteger(v.priceMinor)&&v.priceMinor>=0&&v.priceMinor<=99999999999,'سعر غير صحيح / Invalid minor price');raw=(v.priceMinor/100).toFixed(2);}
 if(raw===undefined||raw===null||raw===''){demand(!free,'حدد سعر صفر للبضاعة المجانية / Set an explicit zero price for free goods');return unknownPrice();}
 demand(typeof raw==='string'||typeof raw==='number','سعر غير صحيح / Invalid unit price');
 const value=String(raw).trim();demand(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value),'السعر رقم موجب أو صفر بخانتين عشريتين كحد أقصى / Invalid unit price');
 const [whole,fraction='']=value.split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 demand(Number.isSafeInteger(minor)&&minor<=99999999999,'السعر أكبر من الحد المدعوم / Unit price too large');
 demand(minor!==0||free,'أكد أن سعر الصفر بضاعة مجانية / Confirm zero-priced goods are free');
 demand(!free||minor===0,'البضاعة المجانية يجب أن يكون سعرها صفرًا / Free goods must have a zero price');
 if(v?.priceMinor!==undefined&&v.priceMinor!==null)demand(v.priceMinor===minor,'السعر لا يطابق قيمته النقدية / Inconsistent price');
 return {unitPrice:(minor/100).toFixed(2),priceMinor:minor,currency:'EGP',free};
}
export function recordedPrice(v:any):PriceMetadata {try{return normalizePriceMetadata(v);}catch{return unknownPrice();}}
export function equalPrice(a:any,b:any){const x=recordedPrice(a),y=recordedPrice(b);return x.priceMinor===y.priceMinor&&x.free===y.free&&x.currency===y.currency;}

/** Follow immutable event/need/task/line lineage. Never consult today's address book or product price. */
export function deliveryMetadata(s:State,event:Record<string,any>){
 const reservation=s.reservations.find(r=>r.id===event.reservationId),task=s.tasks.find(t=>t.id===event.taskId)||s.tasks.find(t=>t.id===reservation?.taskId);
 const need=s.delivery_needs.find(n=>n.id===(event.needId||task?.needId));
 const line=s.lines.find(l=>l.id===(event.lineId||task?.lineId||reservation?.lineId));
 const request=s.requests.find(r=>r.id===(event.requestId||task?.requestId||line?.requestId));
 // A merged product line cannot price an unidentified destination when its need prices differ.
 const linkedNeeds=s.delivery_needs.filter(n=>n.requestId===request?.id&&n.productId===(event.productId||line?.productId));
 const lineAmbiguous=linkedNeeds.length>0&&linkedNeeds.some(n=>!equalPrice(n,line));
 const sources=[event,task,need,...(!lineAmbiguous?[line]:[])].filter(Boolean),priceSource=sources.find(hasPriceMetadata);
 const regionSource=[event,task,need,request].find(v=>v&&owns(v,'governorate'));
 return {...recordedPrice(priceSource),governorate:recordedGovernorate(regionSource?.governorate)};
}
