import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.sites-runtime/test-stock-availability',{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/stock-availability.ts','--outDir','.sites-runtime/test-stock-availability','--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync('.sites-runtime/test-stock-availability/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/stock-availability.cjs'],{stdio:'inherit'});
