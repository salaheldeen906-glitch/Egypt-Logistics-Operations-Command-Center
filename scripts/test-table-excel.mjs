import {createRequire} from 'node:module';
import {mkdirSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
mkdirSync('.sites-runtime/test-table-excel',{recursive:true});
await build({entryPoints:['tests/table-excel.tsx'],outfile:'.sites-runtime/test-table-excel/test.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',tsconfig:'tsconfig.json'});
execFileSync(process.execPath,['.sites-runtime/test-table-excel/test.cjs'],{stdio:'inherit'});
