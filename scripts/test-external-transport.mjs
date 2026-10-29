import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.sites-runtime/test-external-transport';
mkdirSync(out,{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/external-transport.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync(out+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/external-transport.cjs'],{stdio:'inherit'});
