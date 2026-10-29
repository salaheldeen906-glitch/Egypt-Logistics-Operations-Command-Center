# Approved reports group and section visibility — 19 October 2026

## Authority and checkpoint

The owner approved adding the exact `DAF_Reports_One_Group_Review.html` preview to the current app, and requested show/hide controls on growing dashboard and warehouse sections and comparable long lists, with no unrelated modifications.

Target: existing public Site `appgprj_6ace37bed1fc8191af88d9705def4ba7`. Source checkpoint is published v8, commit `ec470d63c1afb58f1cf05a4be763b787b71c67f4`, saved version `appgprj_6ace37bed1fc8191af88d9705def4ba7~appgver_97c34c3b9b588191b103791b0b382e95`, archive SHA256 `a009afac2998f7b91d881fbf4f1e22bd37ad9b72aae7cf6ea9da1d0ff4210c27`. Its complete code/archive remains the rollback point. This is not a data restore; no new database/attachment backup or data rollback is claimed.

The prior offline HTML was recovered from its existing saved file after workspace maintenance and verified byte-identical: SHA256 `48995c6be430de900829034157ef86626413ff929d27dabee12a04c693985aae`, 8,739,723 bytes. Its source package SHA256 is `6368772a6c0360a94df743c768eceea238229fdff126f31081054fe5842f5a3b`. The actual reviewed model and scoped CSS are retained. Offline fictional fixtures, the read-only fetch adapter and review-only entrypoints are excluded from live routes.

## Change

- Add the reviewed Operations overview group at the start of Reports: requests/tasks/journeys/visits, selectable charts and record drilldown, definitions, column filters and chosen-column CSV. Metrics remain independent and unknown data remains unavailable. Existing reports and exports remain present.
- Live overview CSV requires a fresh authenticated, scoped snapshot and the same account/dataset throughout the request, with no cached fallback. Recompute the selected measure/chart/column filters over all matching rows; preserve Cairo date filtering and CSV protections.
- Reusable accessible show/hide control: native button, expanded state, stable body reference and visual arrow. Existing sections start open. The previously closed data-report group keeps its prior default. Body contents stay mounted using hidden/display rules, preserving child filters, selection and drafts while collapsed.
- Only non-sensitive booleans are stored per account/dataset/section in the existing local display-preference store; master categories have independent keys. No language, project or warehouse filter is baked into a section key.
- Dashboard: pipeline, attention, today routes, project health, monthly activity, Egypt network, current actions, status filters, project distribution, customer summary, current requests and recent events.
- Warehouse: current stock by unit, stock balances and posted movements.
- Other growing lists: master data, operational requests, My Tasks table, dispatch workload/assignment/route/task/custody tables, documents, exceptions/returns, report groups, audit, import batches and member directory.

Page navigation/filters, KPI tiles, request workflow/current-action forms, confirmation controls and backup/restore controls are not hidden behind new section controls. Original panel headers keep their existing actions. Scoped CSS preserves existing light/dark colors, Arabic direction, map image and row layouts; collapsed cards do not reserve old grid height.

## Preserved behavior and verification

No changes to backend routes, authentication, memberships/scopes, database schema/migrations, inventory calculations/posting, quantities, runtime bindings/configuration, audience or other Sites. The v8 startup lineage repair remains unchanged. Independent source review confirmed original operational callbacks are retained.

TypeScript, production build, 23 reviewed-model checks, 18 overview UI/fresh-export checks, existing Egypt and Command Center SSR checks passed. 37 visibility/accessibility SSR checks passed across Arabic/English, real dashboard/inventory panels, and the exact current-request/balance/movement JSX. Live browser checks are recorded at release completion. SSR tests are not browser interaction or real-device acceptance. The managed preview supervisor failed its health check and stopped; it was not replaced with another preview path.

## Rollback

Re-publish the exact saved v8 above on this same Site if the owner requests rollback. No operational records need reverting. The new local display preferences can remain harmlessly stored; v8 ignores them. Never change active datasets, reset storage, run migrations or widen permissions to undo a visual change.
