# Audit: 2026-11-03 — TAS intake write functions (applied to QA and production)

**Trigger:** ad-hoc (third schema step of the TAS intake workstream; builds on [2026-11-03-tas-intake-tables](2026-11-03-tas-intake-tables.md))
**Scope:** the only supported way to write to the TAS intake tables: eight callable functions and four internal helpers. Not covered: the released client summary (the client confirm view), a server-side check that the starter questions are settled before submit, and any UI.

## Findings
- **Who can call what.** Client functions (`tas_client_save_answers`, `tas_client_submit`) refuse staff callers, which keeps the staff preview read-only, and require a full-scope, non-disabled member of the intake's tenant. Staff functions (`tas_start_intake`, `tas_staff_save_answers`, `tas_staff_submit`, `tas_staff_review_answer`, `tas_staff_return_for_edit`, `tas_staff_redact_answer`) refuse everyone else. An unknown intake and another tenant's intake give the same "Not found", so existence is not revealed. anon cannot call any of them.
- **Concurrency and submission.** A save, submit or return takes the intake's expected `row_version`; a stale one raises SQLSTATE 40001 and changes nothing. Submit is idempotent on its key and freezes the draft version with a SHA-256 content hash.
- **Corrections without editing history.** A submitted version is never edited. Returning an intake for edit creates the next version by copying the answers (the lineage is kept in `previous_answer_id`, an answer the consultant returned starts as `returned`, and the original client statement is preserved).
- **Erasure covers every version.** Redaction clears a question's answer across all versions of the intake, so a copy made by a return cannot keep content an erasure request removed. The redaction guard from the tables migration writes the audit row.
- **Audit without content.** Every change writes its audit row in the same transaction. Audit rows record what changed and who changed it, not the answer content (checked: no audit row carries a saved answer's text).

## Code changes
- Migration `20261103060000_tas_intake_functions.sql` and its rollback. Applied to `unicorn-qa`, then to production on 2026-11-03 as version `20261103042354` (after the tables migration, `20261103042254`).
- `supabase/qa-checks/tas_intake_functions.sql`: a re-runnable, rolled-back flow and persona check for `unicorn-qa`.
- One reviewed, short-lived migration-safety allowlist entry (14 flagged statements, all inside the function bodies).

## Verification
- `unicorn-qa`, rolled-back transactions only, no residue. Covered: staff start; a GTO client refused; staff and client source-type rules; a client refused on staff functions and staff refused on client functions; stale saves; other-tenant, unknown, disabled and anon callers; idempotent submit with a 64-character hash; save and second submit refused after submit; review by staff only with a reason and a valid decision; stale return refused; copy-on-return with lineage and a returned answer; resubmission with a different hash and the original client statement preserved; redaction refused for a client, blank reasons refused, two versions redacted, nothing left holding the original; the audit action counts; and a staff-run intake with a second cohort and an unknown source date kept as NULL. (One check initially failed because the test built its values as quoted strings; the script was fixed and the step re-run.)

## Production verification
- Read-only postflight: 13 functions, one overload each, all SECURITY DEFINER; the four internal helpers are executable only by `postgres` and `service_role`; the eight public functions are executable by `authenticated` (plus `postgres` and `service_role`) and not by `anon` or PUBLIC.
- A rolled-back smoke test on production, writing only to the new empty tables (0 rows afterwards): staff start; a staff caller refused on a client function; a client save then a stale save refused (40001); a client reads only their own intake and nothing from the audit, review or question tables; a client's direct insert refused; submit with a 64-character hash; an anon call refused; review, return for edit (version 2 copied) and redaction across both versions; and no audit row carrying answer content. The first run's cross-tenant check appeared to fail because the two test personas turned out to be the same person, a client with full-scope membership in two tenants; with a client who has no membership in the first tenant the check passed (same error as for an unknown intake, and nothing readable).

## Decisions
- Review decisions live in the append-only review table and are applied to the next version on return, because a frozen answer cannot be updated.

## Open questions parked
- The released client summary, and a server-side check that the five starter topics are settled before submit (the engine checks it in code today).
- The `edit` review decision records the consultant's decision and reason; the corrected value is entered on the next version by the consultant.
- Seeding `tas_question` privately once the content owner approves the wording (production tables are empty until then), and the retention period for Vivacity's governing persons.
