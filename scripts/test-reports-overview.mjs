import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';

const target = '.sites-runtime/test-reports-overview';
mkdirSync(target, {recursive: true});
writeFileSync(`${target}/package.json`, '{"type":"commonjs"}');
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'lib/reports-overview.ts', 'lib/access.ts', '--outDir', target, '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck', '--strict'], {stdio: 'inherit'});
execFileSync(process.execPath, ['tests/reports-overview.cjs'], {stdio: 'inherit'});
