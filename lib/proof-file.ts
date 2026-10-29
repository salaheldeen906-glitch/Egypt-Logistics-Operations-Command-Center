import {demand} from './model';
export function proofMime(bytes:Uint8Array,name:string,declared:string) {
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.length>=4;
 const pdf=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 const mime=png?'image/png':jpg?'image/jpeg':pdf?'application/pdf':'';
 demand(mime,'Only PNG, JPEG or PDF evidence is accepted / الإثبات صورة PNG أو JPEG أو ملف PDF فقط','FILE_TYPE',415);
 const extension=name.split('.').pop()?.toLowerCase();
 demand(mime==='image/png'?extension==='png':mime==='image/jpeg'?['jpg','jpeg'].includes(extension||''):extension==='pdf','File extension does not match its content / امتداد الملف لا يطابق محتواه','FILE_TYPE',415);
 demand(!declared||declared===mime||declared==='application/octet-stream','File content type does not match / نوع الملف لا يطابق محتواه','FILE_TYPE',415);
 return mime;
}
