# New implementation decisions

These are new pilot choices, not claims about the original DAF Logistics implementation.

1. Separate Sites project and source repository; no Firebase configuration or original source reused. The GitHub installed-repository search for DAF returned no matching repositories.
2. Sites-managed D1/R2 and dispatch-owned ChatGPT sign-in, with no paid service activation.
3. The owner is pre-identified from Sites owner metadata, then bound to a stable site identity. First-visitor ownership and browser-supplied roles are rejected.
4. All active memberships share the active dataset. Owner/Manager/Contributor/Viewer roles plus operational functions control server actions. No per-project data isolation is claimed.
5. A whole-dataset optimistic revision is intentional for a small team pilot. This detects all write conflicts but increases retries when unrelated users edit concurrently.
6. Named domain tables retain validated JSON payloads. An entity registry and reference graph enforce durable identity, uniqueness and deletion dependencies at the database boundary.
7. Assignments serve as operational tasks. Routes group complete requests into ordered stops. Line reservations may be split among executors and warehouses; independent departure schedules for parts of one request are not implemented.
8. Polling runs every 20 seconds while the page is visible. This is not live push synchronization. Hosted two-account polling remains untested.
9. Uploaded shipping documents require an explicit operational verification. POD requires a real uploaded file and recipient. File safety includes bounded size, signature checking, private retrieval and attachment disposition; malware scanning is not implemented.
10. Backups preserve old datasets instead of destructive reset. Only the owner can reset/restore. Complete audit history is retained in backup; the UI shows the last 200 entries.
11. CSV uses comma delimiters. XLSX reads values from the first worksheet and rejects formulas. Import limits are 2,000 rows / 5 MB. Request imports currently use one line per imported request; multi-line requests are entered in the app.
12. Stock dashboards show current stock across all dates. Request counts honor the date/project filters. The marks and colors are a new text-based pilot identity, not authenticated original brand assets.

## CR-012 superseding source decisions
The numbered intake notes above are historical. Current source authority is `docs/project/`. In this continuation, worksheet choice replaces first-sheet-only UI; bound least-privilege invitations replace forwarded contributor links in CC; project/warehouse/courier scope is enforced; evidence is optional, and accepted uploads are PNG/JPEG/PDF. Updates by import change master names only. There was no new repository/site/database provisioning or hosted migration. Local HTML is review-only. Generalization/publication still needs the first-journey owner review and approved physical isolation, per the supplied October instructions.
