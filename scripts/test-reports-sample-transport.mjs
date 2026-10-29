import {createRequire} from 'node:module';
import {mkdirSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');mkdirSync('.sites-runtime/test-reports-sample-transport',{recursive:true});
await build({entryPoints:['tests/reports-sample-transport.ts'],outfile:'.sites-runtime/test-reports-sample-transport/test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:'tsconfig.json'});
execFileSync(process.execPath,['.sites-runtime/test-reports-sample-transport/test.mjs'],{stdio:'inherit'});
