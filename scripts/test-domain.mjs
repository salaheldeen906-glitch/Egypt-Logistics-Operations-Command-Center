import {execFileSync} from 'node:child_process';import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.sites-runtime/test-domain',{recursive:true});execFileSync(process.execPath,['node_modules/typescript/bin/tsc','lib/engine.ts','lib/role-work.ts','lib/guided-step.ts','lib/model.ts','lib/insights.ts','lib/search.ts','lib/assistant.ts','lib/site-tools.ts','--outDir','.sites-runtime/test-domain','--module','commonjs','--target','es2022','--skipLibCheck'],{stdio:'inherit'});writeFileSync('.sites-runtime/test-domain/package.json','{"type":"commonjs"}');execFileSync(process.execPath,['tests/domain.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/enhancements.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,['tests/tasks.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,["tests/receipts.cjs"],{stdio:"inherit"});

execFileSync(process.execPath,["tests/operations.cjs"],{stdio:"inherit"});

execFileSync(process.execPath,['tests/trace-returns.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,['tests/actual-quantities.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,['tests/role-returns.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,['tests/guided-flow.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,['tests/batches.cjs'],{stdio:'inherit'});

execFileSync(process.execPath,['tests/loading-confirmation.cjs'],{stdio:'inherit'});
