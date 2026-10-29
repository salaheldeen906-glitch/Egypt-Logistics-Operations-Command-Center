import {createRequire} from 'node:module';
import {mkdirSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json')),{build}=require('esbuild');
const target='.sites-runtime/test-external-transport-reports';mkdirSync(target,{recursive:true});
await build({entryPoints:['tests/external-transport-reports.ts'],outfile:`${target}/model.cjs`,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:'tsconfig.json'});
execFileSync(process.execPath,[`${target}/model.cjs`],{stdio:'inherit'});
