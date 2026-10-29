# CP-01 — Private pilot candidate

2026-09-23. Continue this project; do not recreate it.

Project ID: `appgprj_6ab370ed38388191ac8fc17a93e8e9e4`.

Implemented: bilingual seven-group operations UI; ChatGPT identity and server roles/functions; D1 and R2; inventory ledger, FEFO, expiry approvals, untraced opening completion; requests, reservations, split execution, documents, multi-stop routes, pickup/issue/loading, partial delivery, POD, returns, exceptions and custody handover; import mapping/all-row validation/deduplication/undo; full backup/new-dataset restoration/reset; audit trail and polling.

Key files: `app/pilot.tsx`, `app/globals.css`, `app/api/*`, `lib/{model,engine,server,import}.ts`, `db/schema.ts`, `drizzle/0000_smooth_komodo.sql`, `scripts/test-*.mjs`, `tests/domain.cjs`.

Final automated evidence: 30 domain + 26 compiled API + 3 CSV checks, no failing checks. See `ACCEPTANCE.md` for the distinction between local simulation, live browser fixtures and real-account acceptance.

Resolved defects: D1 compound-select limit, entity kind collision in imported batch persistence, capped near-expiry allocation across split reservations, delivered returns excluded from transport custody, reset idempotency, independent R2 attachment rehydration on restore, bounded request bodies.

Outstanding gate: real signed-in owner review, then explicit audience approval followed by two-account/cross-device acceptance. No public audience or invitation link has been activated by the agent. No paid service activated.

Next action: open the private deployment as the owner and select Load sample data. Do not describe team sharing as verified until criteria A/B/C/M and a full browser workflow pass with real accounts. Keep the existing source repository and append migrations; never rewrite an applied migration.
