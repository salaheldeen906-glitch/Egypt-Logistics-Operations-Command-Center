import {createRequire} from 'node:module';
import {mkdirSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
const target='.sites-runtime/test-governorate-activity';mkdirSync(target,{recursive:true});
await build({entryPoints:['tests/governorate-activity.tsx'],outfile:target+'/checks.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},tsconfig:'tsconfig.json'});
execFileSync(process.execPath,[target+'/checks.cjs'],{stdio:'inherit'});
