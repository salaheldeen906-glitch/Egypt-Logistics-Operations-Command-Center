import {type Row,type State,demand} from './model';

/** Any stock or reservation history locks the product policy, including cancelled holds. */
export function productHasInventoryHistory(s:State,productId:string){
 return s.movements.some(m=>m.productId===productId)||s.reservations.some(r=>r.productId===productId);
}

export function productTrackingEdit(s:State,product:Row,data:Record<string,any>){
 const supplied=['tracked','expiry'].filter(key=>Object.prototype.hasOwnProperty.call(data,key));
 if(!supplied.length)return null;
 for(const key of supplied)demand(typeof data[key]==='boolean','إعدادات الباتش والصلاحية تقبل نعم أو لا فقط / Tracking flags must be booleans');
 const previous={tracked:product.tracked===true,expiry:product.expiry===true};
 const next={tracked:data.tracked??previous.tracked,expiry:data.expiry??previous.expiry};
 if(next.expiry)next.tracked=true;
 const changed=next.tracked!==previous.tracked||next.expiry!==previous.expiry;
 demand(!changed||!productHasInventoryHistory(s,product.id),'لا يمكن تغيير تتبع المنتج بعد أول حركة مخزنية أو حجز؛ الإعدادات السابقة محفوظة / Tracking policy is locked after first inventory movement or reservation','STATE',409);
 return {previous,next,changed};
}
