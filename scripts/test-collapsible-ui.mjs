import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
const ts=createRequire(import.meta.url)('typescript');
const source=readFileSync('app/pilot.tsx','utf8');
const parsed=ts.createSourceFile('app/pilot.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const wanted=new Set(['dashboard-requests','inventory-balances','inventory-movements']);
const panels=new Map();
function walk(node){
 if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(parsed)==='CollapsiblePanel'){
  const attr=node.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(parsed)==='sectionId');
  const id=attr?.initializer&&ts.isStringLiteral(attr.initializer)?attr.initializer.text:'';
  if(wanted.has(id)){if(panels.has(id))throw new Error('Duplicate pilot section: '+id);panels.set(id,node.getText(parsed));}
 }
 ts.forEachChild(node,walk);
}
walk(parsed);
for(const id of wanted)if(!panels.has(id))throw new Error('Missing required pilot section: '+id);

// Render the actual JSX of the three panels that are otherwise behind Pilot's
// authenticated client load. This does not mock or bypass any hosted identity.
const pilotFixture=`
import {CollapsiblePanel} from '@/app/collapsible-panel';
import GridTable from '@/app/grid-table';
import {Button} from '@/components/ui/button';
import {Plus} from 'lucide-react';
import {balance} from '@/lib/model';
import {cairoDay} from '@/lib/insights';
export function PilotPanels({s,ar,project='all',warehouse='all',from='',to=''}){
 const l=(a,b)=>ar?a:b,products=s.products.filter(p=>project==='all'||p.projectId===project),requestRows=s.requests;
 const name=(kind,id)=>s[kind].find(x=>x.id===id)?.name||s[kind].find(x=>x.id===id)?.code||'—';
 const can=()=>false,requestColumns=[{key:'code',label:l('الطلب','Request')},{key:'destination',label:l('الوجهة','Destination')}];
 return <>${[...wanted].map(id=>panels.get(id)).join('\n')}</>;
}`;

mkdirSync('.sites-runtime/test-collapsible-ui',{recursive:true});
await build({
 entryPoints:['tests/collapsible-ui.tsx'],outfile:'.sites-runtime/test-collapsible-ui/collapsible.cjs',
 bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',tsconfig:'tsconfig.json',
 plugins:[{name:'actual-pilot-panels',setup(plugin){
  plugin.onResolve({filter:/^virtual:pilot-collapsible-panels$/},()=>({path:'pilot-panels',namespace:'pilot-fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'pilot-fixture'},()=>({contents:pilotFixture,loader:'tsx',resolveDir:process.cwd()}));
 }}],
});
execFileSync(process.execPath,['.sites-runtime/test-collapsible-ui/collapsible.cjs'],{stdio:'inherit'});
