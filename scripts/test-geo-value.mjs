import {createRequire} from 'node:module';
import {mkdirSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
const target='.sites-runtime/test-geo-value';mkdirSync(target,{recursive:true});
for(const [name,entry] of [['model','tests/geo-value-report.ts'],['ui','tests/geo-value-ui.tsx']]){
 await build({entryPoints:[entry],outfile:`${target}/${name}.cjs`,bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},tsconfig:'tsconfig.json'});
 execFileSync(process.execPath,[`${target}/${name}.cjs`],{stdio:'inherit'});
}
