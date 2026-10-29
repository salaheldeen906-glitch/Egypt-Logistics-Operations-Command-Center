# External transport — 22 October 2026

The owner requested this change on the existing DAF Site. It extends Trips & execution, Basic reports and the existing carrier directory. No new Site, operational projects, accounts, access grants or sample production shipments are created. No migrations, data resets or stock revaluations are used.

## Result

- Carrier directory: contact, phone, email, service, address, notes and relationship status. Driver/vehicle facts are historical shipment snapshots with scoped suggestions.
- Multi-request shipment headers and quantified reservation/task lines retain project, customer/address, SKU, unit, batch/expiry and packaging snapshots. A request may span shipments; both source stock and destination allocation cap the quantities.
- Already-issued courier custody transfers to carrier custody without another issue movement. Direct warehouse issue uses a separate warehouse declaration and independent employee-recorded carrier receipt, with linked proof. The carrier has no fictional login or employee signature. Blank quantities stay blank; actual zero/excess/mismatch declarations are retained without automatic issue.
- Carrier customer deliveries and actual warehouse return acceptance use the existing deliveries/returns/movements ledger. Existing internal actions cannot spend externally committed quantities. External execution does not credit internal courier performance.
- Waybills/documents, issuer/type/number/date invoice identity, multi-shipment invoice coverage and freight expenses remain separate from declared goods value. Invoice coverage prevents double transport billing of the same shipment. Money uses integer minor units; currencies are not silently converted or combined.
- Five scoped reports: shipment register, per-unit carrier custody, performance with known timing denominator, invoice coverage and actionable follow-up. Existing columns/reports remain. New tables use compact display defaults, optional columns, filters and existing secured CSV/XLSX export.
- Historical records explicitly remain nonposting, project-scoped reference data. No inference turns the supplied example invoice into freight cost, the participant into a driver, or description quantities into carton conversion rates.

## Preserved boundaries and limits

- Direct external loading currently consumes a complete selected held reservation. Split the reservation in the existing request workflow before planning a partial direct load. Partial handovers of already-issued custody remain supported.
- A shared shipment requires access to every linked project/warehouse, including a return destination warehouse. Existing limited grants are not expanded. Own-source numeric custody projections keep courier figures correct when shared details are hidden.
- Warehouse release/return acceptance requires an actual warehouse-function account. An owner cannot impersonate that occupation. Existing explicit grant ceilings do not automatically acquire new command leaves.
- Saved actual facts and financial/document links prevent replacing their shipment context. Corrections need the recorded correction workflow; there is no generic erase-posted-event button.
- Historical uploads from unrelated operational requests are not attached. The historical form records descriptive lines only; an arbitrary Excel transporter import pipeline is not claimed.
- Product packaging conversions, handling/serial tracking, GPS, rate contracts, accounts payable and payment execution are future scope. Package count/type here is independent of product UOM.

## Checkpoints and rollback

Source before change: b081c84557aab44b19e1433cf4fe686555e158e2; complete verified Git bundle `.sites-runtime/external-20261022/pre-change.bundle`, SHA256 e447bf25e8fe45eae01e12c3865beb664bea05081ffb4cc7345c3104526065cb.

Real current-data backup: d7363126-0833-445f-9dab-5b7f60ceab14, shown by owner UI at Cairo22October12:45:48. Backup changed active dataset revision18 to19; no operational row edits were part of that operation. It covers the application's operational snapshot, included attachments and audit/member directory. The existing20MBattachment limit applies. It is not an export of passwords, sessions, detailed access grants, runtime secrets or external configuration.

Frontend/code rollback is the retained v14 saved version appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_858e2149ba708191a83fadd5ff63ca9a, code ffe71a8b6157df655aed750a6124b046346b40fe. Do not restore an old data snapshot over newer operational records. After external shipments exist, v14 lacks external custody spending guards and cannot safely operate their affected requests. Pause affected operations and review those records before any older-code rollback; keep new data and use a forward correction where possible.

## Verification and release evidence

Domain, scope, read-only projections, secured exports, existing regressions, isolated browser and disposable Worker/D1/R2 results are recorded below when completed. These tests use synthetic records, not user operating data. A successful build is not evidence of historical recovery or a live multi-account operational transaction.

Verified before release:

- External domain90checks, scope/attribution37checks, report/export18checks, isolated actual-engine adapter24checks: PASS.
- Disposable built Worker/D1/R2 acceptance33checks: PASS, including actual multipart/R2 upload, authorization, atomic stock posting, idempotency, concurrency409/no partial cost, return acceptance, audit, invoice coverage, historical nonposting and readiness/pending-signature guards. Platform identities are simulated; this is not a hosted multi-account sign-in test.
- Existing domain suites, quantity controls, stock integrity, Dental catalog, tracking edits, access policy, quantity access, journey evolution, travel export/SSR and warehouse issue report checks: PASS. Tests cover prior paths; no hosted data fixtures are used.
- TypeScript, production build and diff whitespace checks: PASS. Build retains its existing large-client-chunk advisory.
- Browser actual-UI synthetic review: distinct warehouse and dispatcher roles; warehouse100 followed by independent carrier100; customer delivery60 leaves40carrier custody. Actual UI fields begin blank and require linked proof. Compact new-table defaults, existing Arabic-right navigation and current color theme retained.
- The downloadable self-contained review contains actual current Pilot/engine, two explicitly synthetic project/request/shipment scenarios, memory-only writes and denied live network. It is a review tool, not a copy of operating data. Its reset only resets disposable page memory.

Publication outcome is recorded after the native Sites operation. Source and archive must be the exact pushed state; runtime bindings and public landing audience remain unchanged. Deployment alone is not an operational shipment test.

Published v15 successfully:

- Pushed code f0b22026c330e826fae46541b1525e93c3f320d1.
- Saved version appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_fc0d7a8ebfe88191bb7b5688717d4023.
- Deployment appgdep_6ad9ddc616d081918d2ec1a7f72ccd42, terminal succeeded, environment revision3 preserved.
- Production URL https://daf-egypt-command-center.salaheldeen906.chatgpt.site.
- Local compressed release archive SHA256 5d78215e745c12e2349ba4ac378909d19abd9e038973821a4cae02cba5a0ee8f; native stored archive content hash sha256:b4c321cb1ef23c7d8d6f604242c042888776e9584c647d116ae9aa777cabf012 (separate packaging representations).
- Signed-in actual live UI verified new external shipment section/action/table, preserved existing trips content, active dataset19 and no runtime console errors. It shows no operational external shipments because none were seeded. No real shipment was posted for validation.
- User-facing self-contained review DAF_External_Transport_Isolated_Review.html saved separately; actual browser live screenshot excludes personal account area.
