# Audit: 2026-06-11 — last-sign-in-insert-sync

**Trigger:** ad-hoc — Mandrie Danwatta (mandhrie@australiancollege.edu.au) reported
as "Never signed in" on the client portal Users page despite having logged in today.
**Scope:** new `AFTER INSERT ON public.users` trigger to sync `last_sign_in_at` from
`auth.users` at row creation time; backfill of 26 affected users. No frontend changes.

## Findings

- `auth.users.last_sign_in_at` = `2026-06-11 04:16:07` for Mandrie; `public.users.last_sign_in_at` = NULL.
- `user_activity` had a row for Mandrie — confirming the existing `handle_user_login` trigger
  DID fire on `auth.users` UPDATE. But `public.users` had no row at the time the trigger ran;
  the `UPDATE public.users SET last_sign_in_at = ...` found 0 matching rows (silent no-op).
- Root cause: race condition. For first-time activations, `auth.users.last_sign_in_at` is set
  BEFORE the `public.users` row is created by the invitation/activation flow. The existing trigger
  (`AFTER UPDATE OF last_sign_in_at ON auth.users`) cannot retroactively sync to a row that
  doesn't exist yet.
- 26 users platform-wide had `auth.last_sign_in_at IS NOT NULL` AND `public.last_sign_in_at IS NULL`.
- `handle_user_login` (the 2026-05-20 fix) correctly handles all SUBSEQUENT logins — no change needed.
  The gap is exclusively the first sign-in when `public.users` row is created after auth.
- No existing `AFTER INSERT ON public.users` trigger handled `last_sign_in_at`.
- Related: `2026-05-20-last-sign-in-at-sync.md` — original fix for the `auth.users` RLS boundary
  problem; this is the complementary fix for the insertion-timing gap.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `746eafa0` (origin/HEAD): migration
  `20260611062316_6e12146b-ea4c-43c1-a534-b93d5a142ba8.sql` applied:
  - `public.sync_last_sign_in_on_user_insert()` — `LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = ''`; reads `auth.users.last_sign_in_at` for `NEW.user_uuid`; if
    non-null, updates `public.users.last_sign_in_at` for that row. `REVOKE ALL FROM PUBLIC`.
  - `trg_sync_last_sign_in_on_insert` — `AFTER INSERT ON public.users FOR EACH ROW`.
  - Backfill: 26 rows updated to match `auth.users.last_sign_in_at`.
- Post-deploy verification passed: 0 remaining unsynced rows; trigger present on `public.users`.

## Decisions

- `handle_user_login` left unchanged — it is correct for subsequent logins.
- AFTER INSERT chosen (not BEFORE INSERT) to stay symmetric with `handle_user_login`
  and avoid interfering with the audit trigger on the same insert.

## Open questions parked

- `tenant_members.status = 'inactive'` for Mandrie — she is Academy-only with inactive
  full-portal membership. Whether she should be activated as full-access is a separate
  product/ops decision.

## Tag
audit-2026-06-11-last-sign-in-insert-sync
