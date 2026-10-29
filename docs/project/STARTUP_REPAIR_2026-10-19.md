# Startup repair — 19 October 2026

## Incident and evidence

The owner reported that the actual Command Center would not open. The live shell displayed `Wrong pilot dataset` and `/api/command-center/state` returned 503 `PILOT_ISOLATION`. Native read-only inspection confirmed that an owner restore at `2026-10-19T11:21:09.512Z` created the sole active dataset `pilot-1bc3580f-e19e-4aae-b46e-0a82526d3ef2`, with an exact creation-time audit edge to the configured root `daf-egypt-command-center`. The original dataset remains inactive. The existing restore handler deliberately creates a new dataset, while the old Command Center guard accepted only the root ID. This is an isolation/restore compatibility defect, not evidence that authentication failed or original historical records were recovered.

## Scope and protection

Target remains `appgprj_6ace37bed1fc8191af88d9705def4ba7`; preserve its public landing audience and authenticated/scoped operational access. Central `dataset()` now validates the selected active dataset against the configured root. Descendants require a unique restore/reset audit record at dataset creation time, an existing parent with consistent chronology, and a chain reaching that root in at most 20 edges. Missing/ambiguous/malformed/cyclic/unrelated lineage, `pilot-main`, and multiple active datasets fail closed. No dataset is selected by its name or UUID prefix. All checks are read-only.

No database reset, restoration, migration, record overwrite, environment change, membership/permission change, file write or sharing change is performed on hosted resources by this repair. The separate reports redesign remains unpublished and is absent from this clean checkout. Team Pilot and other Sites are not targets.

## Checkpoint and backup limits

Published code rollback point is saved v7, source `4bba9de4ca4ab58060ab7665b2334c825a4e77f0`, saved version `appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_74e6b00b4b5081918a4710be868a6e83`. Its archive SHA256 is `28bed04dbf226ea1c351f1e7b9a6a784c15da1eff2abd1bbedbe475a187c2312`. Existing environment revision is 2; it is not changed. The source/history checkpoint is complete for code, but is not a new database/attachment/configuration-secret backup. Native read-only metadata and audit inspection are not a complete or atomic database export. This release performs no data restore. Republishing v7 would reinstate this startup defect for a restored child dataset; never change active datasets or revert data to conceal that defect.

## Verification and limits

TypeScript and production build passed. Local integration uses disposable Worker/D1/R2 and simulated platform identities only. It exercises real local backup/restore/reset handlers, repeated descendants, bounded lineage, invalid ancestry, read-only validation, ordinary and Command Center endpoints, unchanged auth and permission scopes. Independent source review found no material issue. Passed local integration suites: 39 lineage/startup, 29 Command Center, 38 evolution/GPS access, and 85 legacy Worker/D1/R2 checks. The existing domain regression runner also passed. The first legacy API run lacked its compiled test fixture; running the existing domain setup generated that fixture and the full rerun passed without changing product behavior.

Known pre-existing limitation: restore remaps operational record IDs but does not remap the global member project/resource/warehouse scope settings. A scoped member may see no matching restored records. This hotfix deliberately does not widen or remap permissions. Invitations and drafts also remain bound to their original dataset. Opening the owner view does not prove multi-account recovery or restoration of the unavailable earlier four-project application.
