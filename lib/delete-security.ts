// Server only: the secret contains a salted PBKDF2 hash, never the password.
import { demand } from './model';
export async function verifyDeletePassword(password: unknown, encoded: string | undefined) {
    demand(encoded, 'Deletion is disabled until the server secret is configured / المسح معطل حتى إعداد سر الخادم', 'UNAVAILABLE',503);
    demand(typeof password === 'string' && password.length > 0 && password.length <= 128, 'Enter the deletion password / أدخل كلمة مرور المسح','DELETE_PASSWORD',403);
    const [algorithm, rounds, saltHex, expectedHex] = encoded.split(':');
    demand(algorithm==='pbkdf2' && Number(rounds)>=100000 && Number(rounds)<=1000000 && /^[a-f0-9]{32}$/.test(saltHex||'') && /^[a-f0-9]{64}$/.test(expectedHex||''), 'Deletion secret configuration invalid / إعداد حماية المسح غير صالح','UNAVAILABLE',503);
    const salt=Uint8Array.from(saltHex.match(/../g)!.map(x=>parseInt(x,16)));
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const result=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:Number(rounds)},key,256));
    const expected=Uint8Array.from(expectedHex.match(/../g)!.map(x=>parseInt(x,16)));
    let difference=0; for(let i=0;i<result.length;i++) difference|=result[i]^expected[i];
    demand(difference===0,'Incorrect deletion password / كلمة مرور المسح غير صحيحة','DELETE_PASSWORD',403);
}
