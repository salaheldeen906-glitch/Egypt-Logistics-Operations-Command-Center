# Integrated reports — additive release /21October2026

## Authority and target

The owner selected `DAF_Original_Reports_Integrated_Review (2).html`, the downloaded integrated review (Library file `libfile_7e7375f6ec4881919967930feae4876a`, version2), and authorized implementation on existing Site `appgprj_6ace37bed1fc8191af88d9705def4ba7`. This implements that integrated review, not the later simplified standalone dashboard and not historical-original recovery.

## Added behavior

- Reports & alerts retains its existing outer tabs and all Basic reports: operations overview, couriers/journeys/visits, data/products/deliveries/returns. A sibling tab contains governorates, customer goods value, quality checks and exact underlying facts. Preferences are scoped to actor/dataset; filters and the current two subviews are retained.
- Orders keeps the current operational table and every previous column. Added customer, governorate, current-step and action columns; current requests come before the read-only overview, distinct creation-date/status charts and product-by-unit details. Existing request creation and workflow buttons remain. No duplicate creation button or unwanted filter caption is added.
- Customer records remain in their own tab beside branches/governorates/activity. Project filtering uses actual request/need/task/delivery/site links, including distribution-only customers, rather than inventing project memberships.
- Governorates are explicit recorded codes. Per-destination/product agreed prices are optional decimal EGP values with integer minor-unit storage; free zero requires confirmation. Product master creation still creates no stock and does not require a receipt batch, expiry or selling price. Normal receipts retain their old quantity workflow.
- Need/task/delivery metadata is snapshotted. Different prices for the same product at two destinations never collapse into one price. Revisions retain existing approvals and quantity/custody protections. Metadata-only plan changes invalidate stale approvals. Changed actual/corrected addresses without a confirmed governorate become unknown; original records are preserved.
- Values use actual delivered quantity and exactly linked warehouse-accepted returns at the original recorded price. Missing prices/ambiguous returns remain unavailable or explicitly partial. Period and cumulative views use Cairo event dates. Units and currencies remain separate; these are goods values, not receivables or inventory valuation.
- True XLSX exports include filtered rows across pages and current ordered columns; original report export controls and JSON/CSV remain. All 102 original basic-report columns are retained. New read-only export source aliases require the existing relevant collection grants; integrated delivery/return exports cannot bypass a return-export denial. No new permission grants or users are created.
- Collapse buttons show arrows only while retaining accessible names, keyboard operation and expanded state. Existing theme/branding/sidebar direction are retained. New source rows/projects feed the same projections without fixed sample totals.

## Evidence

- TypeScript and production build: PASS.
- Existing operational domain, receipt, distribution, custody, batches, loading, role and workflow regression suite: PASS.
- Existing report behavior9, request evolution32, collapsible UI37 and overview/fresh-export18: PASS.
- New metadata28, journey/actual-visit32, orders analytics17, geography/value20 unique model checks plus SSR, customer metadata/UI12, existing evolution UI15, XLSX/table permissions and raw-row preservation: PASS. Repeated runs of the same checks are not additional coverage.
- Final disposable Worker/D1/R2 access acceptance:106 PASS, including four new integrated/warehouse export permission checks. This used local synthetic accounts/data only; no hosted account or operational record was modified.
- Independent source review found stale metadata approval, changed-address province and distribution-only customer filtering issues; all were fixed and checked.
- Internal browser QA used the actual Pilot component tree with an isolated in-memory fetch fixture. Verified request-table-first ordering, both report tabs, all old basic groups, geographic metrics/drill filter, customer tabs, saved-site province fill, keyboard tab activation and390px iframe without document overflow. Browser behavior does not certify real hosted multi-account acceptance.
- The hosted preview examples/snapshot and the isolated QA fixture are not included as operational seed data. No production data/attachments were copied into the source.

## Preserved state and rollback

Before editing, the source was clean at publishedv11 `b522f149e60a96a9959c28f599ea3b9326ad7c3c`. Saved rollback version:

`appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_70919dc27a9481918a01f6b6f7ed0432`

Its retained deployment archive SHA256 is `6defc105ee7e8f43305c69322b24c51eeb3acd37b25b1256c85d308bc9aa0572`. A complete verified Git bundle is held in ignored `.sites-runtime/reports-20261021/source-v11.bundle`.

No live database reset, migration, overwrite, seed, account/permission change, audience change, runtime environment change or attachment mutation was performed. D1/R2 bindings and configuration remain unchanged. The checkpoint backs up source and tracked configuration; a complete live database/R2/secrets backup is **not** claimed.

To reverse the interface/source release, redeploy the exact retainedv11 version without resetting D1/R2. Any newer operational records and optional metadata must remain untouched. Reverting frontend code does not restore historical data or permissions. The new fields are additive JSON metadata and require no schema rollback.
