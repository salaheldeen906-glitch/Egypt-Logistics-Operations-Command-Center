import {createRequire} from 'node:module';
import {realpathSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
mkdirSync('.sites-runtime/test-stock-availability-ui',{recursive:true});
await build({entryPoints:['tests/stock-availability-ui.tsx'],outfile:'.sites-runtime/test-stock-availability-ui/ui.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',tsconfig:'tsconfig.json'});
execFileSync(process.execPath,['.sites-runtime/test-stock-availability-ui/ui.cjs'],{stdio:'inherit'});
