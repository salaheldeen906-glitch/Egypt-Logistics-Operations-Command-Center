import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.sites-runtime/test-quantity-access';
mkdirSync(out,{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/access.ts','lib/access-policy.ts','lib/model.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync(out+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/quantity-access.cjs'],{stdio:'inherit'});
