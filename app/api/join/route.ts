import { identity, hash, stmt, db, originCheck, readJson, json, failure, dataset, loadState } from '@/lib/server';
import { demand } from '@/lib/model';
import {invitationPolicy} from '@/lib/invitations';
import {commandCenterConfig} from '@/lib/command-center-isolation';
export async function POST(req: Request) { try {
 originCheck(req);const u=await identity(),{token}=await readJson(req,2000);
 demand(typeof token==='string'&&token.length<=200,'Invalid invitation');
 const h=await hash(token),invite=await stmt('SELECT id,active,expires FROM invitations WHERE hash=?',h).first<{id:string;active:number;expires:string}>();
 demand(invite,'Invitation expired or revoked / رابط الانضمام منتهي أو ملغى','INVITATION',410);
 const d=await dataset(),stored=await stmt('SELECT value FROM settings WHERE key=?','invitation_policy:'+invite.id).first<{value:string}>();
 const policy=stored?invitationPolicy(JSON.parse(stored.value),await loadState(d.id),d.id):null;
 if(commandCenterConfig().enabled){demand(policy,'Use a recipient-bound invitation / استخدم دعوة موجهة لحسابك','INVITATION',410);}
 if(policy){
  demand(JSON.parse(stored!.value).datasetId===d.id,'Invitation belongs to another dataset / الدعوة لبيئة أخرى','INVITATION',410);
  demand(policy.email===u.email.trim().toLowerCase(),'This invitation is addressed to a different account / هذه الدعوة موجهة لحساب آخر','INVITATION_RECIPIENT',403);
 }
 const redeemed=await stmt('SELECT value FROM settings WHERE key=?','invitation_redeemed:'+invite.id).first<{value:string}>();
 if(redeemed?.value===u.userId)return json({joined:true,replayed:true});
 const now=new Date().toISOString(),op=crypto.randomUUID();
 demand(invite.active&&invite.expires>now,'Invitation expired or revoked / رابط الانضمام منتهي أو ملغى','INVITATION',410);
 const member=await stmt('SELECT user_id FROM members WHERE user_id=?',u.userId).first();
 if(policy)demand(!member,'Account is already a member; the owner edits its permissions / الحساب عضو بالفعل؛ المالك يعدّل صلاحياته','MEMBERSHIP_EXISTS',409);
 const statements=[stmt('INSERT INTO transaction_guards(id,ok) VALUES (?,CASE WHEN EXISTS(SELECT 1 FROM invitations WHERE id=? AND active=1 AND expires>?) THEN 1 ELSE 0 END)',op,invite.id,now)];
 if(policy){
  statements.push(stmt('INSERT INTO transaction_guards(id,ok) VALUES (?,CASE WHEN NOT EXISTS(SELECT 1 FROM members WHERE user_id=?) AND EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?) THEN 1 ELSE 0 END)',op+':policy',u.userId,'invitation_policy:'+invite.id,stored!.value));
  if(policy.resourceIds?.length)statements.push(stmt("INSERT INTO transaction_guards(id,ok) VALUES (?,CASE WHEN NOT EXISTS(SELECT 1 FROM settings s,json_each(json_extract(s.value,'$.resourceIds')) r WHERE s.key LIKE 'member_operations:%' AND r.value IN (SELECT value FROM json_each(?))) THEN 1 ELSE 0 END)",op+':resource',JSON.stringify(policy.resourceIds)));
  statements.push(stmt('INSERT INTO members(user_id,name,role,function,active) VALUES (?,?,?,?,1)',u.userId,u.displayName,policy.role,policy.function),stmt('INSERT INTO settings(key,value) VALUES (?,?)','member_scope:'+u.userId,JSON.stringify(policy.projectIds)),stmt('INSERT INTO settings(key,value) VALUES (?,?)','member_operations:'+u.userId,JSON.stringify({warehouseIds:policy.warehouseIds,resourceIds:policy.resourceIds})),stmt('UPDATE invitations SET active=0 WHERE id=?',invite.id),stmt('INSERT INTO settings(key,value) VALUES (?,?)','invitation_redeemed:'+invite.id,u.userId),stmt('DELETE FROM transaction_guards WHERE id=?',op+':policy'));
  if(policy.resourceIds?.length)statements.push(stmt('DELETE FROM transaction_guards WHERE id=?',op+':resource'));
 }else statements.push(stmt("INSERT OR IGNORE INTO members(user_id,name,role,function,active) VALUES (?,?,'contributor','all',1)",u.userId,u.displayName));
 statements.push(stmt("INSERT INTO audit(id,dataset_id,user_id,action,details,at) VALUES (?,?,?,'join',?,?)",op,d.id,u.userId,JSON.stringify({invitationId:invite.id,recipientBound:!!policy}),now),stmt('DELETE FROM transaction_guards WHERE id=?',op));
 await db().batch(statements);return json({joined:true});
}catch(e){return failure(e);} }
