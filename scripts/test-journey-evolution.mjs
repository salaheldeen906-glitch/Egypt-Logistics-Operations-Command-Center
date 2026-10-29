import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='.sites-runtime/test-journey-evolution';
mkdirSync(output,{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/journeys.ts','lib/travel-report.ts','lib/customer-report.ts','--outDir',output,'--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync(output+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/journey-evolution.cjs'],{stdio:'inherit'});
