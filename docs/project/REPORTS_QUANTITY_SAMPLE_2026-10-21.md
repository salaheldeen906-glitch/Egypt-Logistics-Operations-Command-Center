# CR-REPORTS-021B — governorate quantities, branch reference, isolated sample data

## Authority and preserved baseline

Owner's follow-up: show physical governorate activity instead of repeating customer goods values; restore Customers branch form/table layout from `DAF_Original_Reports_Integrated_Review.html` and uploaded screenshot `image(20261021-171840).png`; prepare200customers/500products per each of four projects across14governorates with areas/statuses. Continue publishedv12, source `5c08a072d2bacbb1bb3fa4e2e7de3a2c138cec21` on the same public Site. No recreation, original-recovery claim, or Team Pilot change.

## Implemented vertical slices

- Governorate activity: actual scoped delivery/accepted-return facts; numeric governorate×unit rows, delivered/accepted/net quantities and distinct request/customer/product counts. Signed negative periods stay negative; unknown governorates stay explicit. Chart selects one unit and displays quantities, not currency. Customer value report remains unchanged in its own group. A new physical-table preference ID avoids restoring incompatible old monetary filters.
- Customers: always-visible branch form on the right, saved branches alongside, and real explicitly site-linked historical delivery snapshot below. Existing customer master/activity tables, columns, exports and permissions remain. Directory save uses existing `save_customer_site`; historical snapshots are never repriced or moved. No site link means no invented history.
- Scale: indexed customer/request/site links; links-only project membership helper avoids monetary projections; one fact projection reused for history; request filters/task projections memoized across1second clock ticks. No global cache over mutable State. Refresh/permission/filter/state changes still recompute.
- Synthetic sample: actual current `Pilot` UI at static `/reports-sample.html`, linked only from Reports. Source generator/build script is tracked; generated assets are built after the normal Site production build. It is not a new application or replacement operational dataset.
- Sample isolation: cloned deterministic fixtures only; no network fallback; CSP `connect-src 'none'`, `form-action 'none'`; unknown/live/auth/upload/seed/import/reset/stock/account actions denied. Only synthetic branch changes and drafts stay in memory, reset on refresh. Both interface storage objects are memory-only with separate synthetic identity/dataset scopes. Native account/file/navigation URLs are disabled except explicit return-to-live. JSON download clearly says synthetic/not a database backup. Existing XLSX table paths use local fixture responses.

## Sample data and independent controls

Four projects: Dental, IVF, Oncology, Devices. Each has200customers,500products,500requests,240branches and14canonical governorates with multiple districts. Total800customers/2000products/2000requests/960branches,964delivery rows and304linked accepted returns. Eight statuses, two separate units, explicit opening/issue/return movements, batches/expiry, multiple destinations/batches, missing prices and explicit free goods are represented. IDs/names are synthetic; no real contacts or credentials.

Known net value controls in EGP, explicitly partial due to missing prices: Dental666632.50; IVF802932.50; Oncology939232.50; Devices1075532.50; all3484330.00. Raw controls independently reconcile to the real report projection; these are illustrative goods values, not debts or financial inventory valuations.

## Verification

Focused tests: governorate11; customer18 (including links-only/history reuse); synthetic dataset14; sample network/write isolation9. Existing geo/value20 unique model checks plus SSR, table XLSX contracts, overview23model/18UI and order analytics regressions pass. TypeScript and production build are required on final source. No additional dependencies, paid services, backend schema/API/policy/authentication/runtime-binding changes.

Rendered actual-source sample checked in managed cloud browser:800customers/960branches/14governorates forAll; Dental200/240/14; local branch save success and old snapshot unchanged; branch XLSX status240rows across pagination; governorate table physical columns only; chart switch box→device; governorate XLSX status28rows; All known-net3484330EGP agrees independent raw controls. Browser verified actual CSP policy in DOM. Browser observations were synthetic only; real hosted multi-account/write acceptance is NOT_RUN. Some tool clicks exceeded the3second automation deadline during large projection transitions but resulting state completed and was verified; no application exception was reported. Mobile final outcome recorded below before release.

Final mobile QA PASS:390px iframe, document client/scroll width375/375 (no page horizontal overflow), branch form/table stack in one355px column, Arabic sidebar collapses responsively. Existing colors/branding retained. Local HTTP QA required a sample-entry-only CSPRNG UUID compatibility fallback; secure live authentication code was not changed.

## Recovery and limitations

Pre-change verified Git bundle `.sites-runtime/reports-20261021/source-v12.bundle`; retained savedv12 `appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_25349c2ec59481918588eac666e62bab`. Redeploy this exact version for code/UI rollback without resetting operational records. Bundle backs up source/tracked configuration only, not live D1/R2/attachments/runtime secrets. No full data backup is claimed. No hosted operational data was seeded, reset, copied, deleted or migrated. Synthetic branch edits intentionally do not survive page refresh.
