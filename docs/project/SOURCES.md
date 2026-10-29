# Sources / المصادر

Registered 2026-10-13. Current source owner selection: “الموجود هنا في المحادثه”. This chooses the existing **Team Pilot** repository; it does not prove feature parity with the original workers.dev **SHARED_PILOT**. Source bundles/screenshots are design references, not evidence of a complete operational backend.

| ID | Source and authority | Use / limitation |
|---|---|---|
| SRC-001 | Current conversation: owner selects existing project after explicit Team Pilot/GitHub distinction | Approved target; earlier role/partial/return/batch/optional-proof requests remain unless SRC-002 supersedes them |
| SRC-002 | Uploaded `نص Markdown ملصق.md`, 2026-10-13, title “DAF Logistics — تعليمات النسخة التجريبية المشتركة”, v1.0, §§1–14 | Authoritative October operational/UX/import/export/auth/isolation/acceptance requirements. Instructions do not establish implementation or authorize production deployment |
| SRC-003 | Uploaded CSS `index-BtiliD3W(1).css`; compiled frontend `index-C2YloWRF.js(1).download` | Visual/interactivity reference only. Not the original SHARED_PILOT source repository or proof of persisted operations |
| SRC-004 | Uploaded `publish.DaygGu2u.min.js(1).download`, `sdk-seed.js(1).download` | Bundled publishing/SDK artifacts; no execution or provider migration required from their presence |
| SRC-005 | Four October screenshots: `صورة ChatGPT 13 أكتوبر 2026، 02_21_14 م-1.png`, `02_21_15 م-2.png`, `02_21_15 م-3.png`, `02_21_16 م-4.png` | Design references supplied in conversation; not screenshots proving actual DAF operations |
| SRC-006 | Team Pilot git baseline `18fa72ba551f87ccedfef17e65d35c4e874e62de`, published version 10; root `/workspace/sites/daf-logistics-team-pilot`; branch `work/egypt-africa-command-center` | Working operational implementation inventory in COVERAGE.md; baseline rollback point; source changes remain isolated from live publication |
| SRC-007 | `.openai/hosting.json`, `package.json`, `app/chatgpt-auth.ts`, `lib/server.ts`, `lib/access.ts`, `drizzle/0000_smooth_komodo.sql`, `drizzle/0001_marvelous_fixer.sql` | Existing Sites project `appgprj_6ab370ed38388191ac8fc17a93e8e9e4`; Vinext/React/TypeScript, Cloudflare D1 `DB`, R2 `BUCKET`, trusted ChatGPT identity. No new provider assumed |
| SRC-008 | `docs/project/AGENT_RULES.md`, version-10 `CURRENT_TASK.md`/`MASTER_CONTEXT.md`; engine/actual/batch/return implementations | Existing optional proof, actual quantity, return custody, batch and project-scope rules; newer owner October instructions supersede conflicts |
| SRC-009 | Historical CR-010 verification: 195 domain + 9 SSR UI + 84 local Worker/D1/R2 checks; typecheck/build | Historical baseline evidence only. Simulated platform identities, not live ChatGPT login; SSR is not browser/device/screen-reader QA. October results must be recorded separately |
| SRC-010 | Original reference URL `https://daf-logistics-shared-pilot-20260920.daf-logistics-906-20260920.workers.dev/command-center`; historical paths `C:\DAF_Logistics_SHARED_PILOT_20260920_104827` / `C:\DAF_Logistics_ORIGINAL_BACKUP_20260920_104827` | Original full-app source/authenticated content not available in this repository. Separate app; protected path not accessed. No parity or live-data claim |

Uploaded sources were read from the provided scratch attachment copies, under `/workspace/scratch/7ec51da816d9/upload/`. Referenced `design-reference/`, named `01-dashboard.png` through `04-warehouses-proofs.png`, and `DAF_Logistics_Codex_UI_Redesign_Prompt.md` are not present under those names in this repository at intake. The four supplied images are recorded by their actual names. An HTML reference was not among this turn's local uploaded file set; no content inspection is claimed for it.

## Source fingerprints

SHA-256; IDs stay stable even if later sources are added.

| Source/file | SHA-256 |
|---|---|
| SRC-002 Markdown | `c0d9c9bbdd8b09bde8c1d3ea9a4b37490d76798dfef2e823b6b5158ec719afd7` |
| SRC-003 CSS | `4e4a4a6e8c9d080c5826aff06bbb24e05788fc16ea620dd37411400023e786aa` |
| SRC-003 frontend JS | `89080915675771c15543fb711a8c5ca1f8ac7d38a636e0d9dd8eccc04bfe429e` |
| SRC-004 publish JS | `94491a2fd1c6b2627e22988d8ede7a3f1eda7f8f21515c05e0555bee91c443ab` |
| SRC-004 seed JS | `ddc0be2f3c5e8f7617ae0287e735014baa41b4765353343e2ed27840576eaf72` |
| SRC-005 image 1 | `6934be327b514393043e6153f49d5ca864e6dbbbb02a928f2e77a63a5b222dd5` |
| SRC-005 image 2 | `7913f395b8596e31a5582f0e97acfaf3881f6644d3d23c38b6f0aa83e7e9e78a` |
| SRC-005 image 3 | `ad2350e7d6410dde46f01063737ce8529e4c12ea88693aeb314e25b1449222fc` |
| SRC-005 image 4 | `ad51bf18c5bb922e676854435dd794060a7c2813b3d38472720f7609d4720db8` |

## Startup and evidence commands

- `pnpm dev`: local framework development. Production build: `pnpm build`; local built-worker startup: `pnpm start` uses Wrangler `--local` and `.wrangler/state`.
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit`.
- Existing domain/SSR/API evidence runners: `node scripts/test-domain.mjs`, `node scripts/test-role-ui.mjs`, `node scripts/test-api.mjs`; import parser runner `scripts/test-import.mjs`.
- These commands are references, not a claim they were run in the documentation intake. Local resource selection and test gating must be checked before startup; a separate route or git branch alone does not isolate resources.

After intake, the four supplied images were retained under `design-reference/01-dashboard.png` through `04-warehouses-proofs.png`, with an explicit mapping in its README. The October instructions and reference CSS are also retained there. The original named redesign prompt and HTML remain absent. No SDK/publish/frontend bundle was installed or executed.
