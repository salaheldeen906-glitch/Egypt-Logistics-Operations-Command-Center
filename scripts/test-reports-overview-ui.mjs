import {createRequire} from 'node:module';
import {mkdirSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
mkdirSync('.sites-runtime/test-reports-overview-ui',{recursive:true});
await build({entryPoints:['tests/reports-overview-ui.tsx'],outfile:'.sites-runtime/test-reports-overview-ui/overview.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',tsconfig:'tsconfig.json'});
execFileSync(process.execPath,['.sites-runtime/test-reports-overview-ui/overview.cjs'],{stdio:'inherit'});
