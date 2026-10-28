# Audit: 2026-10-28 — Rock notes

**Trigger:** feature work (Carl's request for notes on the Discuss slide, kept for every L10 and rolled up to the Company Rock, with an AI summary and optional To-Dos)
**Scope:** one migration (`20261028120000_rock_notes.sql`): two tables, one function, one trigger function and trigger, and a replaced `rock_delete_blockers()`; one new Edge Function (`summarise-rock-notes`); the screens that use them. Design: [rock-notes.md](../../kb/codebase-state/rock-notes.md).
**Status: applied to `unicorn-qa` (version `20261028203713`) and to production (`yxkgdalkbrriasiyyrwk`), both on 29 Oct 2026 on Carl's instruction, and verified. The Edge Function is NOT deployed until the PR merges.** Before that it was run only in a rolled-back transaction.

## What the migration does
- **Adds** `eos_rock_notes` (append-only notes with a status and progress snapshot) and `eos_rock_note_summaries` (AI summaries as history), both with row level security: select only for `authenticated`, behind the same policy tests as the other Rock tables; no write grants.
- **Adds** `add_rock_note()`: `SECURITY DEFINER`, empty `search_path`, `is_vivacity_team_safe(auth.uid())` checked first, not callable by `anon`. It reads the Rock's status and milestone counts itself and records the caller as author.
- **Adds** an append-only trigger that refuses every update and delete, except a deleted meeting clearing `meeting_id`.
- **Replaces** `rock_delete_blockers()` to add `notes` (a Rock with notes is archived, not deleted); every earlier reason is kept.
- **Changes no existing row.**

## Security review of the diff
- Writes: only `add_rock_note()` (staff) for notes; the summaries table is written only by the Edge Function with the service role. Clients cannot insert, update or delete either table.
- The Edge Function (`staff.ai.use` through `requireCaller`, before reading the body, the database or calling the AI) takes one caller input, a validated Rock id; everything the model sees is read server-side. It makes one outbound call (the fixed AI gateway), writes only one `insert` (the validated summary) and creates no To-Dos. Model output is validated before it is stored. Source-level test: `supabase/functions/summarise-rock-notes/auth-gate.test.mjs`.
- Prompt-injection: notes are people's text, passed as quoted data with whitespace flattened and `<` neutralised, and the model is told to treat them as data. The only thing an injected note could change is the wording of a stored summary and the text of up to three suggested To-Dos a person must still choose to create.
- Tenant isolation: notes carry the Rock's `tenant_id` (set by the function, not the caller); reads use the existing Rock policy tests.
- Not reviewed by the security-diff-scan skill; a human reviewer should look at the Edge Function and `add_rock_note()`.

## Verification (unicorn-qa, `qfpxvumcrnzrjyvqkicq`; one rolled-back run, nothing persisted)
Fixtures (a Rock with three milestones, an archived Rock, a meeting, lookup rows QA lacks) were created inside the transaction. Results: note saved with trimmed text, status `at_risk`, progress 1 of 2 (the deferred milestone is not counted), source `dictated`, meeting set, author is the caller; an identical note within 30 seconds returns the first (one row); different text adds a second; blank, over 4000 characters, a bad source, an archived Rock, an unknown Rock and an unknown meeting are each refused; a non-staff caller is refused; update and delete are refused; deleting the meeting keeps the note and clears the link; `rock_delete_blockers` answers `{milestone_progress, notes}` and the Rock cannot be deleted; `authenticated` holds only `SELECT` on both tables (none for `anon`); a summary row is accepted and an invalid status signal refused. The rollback script was reviewed but not executed (no object exists to roll back); its ordering is covered by a static test.
- **Frontend:** unit tests (helpers, the microphone controller across Rock changes, the panel); a browser walk with faked data confirmed one live microphone session across a Rock change, the Rock left saved, new speech on the new Rock, and Stop ending the session.
- **Not covered:** a browser session on real data; real Chrome/Edge speech recognition; the AI summary's quality on real notes; the repository's live tenant-isolation suite.

## Applied to unicorn-qa (29 Oct 2026) and verified
Applied through the Supabase MCP as version `20261028203713`. Checked afterwards: both tables exist with row level security on and one select policy each; `authenticated` holds `SELECT` only on both and `anon` and `PUBLIC` hold nothing; the append-only trigger is present on `eos_rock_notes`; `add_rock_note` is `SECURITY DEFINER` with an empty `search_path`, executable by `authenticated` and not by `anon`; the trigger function and `rock_delete_blockers` are executable by neither; the delete guard body contains `notes`. QA has no Rock data (0 Rocks), and both new tables are empty. No browser check of the screens against QA was done.

## Applied to production (29 Oct 2026) and verified
Applied through the Supabase MCP. Before: none of the new objects existed; every prerequisite function (5 of 5) and table (8 of 8) was present; `rock_delete_blockers` had the `carryover` reason and not `notes`. After: the same structure, grants, policies, trigger and function checks as QA, all passing (both tables with row level security, one select policy each, `authenticated` holds `SELECT` only and `anon`/`PUBLIC` nothing; append-only trigger present; `add_rock_note` `SECURITY DEFINER` with an empty `search_path`, executable by `authenticated` and not `anon`; the other two functions executable by neither; one overload each; the delete guard contains `notes` and `carryover`). **Data unchanged:** 163 Rocks and 523 milestones as before; both new tables empty. The security advisor lists only the expected note that `add_rock_note` is executable by `authenticated` (intended: it checks staff access first, like the other staff RPCs); nothing else mentions the new objects.

**Until the frontend and Edge Function deploy (on merge):** the deployed frontend does not call the new objects, so nothing changes for users. The one visible effect is that a Rock with notes cannot be deleted, and no Rock has notes yet.

## Human actions still needed
1. Review and approve the PR. Both databases are done.
2. Merge deploys the Edge Function through CI; confirm `LOVABLE_API_KEY` is set in the target project (the existing AI functions use it).
3. Confirm the frontend deploy is live after merge. Rollback file: `supabase/migrations/rollback/20261028120000_rock_notes.down.sql` (discards all notes and summaries).
