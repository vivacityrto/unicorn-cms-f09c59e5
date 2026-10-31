# Audit: 2026-10-31 — Rock notes CRUD extension

**Trigger:** implementation follow-up to complete create, read, update and delete for Rock Notes.
**Scope:** `supabase/migrations/20261031054829_rock_notes_crud.sql` and rollback, the Rock Notes hooks/panel, generated Supabase types, and focused regression coverage. This entry is a documentation draft on a separate docs-only branch; no code or migration has been committed or deployed.
**Status:** local only. The original Rock Notes migration remains applied to `unicorn-qa` and production. This CRUD migration was not applied through Supabase MCP or any other route.

## Change

- Adds nullable `edited_at`. Update permission is limited to `body`; the mutation trigger timestamps that edit and rejects changes to the original author, creation time, meeting, source, tenant, Rock, status or milestone snapshot.
- Adds authenticated update/delete grants with RLS requiring a current Vivacity staff role and either authorship or Super Admin status. Direct inserts remain disallowed; creation continues through `add_rock_note()`.
- Allows the existing meeting-deletion foreign-key action to clear `meeting_id`. A note deletion is permanent. The rollback restores the previous append-only trigger and drops `edited_at`; it cannot recover notes already deleted.
- Adds edit/delete controls to the Notes panel, with a confirmation before deletion. Edited notes show their edit timestamp. Changed/deleted notes make an existing summary appear stale.

## Verification and data scope

- Focused Rock Notes tests: 4 files passed, 39 tests passed.
- ESLint on the changed TypeScript files passed; `npm run typecheck` passed; `git diff --check` passed.
- Exact-snapshot Codex Security diff scan `fbe87b28-9b26-4113-b074-a3caddb2dee3` reviewed all 10 changed files at snapshot `codex-security-snapshot/v1:sha256:faa4978210c18fa7c6e7afc951b1d08fcc8e177ac375368bdeb0b019072fad15`; it reported zero findings. It was a source review only, not hosted-schema verification.
- Confirmed the connected development target by project metadata: `unicorn-qa`, ref `qfpxvumcrnzrjyvqkicq`. The SQL column inventory showed `edited_at` is not yet present. A read-only count at 31 Oct 2026 returned 0 Rocks, 0 active Rocks, 0 milestones, 0 notes and 0 Company-to-Individual milestone links. No Rock or note rows were changed; no reconciliation note was justified.
- No production project data was queried or changed. `supabase/config.toml` points at a different project ref; the CRUD migration was not linked or deployed.
- The new migration has static regression coverage but has not been applied to a database or verified with a live RLS behavior test. The UI has no real-data browser verification for this extension.

## Remaining release work

Open the required implementation review and migration release path, apply the migration to QA only after approval, verify role-bound create/read/update/delete behavior there, then follow the repository's separate production migration approval path. Confirm deployed frontend behavior after the applicable release. No commit or push was made for this task.
