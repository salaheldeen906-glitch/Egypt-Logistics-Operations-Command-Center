import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.sites-runtime/test-product-tracking';
mkdirSync(out,{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/engine.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync(out+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/product-tracking.cjs'],{stdio:'inherit'});
