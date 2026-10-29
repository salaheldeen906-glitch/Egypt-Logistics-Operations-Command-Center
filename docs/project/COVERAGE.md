# Coverage / التغطية

Intake inventory, 2026-10-13; baseline version 10 / `18fa72ba551f87ccedfef17e65d35c4e874e62de`. Stable requirements are in `REQUIREMENTS.md`; source authority is in `SOURCES.md`. Coverage labels: **pass** = cited check evidenced, **partial** = existing subset, **not tested** = no acceptance result. Preserve every baseline surface while adding the new path; visibility may be reorganized without removing an authorized action. No source audit equals acceptance testing.

## Route inventory

| ID | Current route | Scope / source | Coverage |
|---|---|---|---|
| ROUTE-001 | `/` | Existing shared Team Pilot; `app/page.tsx` → `app/pilot.tsx` | pass — source inventory; October live interaction not tested |
| ROUTE-002 | `/walkthrough` | Existing browser-local training fixture; `app/walkthrough/page.tsx` | pass — source inventory; not evidence of shared persistence |
| ROUTE-003 | `/egypt-africa-command-center/` | New locally gated isolated preview, under first-stage work; not published | not tested — pending acceptance |
| API-001 | `/api/state` GET | Authorized snapshot, member/project scope, sync/server time; `app/api/state/route.ts` / `lib/server.ts` | partial — baseline local tests; October account/warehouse scope pending |
| API-002 | `/api/action` POST | Command roles/scope/revision/idempotency/atomic D1/audit; `app/api/action/route.ts` | partial — baseline local tests; new dual loading pending |
| API-003 | `/api/join` POST | Trusted identity + global expiring invite redemption | partial — recipient-bound/least-privilege invite gap |
| API-004 | `/api/upload` POST | Authenticated scoped upload, max 5 MB, R2 object + document action | partial — optional proof saved; narrow signature restriction/preview gap |
| API-005 | `/api/file` GET | Authorized scoped document lookup, private no-store download | partial — baseline local API evidence; real second-account file test pending |
| API-006 | `/api/backup` GET/POST | Owner backup/download/restore/new-empty dataset with prior recovery copy | partial — existing protected capability; no resets authorized during this work |
| API-007 | `/api/search` GET | Server scoped typed search with pages | partial — baseline API evidence; new ownership scope pending |
| API-008 | `/api/assistant` GET/POST | Actor-bound assistant integration/access/command flow | partial — preserve existing capability, no live integration acceptance claim |

Trusted platform sign-in link `/signin-with-chatgpt` is platform infrastructure, not an app-owned route. Existing runtime's `dataset()` selects the globally active dataset; ROUTE-003 alone must never be presented as shared-data isolation.

## Existing section/table inventory

| ID | Section/tabs and tables | Actions/linked surfaces preserved | Source | Related requirements |
|---|---|---|---|---|
| UI-001 | Shell, vertical seven-group menu, global project/warehouse/date/work-queue/search filters, sync banner/footer | Language, refresh, new request, training link, server search, sign-in/out/access message | `app/pilot.tsx` | 001,003,012–018 |
| UI-002 | Command center: queue metrics, attention rows, project workload, current requests, recent events | Drill-down queue/project/request; assistant integration | `CommandCenter` in `app/enhancements.tsx`; `app/workspace-tools.tsx` | 013,016,017 |
| UI-003 | Master-data selector/table: projects/products/units/customers/warehouses/locations/batches/resources/carriers | Create/edit (batch create only), protected delete, code/name search | `pilot.tsx` `kindNames`/`masterForm` | 005,018,026,027 |
| UI-004 | Projects & operational requests table | Create seven request types; open current step; edit draft, submit/review/approve, close under guards | `pilot.tsx`; `lib/operation-types.ts` | 013,019,020,026 |
| UI-005 | Inventory summary by unit; product/warehouse/batch/expiry stock table; posted movements | Opening balance, complete missing opening batch trace, protected opening reversal | `pilot.tsx`; `InventorySummary` | 016–018,026,027 |
| UI-006 | Dispatch workload; requests awaiting assignment; route/stop rows; all numbered tasks; assignments/custody | Request/task route plan, ordered stops, depart, arrive, task-result link, custody handover | `pilot.tsx`; `DispatchBoard` | 019–024 |
| UI-007 | Evidence table; exceptions/returns table | Authenticated download, linked request, resolve exception | `pilot.tsx`; `app/evidence-table.tsx` | 025,033 |
| UI-008 | Reports tab: filtered request table | Fixed JSON request/line export across matching pages | `pilot.tsx` `exportRows` | 017,032 — CSV/XLSX/configurable export gap |
| UI-009 | Analysis tab: file/sheet/group/measure, top 12 bars, first 10 rows | Read CSV/XLSX locally; numeric-invalid exclusion, row count or selected measure | `FileAnalysis` in `enhancements.tsx` | 018; separate from operational import |
| UI-010 | Import tab: data kind/upload/column mapping, errors, import-batch history | Server preview/validation, all-or-nothing confirm, protected batch delete | `pilot.tsx`; `lib/import.ts` | 028–030 |
| UI-011 | Audit tab (latest 200 actions), audit source/channel | Read actor/time/action/record/reason; full history via owner backup | `pilot.tsx`; `lib/server.ts` | 009,034 |
| UI-012 | Admin tab: members, role/function/projects/active; invitation; backups | Owner edit/disable membership, global rotate/revoke/copy invite, backup/download/restore/reset | `pilot.tsx`; `MemberEditor` | 006,007,010,034 |
| UI-013 | Request sheet: status/project/due/progress/current step and detail toggle | Back retains position; guided save advances; role-aware waiting; original details reachable | `app/request-workframe.tsx`; `app/guided-action.tsx` | 013,014,020 |
| UI-014 | Request execution details: lines, supplier/purchase context, reservations/assignments, tasks, route timeline | Near-expiry approve; assignment/participant/carrier; split reservation; partial receipt/delivery; POD; close; exception; protected delete | `pilot.tsx`; `OperationDetails`; `app/tasks.tsx` | 019,020,024,026,027,033 |
| UI-015 | Quantities: held pickup rows and batch custody ledger | Actual partial pickup by batch; requested/issued/delivered/returned/pending/remaining visible | `app/actual-workspace.tsx`; `app/batch-ledger.tsx` | 020,021,027 |
| UI-016 | Extended-operation line allocations, courier collection, task/destination rows, documents/history | Plan/assign/authorize/reserve/issue/collect/sequence/arrive/present/accept/refuse/deliver/document/redirect/close | `app/operation-workspace.tsx`; `lib/operations.ts` | 019,020,023–027 |
| UI-017 | Return eligibility/original delivery, four-step return progression, active return rows | Plan remaining/customer return, choose destination, courier present, keeper accept/refuse; source batch retained | `app/return-workspace.tsx`; `lib/task-trace.ts` | 013,020,025,027 |
| UI-018 | Request documents/POD list and common attachment control | Optional file/photo/camera, upload + explicit recorded event using same document ID | `app/attachment-input.tsx`; `app/evidence-table.tsx` | 033 |
| UI-019 | Training walkthrough, saved local fixtures, request examples/current steps/details | Local role simulation, receipt/delivery/transfer/distribution/collection/return/documents examples, local reset | `app/walkthrough/page.tsx`; `lib/training-examples.ts` | 015,035 — not shared-account proof |
| UI-020 | Reusable GridTable: 15-row pages, sort, hide/show columns | Choose visible columns; last-column guard; navigation | `pilot.tsx` `GridTable` | 018,031 — no persisted reorder/default reset; handwritten tables lack chooser |

All numbered baseline sections above have **partial** acceptance coverage: present in source, with historical automated checks for many operations, but October end-to-end/browser/device acceptance outstanding. The register does not claim equivalent coverage of the separate original SHARED_PILOT.

## Dialog/form inventory

| ID | Form/modal | Actions and entry points | Source |
|---|---|---|---|
| FORM-001 | Generic FormModal | New/edit request and lines; all master data; opening/trace/reversal; request/task route planning; actual receipt/delivery; assignment/participant/carrier/split; near-expiry; POD; exception/resolution; custody handover; owner reset | `app/pilot.tsx` |
| FORM-002 | Current guided inline form | Context inherited, current command fields, optional evidence, batch row quantities, wait/block messages, next step | `app/guided-action.tsx`; `lib/guided-step.ts` |
| FORM-003 | Task plan/assignment | Delivery/pickup/documents task, quantity/from/to/date/lead/participant, prepare old request tasks, task completion | `app/tasks.tsx` |
| FORM-004 | Actual pickup dialog | Reservation/batch actual quantity + optional attachment | `app/actual-workspace.tsx` |
| FORM-005 | Extended-operation dialog | Destination/sequence/quantity/executor; actual collection/presentation/receipt/delivery; document result/redirect | `app/operation-workspace.tsx` |
| FORM-006 | Return dialog | Planned customer/undelivered return, destination, presentation, keeper acceptance/refusal | `app/return-workspace.tsx` |
| FORM-007 | Delete preview/dialog | Recheck protected dependencies, reason/password, cancel/confirm, server configured/rate guard | `DeleteDialog` in `app/enhancements.tsx`; `lib/deletion.ts` |
| FORM-008 | Member permissions | Role/function/active/project scope; owner-only edit, cannot alter owner | `MemberEditor` in `app/enhancements.tsx` |
| FORM-009 | Alert confirmation | Invitation rotate/revoke, request/receipt closure, restore; destructive/irreversible guard messages | `app/pilot.tsx` |
| FORM-010 | Server-search dialog | Record kind/search/server pages, direct request link | `ServerSearch` in `app/workspace-tools.tsx` |
| FORM-011 | Assistant integration/access | Existing authorization/integration setup and refresh/request links | `AssistantAccess` in `app/workspace-tools.tsx` |

Request types: `delivery`, `purchase_receipt`, `warehouse_transfer`, `distribution`, `receipt_order`, `customer_return`, `documents`. Document operations: collect, deliver, sign, return original. Existing legacy delivery commands include submit/approve/near_expiry/reserve/split_reservation/assign/verify_documents/load/create_route/depart/arrive/deliver/pod/complete_task/close/exception/resolve_exception/handoff. Existing direct receipt commands include assigned numbered receipt tasks, actual `receive_purchase`, `close_receipt`. Extended operations add `op_plan`, `op_sequence`, `op_authorize`, `op_reserve`, `op_issue`, `op_collect`, `op_arrive`, `op_present`, `op_receive`, `op_deliver`, `op_document`, `op_redirect`, `op_close`. Returns add `plan_return`, `return_destination`, `return_arrive`, `receive_return`, with legacy `return` compatibility. Administrative/master/import/backup commands remain role guarded.

## First-stage boundary and outstanding gaps

- New Command Center route, locally gated identity/dataset, local D1/R2; explicit local/test label. No production writes, existing live version 10 unchanged, no new hosting or public publication.
- First-stage work in progress: new grouped/theme/table shell; direct inherited request steps; opt-in independent keeper/courier loading for simple delivery, actor-resource/warehouse maps, central current-step drafts in local D1. **Local checks passed; owner/design/hosted acceptance pending.** Preserve extended and legacy flows.
- Unknown DEC-001: mismatch resolution authority/correction/reallocation/partial departure; safe discrepancy hold only until clarified. Unknown DEC-002: approved and verified independent shared deployment target. These do not block independent local UI/form work.
- Existing gaps: reusable global invitations, mapped account/task/warehouse scope added and locally tested (full all-surface acceptance pending), legacy mode still uses device-local drafts; new CC guided/modals/role workspaces use central personal drafts, one-action custody handover, configurable CSV/XLSX export, persisted/reorderable column chooser, full import sheet/template/row/error-report/update experience, proof preview and narrow MIME validation, return disposition statuses, complete data-backed KPI suite.
- No live two-device/two-account access, mobile camera/touch, actual screen reader or shared production-data tests were established by the intake audit.

## Evidence ledger

| Evidence | Result and limit |
|---|---|
| E-001 source/branch/route/API inventory | pass; read-only filesystem/code review against baseline; no live resource operations |
| E-002 source attachment presence/fingerprints | pass; supplied nine files available by their actual names; named design-reference files absent |
| E-003 historical CR-010 baseline | pass as recorded: typecheck/build; 195 domain, 9 SSR, 84 local API checks. Historical fixtures only; no new run claimed |
| E-004 October source checkpoint | pass for local checks: typecheck/build,230 domain,21 SSR,112 local API (363). See TEST_PLAN.md and evidence/*.log; source-only, owner operational/design acceptance pending |
| E-005 visual/keyboard/mobile/zoom/screen-reader | not tested; simulated viewport or SSR cannot establish real touch/screen-reader use |
| E-006 true shared account/device/auth/file acceptance | not tested; local trusted test identities must be labeled simulated; distinct shared target unresolved |

Required later acceptance scenarios, mapped to DAF IDs: role-to-role request visibility (006–010,019); two-session refresh/drafts (003,014); 100-unit 60/40 loading with reduced actual and mismatch (019–023); ordered multi-courier partial/full/refusal/return/alternate handover (024–025); partial multibatch receipt/FEFO (026–027); replay/race/conflict (030,034); direct-ID/import/export/file denials (008,032–033); recipient invite lifecycle (007); >1,000 rows/Arabic/leading zeros/sheet/errors plus independent visible/export columns (028–032); real proof second account (033); keyboard/reader/320–390px/200–400%/reduced motion (015); all historical and relevant new domain/API/build/type checks (005,035). Each eventual result needs scenario, role, inputs, expected/actual and evidence, or an explicit blocker.

## CR-012 continuation coverage
| IDs | Implemented source | Evidence / remaining limit |
|---|---|---|
| API-003 / UI-012 / FORM-008 / DAF-007 | `lib/invitations.ts`, join transaction, named-invitation panel; explicit scope/one-use/recipient/revoke | Local Worker tests; no real invitations sent or live accounts tested |
| UI-010 / DAF-028–030 | ImportCenter, worksheet/template/drop/preview/map/error CSV; add vs master-name update and old/new-name audit | 1,105-row/atomic/replay/type and non-first-sheet parser checks; actual browser file picker/drop not tested |
| UI-008 / DAF-032 | `/api/export`, tabular-export, report table selector/selected rows/count/scope/independent ordered columns | Scoped direct-ID/column denial, all-page 1,105-row CSV/XLSX and typed values; independent XLSX import inspection; native Excel not tested |
| UI-001–020 / FORM-001–011 / DAF-031 | GridTable + ManagedTable; all current native app/training tables have individual preference IDs, account/dataset keys, mandatory-column guards and keyboard ordering/reset | Pure preference and SSR row-control checks; real keyboard/zoom/mobile acceptance pending |
| API-004–005 / UI-007,018 / DAF-033 | Narrow content/extension/MIME checks, uploader/time, authenticated blob preview and download | Local second-identity preview/download, revoked scope and unsupported-file tests; full semantic validation/malware scanning not provided |
| DAF-035 | `review/DAF_First_Journey_Review.html`, same GuidedAction/WorkflowGuide/engine, explicit simulation banner | Built self-contained with no external src/imports; no browser/hydration/click/screenshot claim |

Remaining gaps: real shared auth/device/browser/reader acceptance and approved isolated publication; all-type dual loading, custody receiver acceptance, source-loading stops, return disposition and remaining KPI definitions. The local simulation does not establish any of those results. Source-backed file capabilities do not constitute owner operational/design acceptance.
