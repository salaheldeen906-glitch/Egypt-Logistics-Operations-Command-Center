# CR-011 acceptance evidence / أدلة نقطة المراجعة

2026-10-13. Tests ran only against disposable local fixtures. A `pass` here describes the listed scenario and method, not complete operational/design acceptance. Trusted identity headers are simulated locally; they cannot prove live login. Two local requests/sessions are not two real devices.

| Scenario / requirement | Role / input | Expected | Actual / evidence |
|---|---|---|---|
| Baseline functions retained DAF-005 | Historical delivery/receipt/transfer/distribution/documents/actual return/batch suites | Existing rules continue; no unintended stock effects | pass: 195 historical domain checks, 9 SSR checks, 84 local API checks; retained runners and evidence/*.log |
| Two-source loading DAF-019,021,023,027 | Mapped keeper A, keeper B and separate assigned courier; requested100, planned60/40, actual50/40; two batch expiries2028/2029 | First signatures no issue; each matched pair posts once, custody90, held10 | pass: loading-confirmation.cjs and test-command-center-api.mjs; stored distinct `cc-keeper` / `cc-courier` identities |
| Loading discrepancy DAF-022 | Keeper55, courier50, reason | Difference5 visible, no issue or fabricated custody; depart blocked | pass for hold: domain/SSR; final resolution policy remains unknown DEC-001 |
| Every original batch group DAF-021,027 | Two reservation/batch groups at same source; only first confirmed | No departure until second group receives its own agreed confirmation | pass: domain loading suite35 checks |
| Shortcut/replay DAF-034 | Dual request legacy load/pickup/op_issue; repeated operationId; same confirmation twice | Public shortcuts denied; API replay returns prior result; exactly one issue | pass: domain35 and new local API28 |
| Return continuation DAF-020,025 | Courier delivered45 of collected50, presents5 to A; keeper accepts3 | A stock+3, remaining2 stays unaccepted custody; request remains open with held10 and other custody | pass: new local API; domain/SSR ensure pending return is guide priority |
| Source/destination roles DAF-006,008,009 | Wrong keeper warehouse, unrelated courier/task/loadingId/stop/proof | Direct API/state/file references rejected or excluded; disabled account loses access | pass for covered mapped-member cases: domain and local API. All application-wide authorization acceptance still partial |
| Personal draft DAF-014 | Courier savesquantity0.5; separate local request with same account; same key from keeper | Same-account load returns0.5; different account gets own empty draft; no stock/version effect | pass: new local API; hook browser interaction remains not tested |
| Draft conflict DAF-014,034 | Two saves with revision0; first succeeds | Second409; prior value preserved | pass: new local API CAS. Client retry/back/pagehide behavior code-reviewed, not browser-tested |
| UI role form DAF-012,013,021 | SSR keeper/courier/owner; pending/mismatch; two batches | Correct actual/wait form; no prefilled independent quantity; source/expiry shown; owner-all cannot sign courier | pass: new12 SSR + existing9. SSR does not demonstrate hydration, clicks, visual density or keyboard use |
| Isolation guard DAF-001,002,035 | No flag, wrong active dataset, separate `cc-local-fixture` | Inactive explanation/503 until designated dataset; no writes to old local dataset | pass: local API. Hosted physical DB/files/accounts/environment isolation has not been provisioned or verified |
| Engineering | Current source | Typecheck/build/diff whitespace clean | pass: TypeScript, production build, git diff --check |

Totals: **230 domain + 21 SSR + 112 local Worker/D1/R2 = 363 passing checks**, zero failing checks in these final runs. The build adds the new route and three CC APIs. No production deployment.

Not tested / blocked: browser interaction/hydration, actual touch/camera, 320/390px and 200/400% visual zoom, real keyboard journey and screen reader, hosted real-account multi-device sessions and file sharing. Managed Sites control-browser is not available; do not improvise browser QA or call SSR a screenshot. No actual before/after screenshots produced.

Acceptance pending: owner review of the first journey and design; DEC-001 discrepancy resolver/correction; DEC-002 independent approved hosted target. Remaining requirements are in REQUIREMENTS/COVERAGE; no full-system or original SHARED_PILOT parity claim.

Reproduce with existing dependencies: `node node_modules/typescript/bin/tsc --noEmit`; `node scripts/test-domain.mjs`; `node scripts/test-role-ui.mjs`; `node scripts/test-command-center-ui.mjs`; production build via existing Sites helper; then `node scripts/test-api.mjs` and `node scripts/test-command-center-api.mjs`. These API runners construct local Miniflare DB/R2 stores and have no production migration/seed path.

## CR-012 final evidence (2026-10-13)
All tests use disposable local datasets or source/SSR/parser checks. No real platform login or browser-click result is claimed.

| Scenario / requirements | Input / expected | Actual and evidence |
|---|---|---|
| Named invite DAF-007 | Wrong recipient denied; intended viewer has selected project; once-only/replay/expiry/revoke; no promotion or duplicate resource binding | pass — `cr012-files-api.log`; trusted identities simulated |
| Import DAF-028–030 | 1,105 Arabic rows; no preview writes; repeated confirmation does not duplicate; invalid second row rejects entire batch | pass — `cr012-files-api.log`; invalid boolean includes row7/column |
| Master-name update | Explicit mode by code; same ID/code/project/unit/movements; old/new-name audit | pass — `cr012-files-api.log`; stock/request/batch updates excluded |
| XLSX sheet/date/formula parsing DAF-028–029 | Choose second worksheet, retain 1,105 rows/leading zeros, Excel serial date conversion, reject formulas | pass — `cr012-workbook.log`; Node parser test with Python XML adapter, not browser file-picker/drop behavior |
| Export DAF-032 | All 1,105 imported rows across pages; exact chosen columns; project/ID/restricted-column denial; version/count review | pass — `cr012-files-api.log`; XLSX inline text + text format, numeric/date styles; CSV protects formula-like text |
| Independent XLSX file inspection | Import the generated XLSX in another spreadsheet engine; compare first code000000, last001104, Arabic row | pass — read-only artifact-tool import. Native Microsoft Excel is unavailable. The renderer displays numeric-looking strings without zero padding despite exact imported values; actual XML/string typing is verified, native Excel display acceptance remains pending |
| Columns DAF-031 | Unknown preferences rejected, mandatory columns cannot be hidden, keyboard order/reset and native row inputs preserved | pass — `cr012-files-ui.log`; SSR/pure helpers. Browser persistence/reorder click and mobile/keyboard journey not tested |
| Proof DAF-033 | Reject text/renamed file before posting; permitted second identity reads inline/download; permission revocation denies next request | pass — `cr012-files-api.log`; 5MB content-signature/extension/MIME checks. No antivirus/full-semantic validation |
| First journey / DAF-035 | Use actual component/domain code for review without external sign-in | standalone HTML build passed, 0 external src/import references; browser interaction/visual acceptance not tested |
| Preserved operational regression | Domain/role/CC/local API, including loading differences, distinct signatures, held/issued quantities and returns | pass — retained and newly rerun suites |

Final automated counts: **230 domain + 31 component SSR/helper + 146 local Worker/D1/R2 + 7 CSV/XLSX parser = 414 passing checks, zero failing checks**. TypeScript, production build and `git diff --check` pass separately. The independent spreadsheet import inspection is additional evidence and is not counted in 414.

Reproduce after dependency installation:
```text
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-domain.mjs
node scripts/test-role-ui.mjs
node scripts/test-command-center-ui.mjs
node scripts/test-file-workspace-ui.mjs
node scripts/test-import.mjs
node scripts/test-import-workbook.mjs
npm run build
node scripts/test-api.mjs
node scripts/test-command-center-api.mjs
node scripts/test-file-workspace-api.mjs
node scripts/build-first-journey-review.mjs
```
The local API scripts create in-memory Miniflare DB/R2 and simulated platform identities; they never execute hosted migration/seed/reset. Root/CC source checks do not prove real shared authentication, actual devices, screen reader, camera, zoom or PDF preview appearance. Operational/design acceptance, DEC-001 and DEC-002 remain open.

## CR-014 — Egypt release checks
2026-10-14. **445 passing checks**: 230 retained domain + 21 new allocation/transfer/receipt/report domain + 37 component SSR/helper + 157 local Worker/D1/R2. TypeScript and production build pass separately. Evidence: evidence/cr014. All API identities are simulated trusted headers in disposable local resources; these are not real ChatGPT login or mobile/browser acceptance results.

New acceptance scenarios: one request 1000+200 units, two sources/sites/couriers, same product and site split, forged source/executor rejected, exact task reservations, independent loading signatures through real route commands, no departure before all required confirmations, recipient/time/event sequence, exact-delivery return limit, 5 presented/3 accepted/2 pending, partial two-account custody handover mismatch/retry/cancellation, no second issue, product definition creates no batch/stock, actual partial receipt atomically creates a batch, invalid expiry rollback, source courier never supplier, server-filtered export with denied hidden columns, multi-source distribution and approved alternate destination retaining source task/batch trace.

Visual evidence is source and SSR only. No browser control skill is available in this managed environment: hydration/clicks/pixel geometry/phone/camera/zoom/screen reader remain unverified. Maps are marked schematics; no GPS/vehicle telemetry or fabricated revenue/ETA. Empty records show empty states. Client/net reports label ambiguous historical event linkage rather than invent it.

Reproduce new scope: `node scripts/test-egypt.mjs`, `node scripts/test-egypt-ui.mjs`, after build `node scripts/test-egypt-api.mjs`; retain existing domain/role/CC/file/API suites. The current source commit follows independent Site v1; old Sites/data/access stay separate.

## Selected Egypt Site implementation release — 2026-10-14
Target: `appgprj_6ace37bed1fc8191af88d9705def4ba7`. Final checks: legacy domain230; Egypt domain21; new preloading/source/event safeguards7; navigation6; reportbehavior9; roleSSR9; EgyptSSR8; filetoolsSSR12; localAPI84+29+35+9. Total459 checks, allpassing. TypeScript and production build pass independently. Range/export field precision, Cairo month boundary and missing dates are included. No browser/device/realaccounttest claim. Publication status belongs in CURRENT_TASK.md after native Sites result.
