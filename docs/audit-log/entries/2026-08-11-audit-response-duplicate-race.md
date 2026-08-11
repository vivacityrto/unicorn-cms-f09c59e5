# Audit: 2026-08-11 — audit-response-duplicate-race

**Trigger:** drift-surfaced
**Scope:** Root-caused and fixed a data-integrity bug in the audit workspace's per-question save path (`client_audit_responses`) surfaced by a real bug report. Did not sweep other tables for the same check-then-write pattern this session — parked below as the next task.

## Findings
- Carl reported two symptoms on "Mock Audit — Melloz Services — 2026" (audit `e3340bd5-70e9-489e-988f-f6a8256e04d5`, tenant 7528): Sharwari's pasted auditor notes on Standard 1.2 appeared not to save, and clicking Compliant/At Risk on the same question appeared to do nothing — while the audit's overall progress/completion counters *did* increment.
- Root cause: `useAuditResponses`' `upsertResponse` mutation (`src/hooks/useAuditWorkspace.ts`) did a manual "check if a row exists via `.maybeSingle()`, then insert or update" instead of a real atomic upsert, and `client_audit_responses` had no unique constraint on `(audit_id, question_id)` to stop duplicates outright.
- Confirmed live: two near-simultaneous saves for Standard 1.2 (clause 1.2, question `a0025001-0000-0000-0006-000000000001`) landed 33ms apart at 04:42:50 UTC, both passing the "no existing row" check and both inserting. Once ≥2 rows existed for that question, every future `.maybeSingle()` check errored ("multiple rows returned") — an error the code never inspected (`const { data: existing } = await supabase...`) — so `existing` was always falsy from then on, and every subsequent note edit or rating click inserted yet another row instead of updating one. This snowballed to **63 duplicate rows for that single question** over a 15-minute working session, while every other question in the entire database had exactly one row (confirmed via a full `group by audit_id, question_id having count(*) > 1` sweep — this was the only affected pair system-wide).
- The UI symptom matched exactly: `responses.find(r => r.question_id === q.id)` picks an arbitrary/unordered duplicate (effectively the oldest, `rating: null`), so the QuestionCard never showed a selection no matter how many times Compliant was clicked — even though 16 separate `rating: compliant` rows were genuinely written. Notes appeared to "not save" for the same reason, including one directly-observed instance of the field flashing empty mid-session (04:57:25) from the autosave hook resyncing onto a different stale duplicate, immediately followed by the identical sentence being re-entered 5s later.
- Reconstructed the intended final answer from the row history (stable, unchanging text across two edits 65s apart, plus the last-ever action on the question): `rating: compliant, score: 2, notes: "Cited evidence of Industry consultation records and Industry support letters for each proposed scope item."` — verified with Carl before applying.

## KB changes shipped
- No changes.

## Code changes (if this entry accompanies one)
- `src/hooks/useAuditWorkspace.ts`: `upsertResponse` now does a single atomic `.upsert(row, { onConflict: 'audit_id,question_id' })` instead of the manual check-then-insert/update.
- `supabase/migrations/20260811051202_audit_response_dedupe_and_unique_constraint.sql`: (1) consolidates the 63 duplicate rows for the affected question into the single earliest row, stamped with the verified-correct final answer; (2) adds `client_audit_responses_audit_question_uniq UNIQUE (audit_id, question_id)`.
- Applied directly to production Supabase (`yxkgdalkbrriasiyyrwk`) via `apply_migration` (migration version `20260811051202`), then verified live: exactly one row remains for the affected question with the correct values, and the unique constraint is present in `pg_constraint`.

## Decisions
- Fixed via direct git hotfix per the repo's standing default (no Lovable prompt needed — code-only + a schema-additive migration, not a UI feature).
- Worked from a git worktree since another tool had uncommitted changes in the shared working directory at session start (unrelated file, left untouched).
- Consolidated onto the row with the *earliest* `id`/original insert rather than deleting-and-reinserting, to preserve the original `created_at`/audit trail as much as possible.

## Open questions parked
- Whether the same manual check-then-write pattern (and missing unique constraint) exists on sibling tables (`client_audit_findings`, `client_audit_actions`, `client_audit_documents`, the older `compliance_audit_responses`, etc.) — Carl asked for a follow-up sweep, tracked as the next session's work.
- The exact UI-level trigger for the original 33ms-apart double-write (flaky retry vs. duplicate tab vs. an autosave double-fire) was not identified — the fix removes the consequence regardless of cause, so this wasn't pursued further.

## Tag
audit-2026-08-11-audit-response-duplicate-race
