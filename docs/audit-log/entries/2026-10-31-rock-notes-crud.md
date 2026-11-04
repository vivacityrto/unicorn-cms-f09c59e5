# Audit: 2026-10-31 — Rock notes CRUD extension

**Trigger:** implementation follow-up to complete create, read, update and delete for Rock Notes.
**Scope:** `supabase/migrations/20261031054829_rock_notes_crud.sql` and rollback, the Rock Notes hooks/panel, generated Supabase types, migration safety scanner and regression coverage. The implementation merged in PR #1485 at `56c66f63c1a8ccd91e5d0588e442fe8adfcdeb4f`; this audit entry was reconciled in a follow-up docs-only PR.
**Status:** implementation is merged. The CRUD migration was applied to `unicorn-qa` only on 4 Nov 2026 as Supabase MCP migration version `20261104111217`. A bounded live role-bound API/RLS canary passed in workflow run `41826004066` using the protected QA persona workflow (harness change in draft PR #1503); the Notes panel UI remains unverified. The original Rock Notes migration remains applied to `unicorn-qa` and production. Production was not queried or changed for this QA follow-up.

## Change

- Adds nullable `edited_at`. Update permission is limited to `body`; the mutation trigger timestamps that edit and rejects changes to the original author, creation time, meeting, source, tenant, Rock, status or milestone snapshot.
- Adds authenticated update/delete grants with RLS requiring a current Vivacity staff role and either authorship or Super Admin status. Direct inserts remain disallowed; creation continues through `add_rock_note()`.
- Allows the existing meeting-deletion foreign-key action to clear `meeting_id`. A note deletion is permanent. The rollback restores the previous append-only trigger and drops `edited_at`; it cannot recover notes already deleted.
- Adds edit/delete controls to the Notes panel, with a confirmation before deletion. Edited notes show their edit timestamp. Changed/deleted notes make an existing summary appear stale.
- Refreshing an existing summary now bypasses the Edge Function's cached-summary response, so edits and deletions can be summarized. Staleness detection accounts for the summarizer's 200-note input cap and the panel's 300-note display limit.
- Removes six expired migration-safety allowlist entries and bounds trigger-event masking to one SQL statement. A regression test confirms trigger-like text cannot hide actual migration-time DML.

## Verification and data scope

- Focused Rock Notes tests: 25 passed; full frontend suite: 1,549 passed and 43 skipped; Edge suite: 483 passed.
- `npm run lint:ratchet`, `npm run typecheck`, ESLint on changed TypeScript files, and `git diff --check` passed. GitHub lint, TypeScript, migration safety, Edge auth guardrail, email URL guard, and Vercel checks all passed.
- `node --test scripts/audit-migrations.test.mjs`: 7 passed. `node scripts/audit-migrations.mjs --changed-only --base-ref origin/main`: two changed migrations, zero findings.
- Exact final-head Codex Security diff scan `efa510ed-7583-4b43-b987-2b2a89b8a1a5` reviewed the implementation through commit `0f99e6395eb5d2c76320c39772a598ef8458bd9a` and reported zero findings. It was a source review only, not hosted-schema verification.
- The migration-safety failure was resolved in PR #1485: six expired entries were removed and the trigger-event scanner was corrected and regression-tested. The final migration safety workflow passed.
- Confirmed the connected development target by project metadata: `unicorn-qa`, ref `qfpxvumcrnzrjyvqkicq`. The SQL column inventory showed `edited_at` is not yet present. A read-only count at 31 Oct 2026 returned 0 Rocks, 0 active Rocks, 0 milestones, 0 notes and 0 Company-to-Individual milestone links. No Rock or note rows were changed; no reconciliation note was justified.
- No production project data was queried or changed. `supabase/config.toml` points at a different project ref; the CRUD migration was not linked or deployed.
- QA target verified as `unicorn-qa`, project ref `qfpxvumcrnzrjyvqkicq` (distinct from production ref `yxkgdalkbrriasiyyrwk`). The source migration `supabase/migrations/20261031054829_rock_notes_crud.sql` was applied through Supabase MCP on 4 Nov 2026; MCP recorded version `20261104111217`.
- Postflight confirmed `edited_at`, RLS enabled, the CRUD guard trigger, staff-author/Super Admin update/delete policies, and authenticated `UPDATE(body)`/`DELETE` grants without an INSERT grant; `created_by` remained non-updatable. QA still has zero Rock Notes; its preflight Rock/milestone counts were zero, and the notes count/fingerprint remained unchanged after migration. No note or Rock rows were added, updated, or deleted.
- On 4 Nov 2026, protected workflow run `41826004066` verified live CRUD RLS behavior against the allowlisted `unicorn-qa` ref `qfpxvumcrnzrjyvqkicq` using existing Super Admin, Team Member author and Integrator non-author sessions. It created one `[QA TEST ONLY]` Company Rock and two run-scoped notes in `qa-e2e-demo-tenant` (tenant 20); verified the author could edit/delete, the non-author's edit/delete were hidden by RLS, and Super Admin could edit/delete while preserving the original author; then removed only that run's synthetic Rock and notes through the authenticated Super Admin session. An independent read-only postflight found zero matching Rock/note rows and confirmed the two durable `created`/`deleted` Rock events remained. The QA baseline validator, three local harness contract tests and persona login steps passed; no service-role key or seed/reset job was used.
- The first canary attempt (`41825496494`) cleaned its synthetic Rock and notes but returned a harness postflight error because it sorted `eos_rock_events` by nonexistent `created_at` rather than `occurred_at`. A read-only postflight confirmed the fixture rows were absent and its two audit events remained. The query was corrected before the passing retry; the two attempts left four durable Rock events total. Neither attempt queried or changed production.
- Live role-bound API/RLS behavior is now verified by the protected canary described above. The local Windows Vitest runner still cannot load the native SWC module under this sandbox (`spawn EPERM`); hosted verification ran on the protected Ubuntu workflow instead.
- The canary exercised authenticated PostgREST/RPC behavior after real persona logins; it did not exercise the Notes panel's rendered edit/delete controls. Browser-panel behavior remains unverified. No impersonation, credential creation, existing-note modification or existing-data deletion was used.
- No production Supabase project was queried or changed.

## Remaining release work

The remaining QA work is to add browser coverage for the Notes panel's rendered behavior if required. The live role-bound API/RLS canary is available in draft PR #1503 and its successful run is recorded above. Production remains unchanged; any production application requires its separate migration approval path. The implementation is merged and the CRUD migration is applied to QA only.
