import { actor, readSnapshot, json, failure } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() { try {
    return json(await readSnapshot(await actor()));
}
catch (e) {
    return failure(e);
} }
