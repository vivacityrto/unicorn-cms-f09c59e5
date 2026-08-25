# Audit: 2026-08-25 — hide system accounts from staff lists

**Trigger:** ad-hoc — Carl noticed the bulk-generate-automation service account
in the attendee list of an EOS L10 meeting while testing the meeting module.
**Scope:** `public.users`, 4 Postgres functions, 9 frontend query sites. No
RLS policy changes; one new column, one column backfill, one data cleanup.

## Findings

- The bulk-generate-automation account (`bulk-generate-automation@vivacity.com.au`,
  provisioned per `docs/audit-log/entries/2026-08-19-bulk-generate-system-account-auto-refresh.md`)
  is a real `public.users` row with `is_vivacity_internal = true` so it can pass
  staff-only RPC gates (`is_vivacity_team_safe`). That flag is also what every
  staff-listing query in the app uses to mean "show this as a person" — so the
  automation account was surfacing everywhere a real Vivacity team member would.
- Confirmed via `pg_get_functiondef` that `sync_l10_meeting_participants` and
  `seed_meeting_attendees_from_roles` (the two functions that auto-populate L10
  meeting attendance) filter only on `is_vivacity_internal = true` (plus
  archived/disabled/kpi_pod for the latter) — neither excluded the account, so
  it was auto-added as an attendee to every L10 meeting synced/seeded since
  2026-08-19, including one still-`scheduled` real recurring meeting
  (`eos_meetings.id = faa18f1d-...`, 31 Aug 2026) and a test meeting created
  during this session.
- `get_vivacity_team_directory` / `get_vivacity_team_directory_staff` (the
  central team-directory RPCs backing most staff pickers) had the same gap.
- Grepped `src/` for direct `.from('users').eq('is_vivacity_internal', true)`
  queries bypassing those RPCs: 9 files (audit workspace auditor picker, 3
  Academy facilitator pickers, staff-engagement link search, new-audit-modal
  auditor picker, client-messages staff picker, consultant reassignment
  picker, KPI staff selector) — same gap, same fix needed per site.
- No existing "is this a system/service account" flag existed on `public.users`
  — confirmed via `information_schema.columns`.

## Code changes (this entry accompanies one)

- `supabase/migrations/20260825070000_hide_system_accounts_from_staff_lists.sql`:
  - Added `public.users.is_system_account boolean NOT NULL DEFAULT false`.
  - Set it `true` for the bulk-generate-automation account.
  - `CREATE OR REPLACE` on `get_vivacity_team_directory`,
    `get_vivacity_team_directory_staff`, `seed_meeting_attendees_from_roles`,
    `sync_l10_meeting_participants` to add `AND COALESCE(is_system_account,
    false) = false` alongside their existing archived/disabled/kpi_pod
    exclusions (no signature changes, so no `DROP FUNCTION` needed first).
  - Deleted the two `eos_meeting_attendees` rows already seeded for the
    account (both meetings still `scheduled`, nothing `completed` touched).
- 9 frontend files patched to add `.eq('is_system_account', false)` (or the
  equivalent client-side filter for the one call site using `.or()` + a
  post-fetch filter) alongside their existing `is_vivacity_internal` filter.
- `src/integrations/supabase/types.ts` regenerated to include the new column.
- `docs/kb/handoffs/rbac-v6-gate-closure-plan.md`: added gap #6 documenting
  that "is this a listable staff member" is a duplicated WHERE-clause instead
  of a single owned definition, and proposing a centralized
  `staff_directory` view / `useListableStaff()` hook as a v6 candidate (not
  built this session — this fix patches the 13 known sites individually).

## Decisions

- Added a boolean flag rather than deleting/disabling the account or excluding
  it by hardcoded email — the account is a legitimate, still-in-use service
  identity (see the 2026-08-19 entry); it needs to keep passing
  `is_vivacity_internal`-gated RPCs, just not appear in human-facing lists.
- Did not build the centralized `staff_directory` view/hook proposed in the
  RBAC v6 doc addition — scoped as future work there, this session fixed the
  concrete, reported bug (13 known sites) rather than the general pattern.

## Open questions parked

- The census of `is_vivacity_internal`-filtering call sites was grep-based,
  not exhaustive — a future session building the centralized view/hook should
  re-derive the full list rather than trusting this one.
- Whether any other non-human accounts exist in `public.users` without
  `is_system_account = true` was not checked beyond the one account this
  session was triggered by.
