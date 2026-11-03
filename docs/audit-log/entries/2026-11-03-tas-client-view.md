# Audit: 2026-11-03 — TAS client confirm view (applied to QA and production)

**Trigger:** ad-hoc (fourth step of the TAS intake workstream; builds on [2026-11-03-tas-intake-functions](2026-11-03-tas-intake-functions.md))
**Scope:** the release step, the client's read-only summary, confirm and flag, and the client page that uses them. Not covered: a server-side check that the five starter topics are settled before submit, any staff screen, seeding `tas_question` (the tables are empty until the content owner approves the wording), and navigation to the page (it is reachable by link only).

## Findings
- **A client sees nothing until a consultant releases the intake.** The three client read policies now require `released_at`, and every client function answers "Not found" for an unreleased intake, the same as for an unknown or another tenant's intake, so existence is not revealed. Release is a staff-only function, audited, idempotent, and takes the expected `row_version`.
- **The client summary carries only what the client needs.** Question wording, the answer (or "removed" with no value if redacted), where it came from, and its confirm / flag / returned state. It never carries consultant decisions, reasons, notes, research or the audit trail (checked: an internal return reason and the source reference never appear).
- **Confirm and flag.** A client confirms or flags each answer on the draft version; a flagged answer keeps its value and moves to needs advice for the consultant. Stale row versions are refused (SQLSTATE 40001); a removed answer cannot be confirmed; staff are refused (the preview stays read-only). The audit row records counts, not content.
- **Submit now requires every applicable answer to be confirmed or flagged**, for a client; a staff submit is unchanged.

## Code changes
- Migration `20261103070000_tas_client_view.sql` and its rollback. Applied to `unicorn-qa`, then to production on 2026-11-03 as version `20261103043744`. Adds `tas_intake.released_at` / `released_by`, two release helpers, three replaced read policies, replaced `tas__authorise` and `tas__submit`, and three functions: `tas_staff_release_to_client`, `tas_client_get_summary`, `tas_client_confirm_answers`.
- `supabase/qa-checks/tas_client_view.sql`: a re-runnable, rolled-back persona check for `unicorn-qa`.
- Frontend: `src/pages/client/TasIntakePage.tsx`, `src/hooks/useTasClientSummary.ts` (one typed adapter over the untyped RPC calls until Supabase types are regenerated), a lazy child route `/client/tas/:intakeId`, and ten component tests.
- Four reviewed, short-lived migration-safety allowlist entries (two for the fix migration) (the flagged UPDATEs are all inside function bodies).

## Verification
- `unicorn-qa`, rolled-back transactions, no residue: about 40 checks covering the release gate, summary contents, confirm / flag, the submit rule, staff refused on client functions, and other-tenant, disabled, academy-only and anon callers refused.
- Production, read-only postflight: one overload each, all SECURITY DEFINER with an empty search path; the new public functions are executable by `authenticated` and not by `anon` or PUBLIC; the internal helpers stay closed; the three read policies require release; both tables still empty.
- Production, rolled-back smoke test (writes only to the new empty tables, 0 rows afterwards; the disabled-user and academy-only checks were left out of the production run because they would touch real user rows, and were proven on QA): staff refused on the client summary; an unreleased intake invisible and "Not found"; a client cannot release; stale release 40001; release audited once; a released intake readable by its own client only; other tenant and unknown intake give the same error; anon refused; submit before confirming refused; confirm and flag counts 2/1; staff refused on confirm; submit works and confirm after submit is refused; after a return the internal reason never appears, the returned flag does, a redacted answer comes back removed with no value, and confirming it is refused.
- Frontend: typecheck clean, 1563 frontend tests and 495 edge tests pass, build passes, lint ratchet clean.

## Review follow-up (same day)
Three inline review findings on PR 1501 were checked against the code and all confirmed; none had surfaced in the first QA run (which redacted only after submit and never re-checked a returned answer).
- **Removed answer blocked submit.** An answer redacted before the client confirmed it still counted as unchecked, and the client cannot confirm a removed answer, so submit could never succeed. Fixed.
- **Returned answer still counted as confirmed.** The copy made on return keeps the earlier confirmation, so a returned answer let the client resubmit without looking at it again. A returned answer now counts as neither confirmed nor flagged until the client decides again, in the summary and in the submit check. Fixed.
- **Frontend lost errors.** A failed confirm or submit had its error cleared when the reload succeeded; the error is now set after the reload. Fixed, with a test.
- Migration `20261103080000_tas_client_view_fixes.sql` (function bodies only) and its rollback, applied to `unicorn-qa` and then to production as version `20261103044452`; `supabase/qa-checks/tas_client_view_fixes.sql` reproduces both scenarios. Both passed on QA and in a rolled-back production smoke test (0 rows afterwards); postflight showed one overload each and unchanged grants. The original `tas_client_view.sql` check script was not re-run after the fix; the new script covers confirm, submit, return and resubmit.

## Open questions parked
- Live browser check of the page against a real released intake (nothing exists to release on production yet; needs seeded questions).
- Server-side starter-settled check on submit, and regenerated Supabase types to remove the adapter.
