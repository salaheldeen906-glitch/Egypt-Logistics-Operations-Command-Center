import { accessEnabled } from '@/lib/access-auth';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ enabled: accessEnabled() }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
