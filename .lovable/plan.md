# Plan: `update-role-permission` Edge Function

Create a single new edge function that is the sole write path for `role_permissions`. Service-role client bypasses RLS; auth and role validation happen in code.

## File to create

`supabase/functions/update-role-permission/index.ts`

## Imports & setup

- `createClient` from `https://esm.sh/@supabase/supabase-js@2`
- `corsHeaders` from `../_shared/cors.ts`
- Service-role client built from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no session persistence)
- Handle `OPTIONS` preflight returning `corsHeaders`
- Small `jsonResponse(status, body)` helper applying `corsHeaders` + `Content-Type: application/json`

## Request handling (POST)

1. **Auth** — read `Authorization` header; if missing/not Bearer → `401 UNAUTHORIZED`. Call `supabase.auth.getUser(token)`; if error or no user → `401 UNAUTHORIZED`.

2. **Caller authorization** — `SELECT unicorn_role, is_vivacity_internal FROM public.users WHERE user_uuid = caller.id`. Require `unicorn_role = 'Super Admin'` AND `is_vivacity_internal = true`. Otherwise → `403 FORBIDDEN`.

3. **Parse + validate body** — `{ feature_key, role, new_permission, reason? }`.
   - All three required → `400 MISSING_FIELDS` listing which are absent.
   - `new_permission` must be one of `'full' | 'limited' | 'owner_only' | 'none'` → `400 INVALID_PERMISSION` if not.

4. **Hard guard (before DB lookups to fail fast)** — if `role === 'Super Admin'` AND `new_permission !== 'full'` → `400 CANNOT_RESTRICT_SUPER_ADMIN`.

5. **Validate role dynamically** — `SELECT value FROM public.dd_unicorn_roles WHERE value = $role AND is_active = true`. No row → `400 INVALID_ROLE`. (No hardcoded role list — new roles added to `dd_unicorn_roles` work immediately.)

6. **Validate feature** — `SELECT feature_key FROM public.permission_features WHERE feature_key = $feature_key AND is_active = true`. No row → `404 FEATURE_NOT_FOUND`.

7. **Read current permission** — `SELECT permission FROM public.role_permissions WHERE feature_key = $feature_key AND role = $role`. Capture `old_permission` (or `null` if none).

8. **Upsert** — `upsert({ feature_key, role, permission: new_permission, updated_by: caller.id, updated_at: new Date().toISOString() }, { onConflict: 'feature_key,role' })`. On error → `500 UPSERT_FAILED` with detail.

9. **Audit log** — insert into `public.permission_change_log`: `{ feature_key, role, old_permission, new_permission, changed_by: caller.id, reason: reason ?? null }`. Log (don't fail the request) if this insert errors — the permission change has already committed; surface via `console.error` so the caller still gets `ok: true` but the failure is visible in logs. (If preferred stricter, we can hard-fail; I'll go with log-and-continue so audit gaps are visible but a transient log-table error doesn't break admin UX. Confirm in build if you want hard-fail instead.)

10. **Response** — `{ ok: true, feature_key, role, old_permission, new_permission }` with `200`.

## Error envelope

All errors return `{ ok: false, code, detail? }` matching the pattern used in `update-user-profile` / `update-user-role`.

## Config

- No `config.toml` change needed — default `verify_jwt = false` (we validate in code via `getUser`).
- No new secrets required (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are built-in).

## Manual test matrix (to document in PR)

| # | Setup | Expected |
|---|-------|----------|
| 1 | SA caller, `role='Super Admin'`, `new_permission='none'` | `400 CANNOT_RESTRICT_SUPER_ADMIN` |
| 2 | Non-SA caller (any other role) | `403 FORBIDDEN` |
| 3 | SA caller, unknown `feature_key` | `404 FEATURE_NOT_FOUND` |
| 4 | SA caller, `role='NotARole'` | `400 INVALID_ROLE` |
| 5 | Insert new row into `dd_unicorn_roles` (e.g. `'NewRole'`, `is_active=true`), call with `role='NewRole'` | `200 ok:true`, no code change |

## Out of scope

- Frontend caller / admin UI for this function
- Migration on `role_permissions` / `permission_change_log` (assumed already present per project state)
- Revoking direct browser write access via RLS on `role_permissions` (separate task — recommend follow-up to confirm RLS denies `authenticated` writes so this function is enforced as the only write path)
