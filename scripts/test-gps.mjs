import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('.sites-runtime/test-gps', { recursive: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'lib/gps.ts', 'lib/access.ts', '--outDir', '.sites-runtime/test-gps', '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck'], { stdio: 'inherit' });
writeFileSync('.sites-runtime/test-gps/package.json', '{"type":"commonjs"}');
execFileSync(process.execPath, ['tests/gps.cjs'], { stdio: 'inherit' });
