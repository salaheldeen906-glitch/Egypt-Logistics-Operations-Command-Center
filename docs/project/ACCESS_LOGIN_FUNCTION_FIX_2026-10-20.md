# Access login configuration correction — 20October2026

## Evidence and authority

The owner reported the newly shared password account could not enter the existing DAF Site. The attached screenshot showed MEMBERSHIP: a specific operational function must be assigned. Read-only native records confirmed password logins succeeded and created sessions; the affected member was contributor/all with client_admin enabled. The current source remains publishedv10,4b66c78ed37b69470857412eaedcde72365516e9, on appgprj_6ace37bed1fc8191af88d9705def4ba7.

No credential from the screenshot was used or copied into source, test fixtures or logs. No account role, function, password, project scope, delegation, time period or session was changed during diagnosis.

## Cause and scope

The access form defaulted new accounts to contributor/all and the access API accepted that combination. The established Command Center actor guard intentionally rejects unassigned contributors. Password verification therefore succeeded but the subsequent operational-state read failed. The93prior access tests used manager/all as their helper default and missed the real UI default.

The correction requires an explicit operational function for an active contributor in the form and validates the same established rule on the server before saving. Password sign-in validates an existing account's operational configuration before minting its session. Manager/viewer defaults, explicit project/warehouse/courier scopes and all authorization/expiry checks remain. Disabling an already misconfigured account remains possible. Client administrator is an independent bounded administration grant and never automatically promotes the base role or bypasses actor prerequisites.

No automatic promotion or inferred operational function is permitted for the existing person. The owner must intentionally choose that person's intended function or base role; an unanswered clarification is not permission to expand access.

## Checkpoint and release

The savedv10 archive is the compatible source rollback point. A complete Git bundle of the current source was preserved before edits. This is a source-only correction: no migration, seed, environment/audience change, data replacement or credential rewrite. Existing data stays in its current bindings; no claim of a fresh full data backup is made. Do not roll back to pre-accessv9 while real access accounts/grants exist.

Verify invalid create/update rejection before writes, invalid existing password login without a new cookie/session, explicit contributor login and scoped state, disabled-account handling, and legacy isolation controls. Record exact results at handoff. Publication of this corrective code does not establish that the existing user's configuration has been changed or that their next login succeeded.

## Verified checks

- Corrected production build and TypeScript: PASS.
- Corrected access Worker/D1/R2 integration suite:102PASS,0FAIL, including9new regressions of the real form default and subsequent login.
- Existing isolated Command Center suite:29PASS,0FAIL, including continued rejection of an unassigned all-function contributor and preserved personal receipt/custody/draft scope controls.
- Independent source review: no blocker found; existing actor guard unchanged, no automatic role/function/scope changes, invalid configuration rejected only after correct password and before session issuance.
- Real affected account remains unchanged pending its owner's intentional role/function selection. No assertion of a successful real-user password login is made by these isolated checks.
