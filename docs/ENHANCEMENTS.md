> تقرير النسخة السابقة. الحالة الأحدث والدورة التفصيلية في [REBUILD_AR.md](REBUILD_AR.md).

# DAF Team Pilot enhancement review — 24 September 2026

Existing Sites project: appgprj_6ab370ed38388191ac8fc17a93e8e9e4.
Baseline: clean main, ce2e11d359666f5d636494215bd9e4d37ec3236d.
Target: existing D1/R2 Team Pilot, not the separate workers.dev/local ERP project.
Publication pending review under specification clause 04-10.
No production records, invitations, audience settings or memberships changed.

## Preserved contracts

app/pilot.tsx owns the seven navigation groups. lib/engine.ts owns command permissions,
state transitions, FEFO, issue/delivery/return accounting and dependency validation.
lib/server.ts persists versioned atomic D1 commits and audit; R2 stores attachments.
Trusted ChatGPT identity is required on every API request. The platform owns
/signin-with-chatgpt, /signout-with-chatgpt and /callback. No app callback or identity bypass was added.

Thirteen original status codes remain. Delivery commands retain delivering; POD is a separate record,
and closure requires reconciled custody, applicable POD and resolved exceptions. No synthetic
delivered transition or accounting change was introduced.

## Requirements and evidence

| ID | Requirement | Baseline | Implementation | Acceptance / evidence | Status |
|---|---|---|---|---|---|
| UI-01 | DAF blue, language, seven groups, clock, dynamic projects | Present in green theme | globals.css, enhancements.tsx | RTL/LTR, reduced motion, desktop/mobile screenshots | Existing + enhanced |
| UI-02 | Six queues, intervention list, refresh | Four aggregate cards | insights.ts, CommandCenter | Domain counts match filters; browser review card 2 → 2 records | New |
| UI-03 | Actual stages, current age, completed duration | Four visual groups | Additive timeline and stageEnteredAt in engine | Unknown/future history unavailable; real transition tests | New |
| UI-04 | Unified operation card | Existing drawer | Reconciliation, unallocated quantities, stops, timeline, prerequisites | Browser drawer and API closure tests | Partial: priority/task types absent in model |
| UI-05 | Joint/split assignments, workload | Split reservations, one executor | Participant on same assignment, workload and waiting requests | Joint quantities unchanged; existing split test; three-stop test | New joint; split retained |
| UI-05b | One request with pickup/docs/two delivery addresses | One destination per request | No incompatible business-model change | Agree additive tasks/stops/quantity/POD contract first | Blocked by business contract |
| UI-06 | Warehouse and units | Existing balance service | UOM grouping, project/warehouse filter, movement dates | Unit grouping and original FEFO/accounting tests | Enhanced |
| UI-07 | Dynamic project health | Project chips | Open/overdue/closed with drilldown | Same filtered request scope; invalid details closed on refresh | New |
| UI-08 | Sort, columns, paging, reset, file analysis | Client paging, first-sheet import | Raw-value sorting, hide columns, reset, independent worksheet analysis | 3 CSV tests and two-sheet XLSX browser test | Partial: server pagination outstanding |
| UI-09 | Protected deletion | Import undo only | deletion.ts, delete-security.ts, server/API, DeleteDialog | Role/scope/password/dependencies; recheck and transaction guard; API tests | Implemented; runtime secret not configured |
| ACCESS | Grant roles/functions/projects | Basic owner member editor | Clear entry, MemberEditor, server/file/export scopes | Persisted scope, direct denial, viewer denial, revocation tests | New scopes + improved UI |
| AUTH | Real sign-in | Published callback 404 observed | Platform route preserved | Local tests use simulated trusted identities, not real accounts | Blocked: real sign-in unverified |

## Metric contracts

- Queues count unique request IDs: review; approved/reserved; ready; in_transit/arrived/delivering;
  open and dueDate before today's Africa/Cairo day; any delivered quantity without a recorded POD.
  The POD queue includes partial deliveries. Overdue/POD overlap stages and must not be summed.
- Date filters use request creation day in Africa/Cairo. Labels explain these are current queues
  among requests created in the chosen period, not historical transition counts.
- Warehouse filters use reservations/assignments. Unallocated requests disappear for a specific
  warehouse. Project health uses the same request filters.
- Current age applies to open requests with valid stageEnteredAt. Completed duration uses
  consecutive actual transitions. Missing history and future timestamps show unavailable.
- Action center order: overdue, missing prerequisite documents, incomplete assignment, other work.
  Due date and code break ties. No invented priority is stored.
- Current stock uses existing balance() independently of request dates. Summaries group by unit.
  Posted movement dates scope movements. Existing custody calculation is product/warehouse-wide;
  it is shown in the UOM summary rather than misleadingly repeated on each batch row.
- Route cards match any filtered request but retain their complete stop sequence. Stop progress is
  completed / all recorded stops, not GPS. One completed stop does not close a three-stop route.
- Export includes all matching requests and lines, not just the visible page; it is not a full backup.

## Permissions and deletion

Existing members without project scopes keep existing all-project access.
null = all current/future projects; [] = no project data. Shared directories remain common.
Restricted members cannot mutate shared masters, use global imports/corrections or manage members.
Routes spanning unauthorized projects are hidden. Allowed request details remain visible.
Scope/role/active membership are checked in the same D1 transaction as every mutation.
Member audit records include target role/function/scope changes.

Owner/manager only can preview/delete. Password never overrides dependencies or status.
Draft deletion explicitly previews its own lines, not an arbitrary graph cascade. Used masters,
posted quantities, verified documents, active routes and individual stops remain protected.
Import batch deletion is all-or-nothing and refuses opening balances and imported requests.
The old undo_import API is password protected too. Scoped project references also block deletion.

Configure DELETE_PASSWORD_HASH through Sites runtime secrets when publication is approved.
Format: pbkdf2:100000:<16-byte random salt as hex>:<32-byte SHA-256 PBKDF2 digest as hex>.
Use the privately supplied password; never place plaintext in source, assets, docs, URLs or logs.
Missing configuration disables deletion. Every attempt needs fresh verification; there is no unlock.
Shared D1 rate limit: five attempts per user per fixed 15-minute window. Success and failure audited
without password. Operation hashes are computed after password removal.
Attachment metadata deletion removes app access; R2 bytes remain for existing backup references.

## Verification

- 30 existing domain assertions: FEFO, permissions, reservation splitting, partial delivery,
  return, custody reconciliation, closure and import dependencies.
- 21 enhancement domain assertions: scopes, protected deletion, participation, transition history,
  unit grouping, Cairo boundary, card/list equivalence, future timestamps, three-stop completion.
- 42 local Worker + D1 + R2 API assertions: full cycle, persisted shared state, optimistic conflict,
  idempotency, files, import, backup/restore/reset, scopes/roles, password rejection and success,
  rate limiting, audit redaction and disabled membership.
- 3 real CSV parser scenarios including 250 Arabic rows and invalid/quoted headings.
- Browser XLSX: Summary = 1 row; Details = 4 rows; quantity totals Dental 15, IVF 7;
  one invalid numeric value excluded. Analysis created no operational records.
- Arabic RTL and English LTR. Desktop width/scrollWidth 1348/1348. Mobile viewport 390px,
  document width/scrollWidth 373/373. Permission footer overlap found and fixed.
- Review card 2 opened two records. Deletion preview showed real blockers and disabled confirmation.
- TypeScript and Worker build pass. Temporary /qa, /qa-mobile and fixture hooks removed.
  Supervised preview stopped. Screenshots in docs/images are read-only test fixtures.

These isolated simulated-identity tests do not prove real Google/ChatGPT login or a live two-person
pilot. No production operational mutation was used for testing.

## Open decisions, deployment and rollback

1. Resolve platform authentication and perform real owner/member acceptance.
2. UI-05b proposal: additive task records with pickup/documents/delivery types, lead/participant
   per task, task-linked stops, bounded line quantities and POD requirements per delivery destination.
   Existing requests keep their single-destination interpretation. Agree completion rules before
   implementing this inventory-affecting extension.
3. UI-08 still uses the original full permission-scoped snapshot and client pagination. Server
   aggregate/list/detail endpoints need a compatible loading refactor; not large-dataset ready.
4. Priority remains unrecorded; independent task states are not invented.
5. After approval, configure the deletion hash and deploy the saved version on the same Site.
   Audience stays unchanged. Deployment does not grant roles or invite teammates.
6. Restore creates fresh entity IDs, so explicit project scopes fail closed after restore.
   Owner must review/reassign them; never silently broaden to all projects.

No D1 migration is needed; JSON fields and keyed scope settings are additive.
Rollback to the baseline is unsafe after restricted scopes are configured: it ignores those scopes.
Keep the scope enforcement in any rollback build, or block team access while restoring a reviewed
compatible build. Do not silently republish the old unscoped API.
