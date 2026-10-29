import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.sites-runtime/test-domain',{recursive:true});
writeFileSync('.sites-runtime/test-domain/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/customer-report.ts','lib/report-filters.ts','lib/tabular-export.ts','--outDir','.sites-runtime/test-domain','--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/report-behavior.cjs'],{stdio:'inherit'});
