import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/engine.ts','lib/customer-report.ts','lib/report-filters.ts','lib/tabular-export.ts','--outDir','.sites-runtime/test-domain','--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/egypt.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/workflow-safety.cjs'],{stdio:'inherit'});
