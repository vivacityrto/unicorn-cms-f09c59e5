# Audit: 2026-11-03 — TAS intake tables and access rules (QA applied, production pending)

**Trigger:** ad-hoc (second schema step of the TAS intake workstream; see the [workstream plan](../../kb/reference/tas-intake/phase-1/tas-intake-plan.md))
**Scope:** the structure and access rules for the TAS intake: six tables, two helpers and five guard functions. No write functions and no data. Not covered: the write functions, the client portal, and the private seeding of question wording.

## Findings
- The tables follow the decisions recorded in the plan: one intake per qualification with an optional cohort label; RTO and CRICOS clients only (a GTO client cannot be stored); answers carry separate answer and review states plus an "applies" flag; no AI or legacy-import source; real question wording is private, so `tas_question` is created empty and seeded outside the repository.
- Erasure is an audited redaction, never a delete. A frozen answer can change in exactly one way, a redaction (the personal content becomes a marker, the original is cleared, who and when are stamped, nothing else changes), and the trigger writes the audit row itself, so a redaction cannot happen without one. A client can never redact.
- Reading: staff see everything; a full-scope, non-disabled member of the tenant sees their own intake, versions and answers; consultant decisions, the audit trail and the question wording are staff-only. anon sees nothing.
- Adjacent observation, not changed here: on production, tables created with Supabase's default privileges (for example the existing research and TAS-context tables) give `anon` and `authenticated` the full set of table privileges including TRUNCATE, with row-level security on. RLS covers row-level DML but not TRUNCATE; the REST API does not expose TRUNCATE, so this is reachable only through a direct database connection as those roles. The new tables revoke these explicitly.

## Code changes
- Migration `20261103050000_tas_intake_tables.sql` and its rollback. Applied to `unicorn-qa` (replacing the throwaway spike objects, which were dropped first). **Not applied to production**: that waits until the write functions are proven on QA, so the schema and its functions go together.
- `supabase/qa-checks/tas_intake_personas.sql`: a re-runnable, rolled-back persona and guard check for `unicorn-qa`.
- One reviewed, short-lived migration-safety allowlist entry (the flagged INSERT is the audit write inside the redaction guard).

## Verification
- `unicorn-qa`, rolled-back transactions only, no residue: staff, client of the tenant, client of another tenant, disabled client, academy-only client and anon reads; direct writes refused on all six tables; GTO refused; stage-versus-tenant mismatch refused; duplicate key refused and a second cohort label allowed; AI source refused; deletes refused; original answer never overwritten; frozen answers cannot be edited, added to or un-frozen; redaction allowed only as a pure redaction, audited, and refused for a client, with extra changes or with a wrong marker; redacted answers are final; review and audit tables are append-only. (One check in the script initially failed because of a script error on a table with no `id` column; it was fixed and re-run.)

## Decisions
- Production apply is deliberately held back: no consumer can write to the tables yet, and the next step may still adjust columns.

## Open questions parked
- Write functions (save, submit, return, review, redaction) and the content-hash algorithm (SHA-256, not MD5).
- The retention period before automatic redaction is for Vivacity's governing persons.
- The default-privilege grants noted above, across existing tables.
