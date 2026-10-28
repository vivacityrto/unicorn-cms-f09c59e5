# Audit: 2026-10-29 — To-Dos linked to Rocks and milestones

**Trigger:** feature work (Carl: the milestone Tasks box must work for Rocks not tracked in GitHub, and a To-Do, including a standalone one, must be able to link to a Rock from its own side)
**Scope:** one migration (`20261029030000_rock_todo_links.sql`): one table, one validation trigger, three functions; the screens that use them. Design: [rock-todo-links.md](../../kb/codebase-state/rock-todo-links.md).
**Status: applied to `unicorn-qa` (version `20261028234756`) on 29 Oct 2026 on Carl's instruction, and verified. NOT applied to production.** Before that it was run only in a rolled-back transaction. Production is a separate step that needs Carl's instruction.

## What the migration does
- **Adds** `eos_rock_todo_links` (one link per To-Do at most, to a Rock and optionally one of its milestones), with row level security (select only for `authenticated`, behind the same policy tests as the other Rock tables) and no write grants.
- **Adds** a validation trigger (the milestone must belong to the Rock; the link carries the Rock's tenant) so the rules hold for any writer.
- **Adds** `add_rock_todo()`, `link_todo_to_rock()`, `unlink_todo_from_rock()`: staff only (checked before any write), `SECURITY DEFINER`, empty `search_path`, not executable by `anon`.
- **Changes no existing row.** No To-Do, Rock or milestone is touched. Unlinking deletes only the link row.

## Security review of the diff
- Writes only through the three functions; clients have `SELECT` only. Every function checks `is_vivacity_team_safe(auth.uid())` first; an owner other than the caller must also be an active team member.
- Identifiers from callers (Rock, milestone, To-Do, meeting) are validated server-side: the Rock must exist and not be archived, the milestone must belong to that Rock, the meeting must exist.
- Tenant: the link always carries the Rock's tenant (checked by trigger). A To-Do made in a meeting takes the meeting's tenant, as the meeting's other To-Dos do; reading the link follows the Rock's rules, reading the To-Do follows the To-Do's own (existing) policies.
- **Pre-existing, not changed here:** `anon` holds table-wide `INSERT/UPDATE/DELETE/SELECT` grants on `public.eos_todos`, with row level security as the only guard (policies require EOS roles or staff). That predates this change and is worth a separate hardening review (revoke `anon` writes, as was done for the other EOS tables).
- Not reviewed by the security-diff-scan skill (not available in this session); a human reviewer should read the three functions.

## Verification (unicorn-qa, `qfpxvumcrnzrjyvqkicq`; one rolled-back run, nothing persisted)
Fixtures (Rocks, milestones, a meeting, lookup rows QA lacks) were created inside the transaction. Results: a milestone To-Do is created Open, owned by the caller, due in 7 days, in the right tenant, with the description naming the milestone and Rock; the same title within 30 seconds returns the first (one link); a Rock-level To-Do inside a meeting takes the meeting and the given date; blank, over 300 characters, an archived Rock, an unknown Rock, another Rock's milestone, a non-staff owner and an unknown meeting are each refused; a standalone To-Do is linked, then moved to a milestone of another Rock (same link row, one row), and a mismatched milestone, an unknown To-Do and an archived Rock are refused; unlink removes the link and keeps the To-Do, and a second unlink is refused; the trigger refuses a direct mismatched milestone and a wrong tenant; a non-staff caller is refused by all three functions; deleting a To-Do, a milestone or a Rock removes the link and keeps the To-Do; `authenticated` holds only `SELECT` on the table, `anon` nothing, and the functions are executable by `authenticated` only.
- **Frontend:** unit tests (helpers, the list, the To-Do-side control, Discuss flag and deck, metrics) and a browser walk of the new components with faked data, which found and fixed a real layout bug (a long To-Do title broke into one letter per line at narrow width).
- **Not covered:** the full panel on real data; the repository's live tenant-isolation suite; the security-diff-scan skill.

## Applied to unicorn-qa (29 Oct 2026) and verified
Applied through the Supabase MCP as version `20261028234756`. Before: none of the new objects existed and every prerequisite function (4 of 4) and table (4 of 4) was present. After: `eos_rock_todo_links` exists with row level security on and one select policy; `authenticated` holds `SELECT` only and `anon`/`PUBLIC` nothing; the validation trigger is present; one unique constraint (one link per To-Do); the three functions are `SECURITY DEFINER` with an empty `search_path`, executable by `authenticated` and not `anon`, one overload each; the trigger function is executable by neither. QA has no data (0 Rocks, 0 To-Dos) and none was written; the new table is empty. No browser check of the screens against QA was done.

## Human actions still needed
1. Review and approve; QA is done. Apply to production (Supabase MCP, not CI), then merge (the frontend works without the table only as an error state: the To-Do boxes would show no links).
2. After it is live: clear the 15 stale GitHub task rows (Carl asked for this), with a backup first.
3. Rollback file: `supabase/migrations/rollback/20261029030000_rock_todo_links.down.sql` (drops only the links; To-Dos are untouched).
