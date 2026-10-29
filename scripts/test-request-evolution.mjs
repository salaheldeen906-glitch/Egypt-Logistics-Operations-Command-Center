import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.sites-runtime/test-evolution',{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/engine.ts','lib/request-evolution.ts','--outDir','.sites-runtime/test-evolution','--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync('.sites-runtime/test-evolution/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/request-evolution.cjs'],{stdio:'inherit'});
