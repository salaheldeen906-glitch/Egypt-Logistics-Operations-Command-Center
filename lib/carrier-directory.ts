import {demand,text} from './model';

/** Only directory facts belong here. Driver/vehicle/waybill facts belong to a shipment snapshot. */
export function carrierDirectoryMetadata(data:Record<string,any>){
 const out:Record<string,any>={};
 for(const [key,max] of Object.entries({contactName:180,phone:80,email:180,serviceType:180,address:1000,notes:1000})){
  if(data[key]!==undefined)out[key]=data[key]===''?'':text(data[key],max);
 }
 if(out.email)demand(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email),'أدخل بريدًا إلكترونيًا صحيحًا للناقل');
 if(data.relationshipStatus!==undefined){demand(['active','suspended'].includes(data.relationshipStatus),'اختر حالة التعامل مع الناقل');out.relationshipStatus=data.relationshipStatus;}
 return out;
}
