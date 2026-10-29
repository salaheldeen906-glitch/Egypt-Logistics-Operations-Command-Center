import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.sites-runtime/test-delivery-metadata',{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/engine.ts','lib/customer-report.ts','lib/delivery-metadata.ts','--outDir','.sites-runtime/test-delivery-metadata','--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});
writeFileSync('.sites-runtime/test-delivery-metadata/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['tests/delivery-metadata.cjs'],{stdio:'inherit'});
