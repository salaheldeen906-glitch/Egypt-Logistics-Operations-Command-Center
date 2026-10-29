import {createRequire} from 'node:module';
import {realpathSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync('node_modules/vite/package.json'));
const {build}=require('esbuild');
mkdirSync('.sites-runtime/test-command-navigation',{recursive:true});
await build({entryPoints:['tests/command-navigation.ts'],outfile:'.sites-runtime/test-command-navigation/navigation.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:'tsconfig.json'});
execFileSync(process.execPath,['.sites-runtime/test-command-navigation/navigation.cjs'],{stdio:'inherit'});
