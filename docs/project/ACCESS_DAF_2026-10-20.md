# ACCESS-DAF — isolated change review

Status: REVIEW_COMPLETED; OWNER_AUTHORIZED_RELEASE. The owner subsequently approved deployment to the existing live URL. The local-only and future-release statements below describe the completed review stage; RELEASE_ACCESS_DAF_2026-10-20.md records the release authority, actual checkpoint and remaining verification limits.

## Verified current baseline
- Existing selected Site: appgprj_6ace37bed1fc8191af88d9705def4ba7.
- Latest saved version: v9; commit cfea369cc7c2a24a48dd4059190455d1fc5b86e4.
- Existing deployment: appgdep_6ad6645827c08191aee857ded3f060ab.
- Current maintained source verified; this is not a claim of recovering the unavailable historical release.
- Read-only Sites metadata identifies current account as Site owner. Runtime technical ownership must still resolve from existing settings.owner_id, never a display role.
- Work branch: work/access-daf-20261020. Original checkout remained clean before work.
- Local rollback source bundle preserved separately; no hosted records, files, settings, accounts or passwords copied or changed.

## Authority and scope
User attachment: نص Markdown ملصق(4).md, uploaded20October2026. Latest explicit request permits login/access changes only and requires isolated preview before production. This supersedes older no-auth-change constraints only for this scoped change. Older Team Pilot target and historical release instructions remain historical.

## Stable requirements
- ACCESS-DAF-001: preserve existing identity, roles, operations, branding and data; feature-gated additive extension.
- ACCESS-DAF-002: technical owner anchored in trusted existing owner_id; separate bounded client administrator.
- ACCESS-DAF-003: persistent username/password login alongside existing ChatGPT login, slow salted password hashing, server sessions, generic failures, logout and revocation.
- ACCESS-DAF-004: explicit single-organization grant, start/end/unlimited, account vs organization suspension, no automatic extension or stock effects.
- ACCESS-DAF-005: stable permission registry, unchanged role defaults, account default/allow/deny, deny dominance, screen dependencies, delegation ceiling.
- ACCESS-DAF-006: existing project/warehouse/resource scope intersection on server; no replacement projects or operational seeds.
- ACCESS-DAF-007: compact scoped account UI, password replacement only, one-time new credentials, reasons, dirty edit recovery, AR/EN.
- ACCESS-DAF-008: permission recheck on each request and atomic write, stale response protection, safe audit without secrets.
- ACCESS-DAF-009: isolated functional/security/regression tests with honest coverage and data-safe rollback.

## Backup limits / release gate
Source rollback is available. No authenticated hosted full-data backup has been obtained in this task. Existing /api/backup requires the actual application owner's identity, creates a stored backup, has a20MiB attachment cap, and excludes auth credentials/invitation secrets. It also predates the proposed access tables, so it is NOT a complete access-system backup. Before any future production migration, obtain a consistent provider D1 export +R2 object inventory/bytes +nonsecret configuration and protected secret-reprovisioning procedure. Do not put passwords/session tokens in user-facing archives. No production schema migration is allowed in this review.

## Planned affected areas
New access policy/auth/store and additive migration, new access APIs/components, existing central actor/authorization/scope and related file/export/draft entrypoints, navigation integration, tests and this change record. Existing operational calculation/execution remains authoritative.

## Verified implementation and limits
- Additive schema6tables; no source migration enrolls users or seeds operational records.
- Existing87distinct execution command names all mapped to permission keys;42policy checks passed, including original role/function parity.
- Final93disposable Worker/D1/R2 acceptance checks passed, including managed username/password sessions,4explicit local project fixtures (not production), independent keeper/courier execution, R2 proofs, partial returns, scoped export/file reads and operational backup/recovery.
- Existing domain, navigation, UI SSR and scoped API regression suites passed; exact commands and separate counts are retained in the review report. Successful SSR is not a browser/device test.
- Desktop browser checked AR/RTL, EN/LTR, light/dark, native disclosure/dialog, Escape/focus return, dirty-edit confirmation and page overflow. Its private QA proxy simulated a trusted owner in disposable resources. No real owner session or password browser flow was verified there.
- HTTPS local preview launcher prepared twice successfully, preserving its local owner/dataset and creating0projects/stock. User selects their own local credentials; no fixed public account.
- Real hosted authentication/ownership, real mobile/device, screen reader and late-network-response interception remain NOT_RUN. Source guards reject stale context and atomic writes, but this is not a claim of all race behavior tested in a browser.
- Existing legacy ChatGPT identities remain unchanged until explicit enrollment; enrolled nonowner accounts require password-session proof. Platform-owner ChatGPT sign-in remains independent recovery. The app does not revoke ChatGPT platform-wide sessions.
- Overview CSV and detailed JSON now recheck export authority using /api/access/export-state; hidden/forbidden export data are not obtained from an unguarded refresh callback.
- Recovery retains stable grant identity/root lineage and remaps only exact known scope IDs. Unmatched old IDs become denied scope and an owner-only review warning, never a name-based grant.
- Existing invitations remain available to the original owner; client administration uses the scoped new API and cannot call legacy owner membership/invitation services.

## Safe rollback
Before publishing, secure a consistent actual D1/R2/configuration backup; no such live backup was obtained here. Local rollback now only means stop the review process; production remainsv9unchanged. Baseline source is cfea369cc7c2a24a48dd4059190455d1fc5b86e4 and its savedv9archive hash is sha256:af5f94e5c16fc512d138097a9fdd76881f5445e7679b7eac8f4a0552a85d8c57.

After future real grants/accounts exist, blindly disabling the feature or deploying oldv9would remove expiry/override/session checks and is NOT a safe access rollback. Preserve the new server access enforcement and roll forward with a reviewed fix or a compatible UI revision. If an emergency must remove enforcement, first enter an owner-approved maintenance/restricted-access state and separately review memberships; no automatic script here changes live access. Do not drop access tables or restore an old database over newer records. Keep newer operations/attachments and compare before any selective data restore.
