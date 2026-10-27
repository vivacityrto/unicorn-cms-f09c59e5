# Audit: 2026-10-27 — Rock editor: explicit upsert, level lock, V/TO default

**Trigger:** ad-hoc (Rock editor redesign, stage 2 of 3: Edit)
**Scope:** `public.upsert_rock_with_parenting(jsonb)` on the configured Supabase
project `1. Unicorn 2.0-dev` (`yxkgdalkbrriasiyyrwk`). **Status: applied** on
27 Oct 2026 on Carl's explicit instruction, to `unicorn-qa` first (version
`20261027084833`) and then to the configured project (version
`20261027085424`), and verified on both (see Verification).

## Findings
- The staff-gated SECURITY DEFINER upsert had two silent side effects that
  fired whenever an Individual Rock carried a `function_id`:
  1. With a `client_tenant_id`, it looked for an active client Team Rock for
     that team, client and quarter, and **created one** ("Client Rock -
     <client> - Qn YYYY", priority 3, owned by the team's primary seat holder)
     if none existed, even when the caller had already chosen a parent. If no
     parent was supplied, that Team Rock became the parent.
  2. With no client and no parent, it quietly picked the oldest active Team
     Rock for the team and quarter as the parent.
  The person saving never saw either choice. Production already holds 18 Team
  Rocks that belong to a client (9 typed `client`, 9 `general`) and 14
  Individual Rocks with both a client and a team.
- A Rock could change level while it had a parent or children, leaving them
  attached to a Rock of the wrong level. Nothing refused it.
- New Company Rocks were linked to the V/TO by a second, client-side call.
  Production: all 38 Company Rocks have a `vto_id`.
- The server only checks the hierarchy when it changes, so some saved Rocks
  pre-date its rules. 9 client Individual Rocks sit under a parent with no
  client (7 under a Company Rock, 2 under a general Team Rock). The editor
  therefore keeps a saved Rock's client while its parent is unchanged and
  follows the new parent once it changes.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261027150000_rock_editor_explicit_upsert.sql`:
  removes both silent behaviours and their unused variables; refuses a level
  change when the Rock has a parent or children (archived children count);
  defaults a new Company Rock's `vto_id` to the tenant's latest V/TO unless one
  is supplied. Staff gate, parent validation, `created_by` and the signature
  and return shape are unchanged, so `CREATE OR REPLACE` leaves one overload.
- `supabase/migrations/rollback/20261027150000_rock_editor_explicit_upsert.down.sql`:
  restores the previous definition (20261027100000) verbatim.
- `supabase/migration-safety-allowlist.json`: reviewed function-body findings
  for both files, through 2026-11-27.
- `src/components/eos/rockEditor/*`, `src/utils/rockEditor/*`,
  `src/hooks/useRockEditorData.ts`, `src/hooks/useSaveRock.ts`: the Rock editor
  now edits as well as creates. It replaces `RockFormDialog`, which is removed.
  The explicit form offer ("Add under the Client Rock for <client>?") replaces
  silent behaviour 1; the parent picker replaces silent behaviour 2.
- The editor works against the database as it stands today (its client-side
  V/TO follow-up only fills a missing `vto_id`), so the frontend can ship
  before or after the migration.

## Verification
- Dry run against the configured project inside one transaction that was
  rolled back: applied the new definition, then exercised it as an active staff
  user against real rows. Results: an Individual Rock with a team and a chosen
  parent added exactly 1 Rock (no Client Rock created); an Individual Rock with
  a team and no parent stayed parentless; a client Individual Rock under its
  client's Team Rock added exactly 1 Rock; re-saving an existing client
  Individual Rock unchanged preserved its team, client, parent, type and
  owner; re-saving a client Team Rock kept `rock_type = client`; changing the
  level of a Rock with a parent, and of a Rock with children, was refused
  ("A Rock that has a parent or children cannot change level"); a parentless
  Rock with no children could change level; a new Company Rock took the latest
  V/TO and recorded `created_by`; a Team Rock under a parent from another
  quarter and an Individual Rock under a client Team Rock without the client
  were still refused.
- After the dry run: 156 Rocks, 0 `[TEST]` Rocks, the previous definition still
  live, one overload.
- Applied to `unicorn-qa`, then to the configured project, as the migration
  file's exact content. QA has no EOS data, so it was verified structurally and
  with a rolled-back smoke test (Company and Individual Rocks under another
  tenant; no teams exist there).
- Verified on both projects after applying: all eight function bodies (the
  upsert function and the stage 3 functions) have the same md5 and length as the
  bodies in the migration files; each function exists once; the public RPCs are
  executable by `authenticated` and not by `anon` or `PUBLIC`; the table, index,
  triggers, policy and grants are as designed.
- Live check against the applied function on the configured project, in a
  transaction that rolled back: a Company Rock took `created_by` and the V/TO; an
  Individual Rock carrying a team was created under it with no Client Rock created
  as a side effect (client Rock count unchanged at 9); a level change for a Rock
  with a parent was refused; a non-staff user was refused. Afterwards: 156 Rocks,
  1 archived (as before), 0 `[TEST]` Rocks, 498 milestones, 15 linked issues, 40
  milestone links, 24 outcomes, all unchanged.
- `node scripts/audit-migrations.mjs --changed-only --base-ref origin/main`:
  5 findings, all scoped allowlisted, 0 blocking.

## Rollback
Apply `rollback/20261027150000_rock_editor_explicit_upsert.down.sql`. Rocks
created or edited while the new definition was live are ordinary rows and need
no repair.
