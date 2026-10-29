# Quantity controls and Dental catalog — 22 October 2026

The owner accepted the actual-UI quantity review with “نفذ بس مفيش كمية مخازن بالسالب و حط معاهم المنتجات دي في الدنتل”. This authorizes release on the same existing Site and addition of the supplied product master records. A later clarification states the owner will configure batch/expiry when needed. The trailing unfinished request about event records is not interpreted or implemented.

Target: `appgprj_6ace37bed1fc8191af88d9705def4ba7`, existing public audience and D1/R2 bindings unchanged. Continue reviewed source `e2b013641b626feb61ecd6a0295b70bb8124665b`; live before release remains v13 / `adf6d834599f60e9309a13f6c288b2decafa5268`. No other application is a target.

## Data and rollback checkpoint

Before release/import the signed-in owner's existing interface created backup `a53e9a00-28d6-4db0-b0db-c462edc1fab3`; the new backup row appeared on 22 October at 11:17:52 Cairo. Existing backup endpoint includes current operational state, attachment bytes, audit, member directory and operation history; it excludes authentication credentials/session secrets and is not a complete export of access grants/runtime secrets/configuration. The 20MB attachment limit applies. Backup creation incremented active dataset revision16→17 without changing operational rows. No reset or restore was performed.

Complete source history checkpoint: `.sites-runtime/dental-20261022/source-review-e2b0136.bundle`, verified. Existing v13 saved version remains `appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_a3ac9b4a3b348191aaa7da029bc00f1e`. Redeploying v13 rolls back code, not imported products or operational state. Review new pending quantity approvals/discrepancies before rollback because v13 cannot manage all new work items. Do not restore a backup automatically or delete newer records.

Native read-only dataset/entity joins verified the active dataset `pilot-1bc3580f-e19e-4aae-b46e-0a82526d3ef2`; the similarly named root dataset is inactive. Existing active Dental record: `8ebcd1c1-c450-4304-ad20-febe7035c30a`; BOX unit: `c3eb740e-5e02-4137-a947-cc464f2902aa`. All existing projects are retained, including the existing Materials record. No project-count normalization or placeholder creation.

## Additions

- Reviewed actual keeper/courier declarations, independent approvals, discrepancies, stock alternatives and actual issue report are released without changing their reviewed behavior; see `QUANTITY_CONTROL_2026-10-22.md` for boundaries, especially separately approved loss/damage/wrong-batch adjustments and prior XLSX browser limitation.
- Final transaction stock invariant rejects any affected warehouse/product/batch ending with negative physical or free stock, nonfinite amounts or invalid precision. Existing stock is never clamped to zero, balanced by invented movements or changed by product definition. Read-only unrelated historical negative records are not hidden or rewritten.
- Source workbook SHA256 `869a85224c4043c18b2c9b6300ba6f559fad7dc7dd1b0d4f40988ee304cb98ca`:254 distinct source IDs/names,245 Dental Materials,9 Dental Anesthesia,11 companies. `Os` appears on15 products; one compound SKU is preserved. Stable internal code `DENTAL-{productId}`; SKU remains an original descriptive field and is not treated as unique. Exact raw source SKU, original row and source fingerprint are retained separately.
- Optional metadata accepted by existing import/master pipeline, visible/searchable in Products and available in scoped exports. Original product columns and all request/report columns remain. No real catalog is embedded in public assets. Prepared private CSV is outside tracked/public source. Existing products are never renamed, merged or overwritten by this addition.
- Existing import also accepts pasted CSV in a closed optional disclosure, using the same file parser, mapping, full-batch validation and transactional confirmation. This avoids requiring expanded extension file access; no new endpoint or authentication bypass.
- New definitions use the existing unchecked batch/expiry defaults, per deferred owner configuration. Product editor now permits changing those flags before any inventory movement/reservation. Expiry implies batch tracking; later policy changes are rejected server-side, including owner attempts. Same-value flags/name edits remain possible. History records actual actor, time and prior/new flags. Code/project/unit/source metadata cannot be changed by this edit. No batch number/expiry date or inventory is requested at master creation.

## Verification

- 11 stock integrity cases including reproduced stale-hold regression: physical120, holds100+30, attempted pickup100 must be rejected atomically instead of leaving available−10.
- 22 catalog/schema/domain cases; CSV roundtrip preserves raw whitespace; actual attached254-row workbook and prepared private CSV imported only into isolated in-memory copies, with zero new inventory/batch/reservation records. Private prepared plan:254ready/0conflicts against the verified active masters.
- 12 policy edit cases: strict booleans, no cross-scope/read-only editing, expiry dependency, immutable metadata, history identity, lock after movement/reservation, name-only compatibility, and actual receipt requiring matching batch/expiry after enabling policy.
- Existing domain suite passes; final disposable built Worker/D1/R2 quantity API44/0; parser CSV3 and XLSX4; minimum-quantity SSR5; original isolated review transport9. TypeScript, production build and diff check pass.
- Browser review uses synthetic memory-only data and actual application components. Live import outcome, final version and deployment identity are recorded separately after native release and actual import confirmation; no successful build is presented as proof of imported records.

## Publication / import result

Published successfully at the existing URL as v14: saved version `appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_858e2149ba708191a83fadd5ff63ca9a`; deployment `appgdep_6ad9cf702560819195ae30daeb79a391`; code commit `ffe71a8b6157df655aed750a6124b046346b40fe`. Native terminal status `succeeded`, environment revision3 preserved. Archive SHA256 `9650da33f32f356d8ee228eac1725c25ed6d7bdeaf7c7348ef0b9268cad0efbe`.

Actual signed-in owner interface validated254new/0updates, then confirmed the whole import. UI shows batch `IMP-d0bde0b2`,254rows,`applied`; active dataset revision17→18. Dental now257products (254new +3existing); whole active dataset261products. The private catalog is operational authenticated data, never a public fixture.

Native read-only pagination verified all268product rows across both retained datasets: all254new source IDs/code/name/SKU/exact raw SKU/category/company values match the original workbook; all belong to the verified active Dental/BOX IDs. All14pre-existing product rows across both datasets remain byte-for-byte unchanged. All22prior movement rows across both datasets remain byte-for-byte unchanged, with22before/22after. No inventory or batches were created by import. No placeholder projects, deletion, reset, restore, migration, scope/auth/sharing mutation was performed.

Actual UI keeps prior product columns and personal order; newmetadata columns appear and Dental filtering shows257rows. Existing Excel control reports preparation of257filtered rows; actual browser download-file integrity was not separately verified in this task. Isolated rendered test imported two synthetic products with a repeatedSKU and successfully enabled expiry/batch in the editor with automatic dependency; no live policy was changed just to test. Live proof image excludes the account area. Internal managed preview was stopped; only the actual existing Site tab is retained as a deliverable.

This final verification entry is a documentation-only source follow-up to the deployed code commit above; it does not require another application deployment.
