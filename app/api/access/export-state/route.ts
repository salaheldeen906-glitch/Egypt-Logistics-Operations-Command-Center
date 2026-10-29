import {actor,dataset,loadState,json,failure} from '@/lib/server';
import {publicAccessActor} from '@/lib/access-store';
import {assertReadPermission,permissionDecision} from '@/lib/access-policy';
import {scopedState} from '@/lib/access';
import {demand,kinds} from '@/lib/model';
export const dynamic='force-dynamic';
/** Revalidate existing browser-generated overview/JSON exports on the server. */
export async function GET(req:Request){try{
 const a=await actor(),kind=new URL(req.url).searchParams.get('kind')||'';
 demand([...kinds,'journeys','visits','customer_deliveries','customer_returns','courier_summary','journey_details','visit_details','travel_events','geo_values','customer_activity','external_shipments','external_custody','external_carrier_performance','external_invoice_coverage','external_followup'].includes(kind as any),'Unknown export source');
 if(a.access?.enabled)demand(permissionDecision(a,'reports.export').allowed,'Export permission required / صلاحية التصدير مطلوبة','FORBIDDEN',403);
 const collection=kind==='journeys'?'journey_runs':kind==='visits'?'visit_events':kind;
 const sources=kind==='geo_values'?['customer_deliveries','customer_returns']:kind==='customer_activity'?['customers','customer_deliveries','customer_returns']:[collection];
 for(const source of sources)assertReadPermission(a,source,'export');
 const d=await dataset();
 return json({dataset:d,actor:publicAccessActor(a),state:scopedState(await loadState(d.id),a)});
}catch(e){return failure(e);}}
