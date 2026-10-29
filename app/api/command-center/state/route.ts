import {actor,readSnapshot,json,failure} from '@/lib/server';
import {requireCommandCenter} from '@/lib/command-center-isolation';
export async function GET(){try{requireCommandCenter();const a=await actor();return json(await readSnapshot(a));}catch(e){return failure(e);}}
