import {createRequire} from 'node:module';
import {realpathSync,mkdirSync} from 'node:fs';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild'),out='.sites-runtime/test-external-transport-access';
mkdirSync(out,{recursive:true});
for(const file of ['model','access','access-policy','journeys','travel-report','customer-report','deletion','actual-quantities'])await build({entryPoints:['lib/'+file+'.ts'],outfile:out+'/'+file+'.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:'tsconfig.json'});
require(process.cwd()+'/tests/external-transport-access.cjs')(Object.fromEntries(['model','access','access-policy','journeys','travel-report','customer-report','deletion','actual-quantities'].map(file=>[file,require(process.cwd()+'/'+out+'/'+file+'.cjs')])));
