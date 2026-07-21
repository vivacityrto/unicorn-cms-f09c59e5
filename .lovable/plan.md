
## Audit results (step 1)

- **View ownership / access to `auth.sessions`**: `v_client_tenant_users` is owned by `postgres` and has `reloptions = NULL` — i.e. no `security_invoker=true`, so it runs with the view owner's privileges (the default). `postgres` can read `auth.sessions` freely. Direct check confirms neither `authenticated` nor `anon` has `SELECT` on `auth.sessions`, but that doesn't matter here — the view executes as owner, so the added `LEFT JOIN LATERAL` against `auth.sessions` will work through PostgREST without any new grant or SECURITY DEFINER wrapper.
- **Index on `auth.sessions.user_id`**: present — `sessions_user_id_idx` (btree on `user_id`) plus a composite `user_id_created_at_idx`. Per-user `max(updated_at)` lookup will be an index scan, not a seq scan.

No prerequisite fix needed. Proceeding with the additive view change as specified.

## 1. Migration — extend `v_client_tenant_users`

`CREATE OR REPLACE VIEW public.v_client_tenant_users` reproducing the current definition verbatim, with only these additions:

- In `active_users` CTE, add `LEFT JOIN LATERAL (SELECT max(s.updated_at) AS last_session_at FROM auth.sessions s WHERE s.user_id = u.user_uuid) sess ON true` after the `users` join.
- In `active_users` CTE, append a new column: `GREATEST(u.last_sign_in_at, sess.last_session_at) AS last_active_at` (positioned at end, after `first_clicked_at`, matching the additive convention).
- In `pending_invites` CTE, append `NULL::timestamptz AS last_active_at` in the same position.
- In both branches of the outer `UNION ALL SELECT`, append `last_active_at` at the end of the column list.
- Keep the existing `last_sign_in_at` column untouched (additive only).
- Follow with `NOTIFY pgrst, 'reload schema';`.

No changes to filters, WHERE clauses, other joins, ordering, or view options.

## 2. Type — `src/hooks/use-client-tenant-users.ts`

Add `last_active_at: string | null;` to `ClientTenantUserRow`. The query already uses `select("*")`, so no query change.

## 3. UI — `src/components/client/ClientUsersPage.tsx`

Only affects `row.row_type === "active"` rendering paths:

- **StatusDot**: replace both `row.last_sign_in_at` reads (the null-check that yields "Never signed in" and the `differenceInDays(new Date(), new Date(row.last_sign_in_at))` used for the 30-day Active/Inactive threshold) with `row.last_active_at`. Thresholds unchanged: `< 30 days` = Active, else Inactive, `null` = Never signed in.
- **LastActive**: replace `row.last_sign_in_at` with `row.last_active_at` in the `formatDistanceToNow` call and the "Never" fallback check.
- No changes to invited-row rendering, dropdown gates, delivery/engagement badges, Copy Link, or Reset Password logic.

## Out of scope

- `src/pages/ManageInvites.tsx` and `src/components/client/TenantUsersTab.tsx` (staff-side) untouched. Heads-up in summary: both derive activity from `last_sign_in_at`, so they will exhibit the same staleness for long-lived silently-refreshed sessions — separate follow-up if desired.
- No changes to `auth.sessions`, no new columns on `public.users`, no client heartbeat.

## Verification

1. Confirm view still runs cleanly under PostgREST (permissions/index check already clean above).
2. `SELECT last_sign_in_at, last_active_at FROM public.v_client_tenant_users WHERE email = 'greg@bwfat.com.au' AND tenant_id = 7478;` — `last_active_at` should reflect ~21 Jul (session `updated_at`), not the older 17 Jun `last_sign_in_at`.
3. Load `/client/users` as a Business Wise tenant admin (or via client impersonation) and confirm Greg shows **Active**.
4. Spot-check a genuinely dormant user (no sign-in for >30d and no recent session) still shows **Inactive** / **Never signed in**.
