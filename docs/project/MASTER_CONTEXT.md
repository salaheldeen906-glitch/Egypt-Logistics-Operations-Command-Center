# Current source of truth
- Existing Site: DAF Logistics — Team Pilot, project `appgprj_6ab370ed38388191ac8fc17a93e8e9e4`.
- Runtime: Vinext/React, Cloudflare D1 and R2. Preserve this architecture.
- User priority: Arabic, simple steps by role, compact Excel-style rows, explicit people and destinations, trace every task to its request and evidence.
- Sources: current user request and four screenshots (2026-10-05); verified repository implementation. Prior release: version 9, commit `943cc08f8cd0e1bc08c1aba5fda46e17a771179f`.
- Operational data are not used as a test fixture. `/walkthrough` uses browser-local demonstration data.
- Backend authorization is by membership/function and project scope. A resource executor is not a login identity. Do not imply per-resource account enforcement.
- Browser visual QA is unavailable under the managed Sites workflow without control-browser. Local API tests simulate trusted platform identities; they do not verify live ChatGPT login.

- Latest CR-007 supersedes earlier mandatory-evidence rules: evidence is optional; actual quantities and pending courier custody remain mandatory. Return destination may be chosen later for goods actually collected back from the customer.
- Current implementation and verification: CURRENT_TASK.md. Mobile camera uses the browser file-input capture capability; device QA is not claimed.

- CR-008 screenshot confirmed ambiguous return source and role UI. Keep role screens separate; never bring back a generic source selector that offers customer returns with zero delivered quantity. Return completion must name the next execution action.

- CR-009: default view is the inline current action, automatically refreshed after saving. Do not regress to a next-step button that merely opens a role tab. Test the returned-one/zero-custody stale-task case, partial pickup and partial warehouse acceptance when changing workflow selection.

- CR-010: explicit one/many-batch selection with expiry, available quantity and per-stage actual quantities. Partial reservation cannot authorize dispatch early. Dispatcher may reserve and confirm actual pickup; keeper acceptance remains separate. Preserve source-specific batch trace, atomic multi-row saves and batch-filtered custody totals.

## October 13 / CR-011 latest checkpoint
Owner chose this repository. Local branch `work/egypt-africa-command-center`, opt-in gated new route, scoped styles/navigation/My Tasks, independent loading signatures, mapped members, central draft transport. See CURRENT_TASK.md, REQUIREMENTS.md, COVERAGE.md and TEST_PLAN.md. New requests use dual signatures only for simple delivery; retain all previous contracts and functions. Pending returns precede loading. All original reservation line/batch groups require an actual agreed confirmation before departure; partial held remainder does not become custody. Never sign both sides with one account.
Existing live version 10 remains untouched. No remote source push, deployment, hosted isolation setup or real login/device/browser QA was performed. Publish only after the owner's attachment-required isolated target and first-journey review. Continue incomplete October features from this checkpoint; never restart the app.

## CR-012 current continuation
User requested execution here using the uploaded source. Current branch `work/command-center-continuation`, CR-011 rollback `a98181a`. Named invitations, complete import selection/preview/error/rename flow, scoped configurable CSV/XLSX server export, all current table preferences and narrow proof validation/preview are implemented in source. See CURRENT_TASK.md and TEST_PLAN.md for limits and evidence. A standalone offline first-journey review uses actual components with explicitly simulated roles and device-local test data; it is not the shared pilot. Existing public Site v10 remains unchanged. First-journey owner review, DEC-001 discrepancy policy and DEC-002 physically isolated hosted target are still required before operational generalization/publication.

## CR-014 current truth — 2026-10-14
Current target and latest approved scope are in CURRENT_TASK.md. The owner explicitly authorized implementing/publishing on the independent Egypt Site (CR-013), preserving all older Sites. Old references to Team Pilot as the current deployment target or to an unknown isolated target are superseded for this task. DAF-036–045 cover the new 12 additions and reference design. Operational schematic visualizations must not be described as live GPS. Real-device/login/accessibility/pixel appearance remain unverified; regression/API/SSR evidence is kept separately.

## Latest owner instruction — 2026-10-14
Owner selected `appgprj_6ace37bed1fc8191af88d9705def4ba7` and explicitly authorized implementing the agreed web app there using Sites only. Current implementation, target and limitations are in CURRENT_TASK.md. This supersedes older deployment-target statements. No claim of restoring the unavailable old 13-section source.
