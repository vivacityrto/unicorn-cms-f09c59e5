# Audit: 2026-08-25 — grant authenticated select is_system_account

**Trigger:** ad-hoc — Carl reported the facilitator dropdown on Academy Quick
Add Recording was empty.
**Scope:** `public.users.is_system_account` column grants only. No RLS policy
or schema changes.

## Findings

- The facilitator dropdown query (`src/pages/superadmin/AcademyQuickAddPage.tsx`)
  filters `.eq('is_vivacity_internal', true).eq('is_system_account', false)`.
  Reproduced live (dev server + Playwright, logged in as Carl Simpao / Super
  Admin): the request 403'd — `GET .../users?select=user_uuid,full_name,
  archived,disabled&is_vivacity_internal=eq.true&is_system_account=eq.false`.
- `public.users` uses **per-column grants**, not a table-wide `GRANT SELECT`
  (confirmed via `information_schema.table_privileges` — `authenticated` has
  no table-level SELECT at all; `information_schema.column_privileges` shows
  column-by-column grants instead).
- `is_system_account` (added by
  `docs/audit-log/entries/2026-08-25-hide-system-accounts-from-staff-lists.md`'s
  migration, `20260825070000_hide_system_accounts_from_staff_lists.sql`) had
  `SELECT` granted to `anon`, `service_role`, and `postgres` — but **not**
  `authenticated`. That migration added the column and updated 4 RPCs + 9
  frontend call sites to filter on it, with no `GRANT` statement.
- PostgREST returns 403 for a query referencing any column the caller's role
  can't read — including a bare `.eq()`/`.filter()` reference, not just a
  `.select()`'d column. So all 9 frontend call sites from that PR (not just
  this facilitator dropdown) were silently broken for every logged-in user;
  react-query's default `data: [] ` fallback meant no error surfaced in the
  UI, just an empty list.
- The DB data itself was fine throughout — 28 valid internal, non-system
  facilitators exist and the `users_select` RLS policy correctly permits any
  active Vivacity-internal or super-admin viewer to read them.

## Code changes (this entry accompanies one)

- `supabase/migrations/20260825060718_grant_authenticated_select_is_system_account.sql`:
  `GRANT SELECT (is_system_account) ON public.users TO authenticated;`
  (applied live via Supabase MCP `apply_migration`, then checked into the
  migrations folder).
- Verified fix via Playwright reload of the same authenticated session:
  console errors went from 2 (both the 403) to 0, and the facilitator
  dropdown populated with all 28 expected names.
- `AGENTS.md`: added a guardrail under "Schema / RLS / trigger changes" —
  any migration adding a column to a per-column-grant table (`public.users`
  chief among them) must include the matching `GRANT SELECT` in the same
  migration, not assume it's implied.

## Decisions

- Granted `SELECT` only on the one missing column (`is_system_account`) for
  `authenticated`, matching the scope of the actual gap — did not audit
  every other column on `public.users` for the same issue, since the other 8
  frontend call sites from the same PR share this exact column and are fixed
  by the same grant.

## Open questions parked

- Whether `hide_system_accounts_from_staff_lists`'s 4 patched RPCs
  (`get_vivacity_team_directory`, `get_vivacity_team_directory_staff`,
  `seed_meeting_attendees_from_roles`, `sync_l10_meeting_participants`) were
  affected: they're `SECURITY DEFINER` functions, which run as the function
  owner and bypass the caller's column grants — not expected to be affected,
  but not explicitly re-tested this session.
- No broader sweep was done for other columns on `public.users` (or other
  per-column-grant tables) missing an `authenticated` grant; this entry fixes
  the one reported, confirmed gap.
