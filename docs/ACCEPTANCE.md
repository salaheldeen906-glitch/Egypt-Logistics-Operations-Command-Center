# Acceptance evidence

Status at checkpoint CP-01, 2026-09-23. No Production-Ready claim.

## Automated checks

- TypeScript typecheck: PASS.
- Domain scenarios: 30 PASS / 0 FAIL.
- Compiled Worker + D1 + R2 integration scenarios: 26 PASS / 0 FAIL.
- Real CSV file/parser scenarios: 3 PASS / 0 FAIL; Arabic UTF-8, 250 rows including last row, quoted fields and duplicate headings.
- Build: PASS.

The integration suite uses isolated local D1/R2 with simulated platform identity headers. It tests actual API handlers and persistence, not real ChatGPT sessions.

| Criterion | Evidence | Status |
|---|---|---|
| A. One participant creates, another sees | Actual API reads/writes with two simulated identities | PASS locally; real accounts NOT TESTED |
| B. Records and attachment persistence | Independent requests retrieve D1 rows and R2 bytes | PASS locally; hosted browser restart NOT TESTED |
| C. Different devices share dataset | Server dataset architecture; no second physical device | NOT TESTED |
| D. Contributor writes operational records | Contributor-created record read by owner | PASS locally |
| E. Self-elevation and forbidden actions | Anonymous denial, first-visitor denial, contributor role mutation denial, viewer denial | PASS locally |
| F. Concurrent edits | Stale dataset revision returns 409 | PASS locally |
| G. Repeated save/issue | Same operation replay, forbidden repeat issue, unchanged movement count, reset retry | PASS locally |
| H. Last-stock concurrent reservations | Two API promises, one commit and one conflict; held stock never exceeds 120 | PASS locally |
| I. Expiry and non-expiry | FEFO, <=90 approval cap, expired denial, untraced opening block, non-expiry path | PASS domain tests |
| J. Multi-line request to POD/close | Domain multi-line flow and compiled API single-line complete route | PASS locally; browser end-to-end NOT TESTED |
| K. Import/undo/backups | 250-row transaction, undo, dependent deletion denial, full backup, restore new IDs/R2 keys, reset | PASS locally |
| L. Arabic/English/mobile | Live browser visual QA, RTL/LTR, request drawer; 390px iframe viewport with no document overflow | PASS layout with read-only fixtures; full mobile write flow NOT TESTED |
| M. Intended-audience share link | No audience widening authorized; no two real accounts | BLOCKED pending access approval and real-account test |

## Browser evidence

The permitted internal preview was used. The desktop dashboard and mobile viewport were rendered with a clearly labelled, read-only UI fixture. Temporary QA routes were removed before final delivery. These screenshots do not prove server authentication or multi-user acceptance.

- Language change updates text and direction.
- Arabic desktop document width <= viewport; no whole-page horizontal overflow.
- 390px mobile CSS viewport document width 373px with vertical scrollbar; no whole-page horizontal overflow.
- Request drawer opens, shows both product lines and dismisses.
- CSV file chooser parses the actual `customers_250_TEST_ONLY.csv` and displays 250 rows with column mapping.
- Protected main application shows the sign-in state without identity.
- WebMCP navigation was implemented with feature detection. The browser reported `modelContext` unavailable, so WebMCP execution validation is NOT TESTED.
- XLSX reader is implemented but has not been validated in a live browser with an actual Excel workbook.

## Remaining limits

This is a private pilot candidate, not completed shared-team acceptance. Real owner login, two real participants, cross-device persistence, hosted permission enforcement, full browser write flow and share link acceptance remain NOT TESTED. The owner must approve any expanded Sites audience before team testing.

Pilot limits: full state snapshot reads, global revision contention, client table pagination, 2,000 import rows, 5 MB files and 20 MB backup attachment bytes. No sustained-load benchmark, malware scanner or independent security audit. Independent multi-route schedules for portions of a request and multi-line request import are not implemented. No original-code parity claim.

## Two-person test after access approval

1. Owner signs in, loads fictional sample data, grants site visit access to two named testers, then creates an app invitation.
2. Tester A signs in, joins as Contributor and creates a two-line request. Tester B signs in independently, joins, waits up to 20 seconds and sees it.
3. A and B edit the same revision; one must receive a conflict. B proceeds through review, reservation, assignment, documents and a route.
4. Record pickup/load, departure, arrival, partial delivery, remaining delivery/return, POD and closure.
5. Close both browsers and reopen; verify request, inventory and attachment downloads. Repeat on another device.
6. Owner assigns Viewer to one tester and verifies API writes fail. Revoke the invitation and verify a new tester cannot join. Record results before any readiness claim.
