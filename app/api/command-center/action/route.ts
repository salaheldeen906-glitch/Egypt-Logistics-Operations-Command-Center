import {actor,act,json,failure,dataset,originCheck,readJson} from '@/lib/server';
import {requireCommandCenter} from '@/lib/command-center-isolation';
export async function POST(req:Request){try{
 requireCommandCenter();originCheck(req);const a=await actor();await dataset();const body=await readJson(req);
 if(body.command?.type==='create_request'&&(!body.command.requestType||body.command.requestType==='delivery'))body.command.loadingProtocol='dual';
 return json(await act(a,body));
 }catch(e){return failure(e);}}
