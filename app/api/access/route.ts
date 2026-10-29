import { actor, originCheck, readJson, json, failure } from '@/lib/server';
import { accessSnapshot, accessAction, recordAccessFailure } from '@/lib/access-store';
import type { Actor } from '@/lib/model';
export const dynamic='force-dynamic';
export async function GET(){let a:Actor|null=null;try{a=await actor();return json(await accessSnapshot(a));}catch(e){try{await recordAccessFailure(a);}catch{}return failure(e);}}
export async function POST(req:Request){let a:Actor|null=null;try{originCheck(req);a=await actor();return json(await accessAction(a,await readJson(req,200000)));}catch(e){try{await recordAccessFailure(a);}catch{}return failure(e);}}
