# Audit: 2026-09-15 — `has_permission`/`check_permission`/`is_super_admin_safe` never excluded disabled accounts, and `has_permission` never excluded archived ones either

**Trigger:** ad-hoc, surfaced while investigating `admin.permissions.manage` as a candidate fourth RBAC v6 vertical slice — checking `role_permissions`' own RLS led to reading `is_super_admin_safe()`'s definition, which led to checking its two callers.
**Scope:** `public.is_super_admin_safe(uuid)`, `public.has_permission(text, text)`, `public.check_permission(uuid, text, text)` — the three core RBAC v6 authorization primitives. Did not audit the ~130 other `SECURITY DEFINER` functions a broader grep surfaced as textually not mentioning `disabled` (see "Open questions parked").

## Findings

- **Disabling a user never revokes their Supabase Auth session.** `rpc_set_client_account_status` (the RPC behind `toggle-user-status`, the only path that flips `public.users.disabled`) only does `UPDATE public.users SET disabled = p_disabled`; it never touches `auth.users`, never bans the account, never revokes tokens. So a disabled user's existing JWT stays valid until it naturally expires — `disabled` is purely a flag that individual authorization checks must explicitly test, not something Supabase Auth itself enforces.
- **`is_super_admin_safe(uuid)` checked `archived` but never `disabled`.** This function is also the unconditional Super-Admin-bypass called first inside both `has_permission()` and `check_permission()`, so the gap propagated into every caller of either — i.e., effectively the entire RBAC v6 permission system.
- **`has_permission(text, text)` — the function actually used by RLS policies (confirmed today: `eos_configurations`/`eos_configuration_segments` INSERT/UPDATE/DELETE all gate on it directly) — never checked `archived` or `disabled` on the calling user at all**, for the non-SA `role_permissions` lookup path. It only ever checked whether the caller's `unicorn_role`/`user_roles` matched a granted role for the requested feature key — with no live/active-account condition whatsoever.
- **`check_permission(uuid, text, text)`** (the multi-role-aware function, confirmed earlier this session as backing the multi-role infrastructure e.g. Nova's supplemental CSC grant) checked `archived` in its own non-SA path but never `disabled`.
- **Confirmed live and currently exploitable, not theoretical:** `sam@vivacity.com.au` (`unicorn_role = 'CSC'`, `disabled = true`, `archived = false`) held `full`-level `role_permissions` grants across many feature keys (`clients.emails.manage`, `eos.rocks.company.create`, `eos.rocks.own.manage`, `packages.items.tick`, `resource_hub.upload`, several `staff.*` keys, etc.). Before this fix, `has_permission()` and `check_permission()` would both still grant every one of those to any still-valid session for that account — confirmed directly: `check_permission(sam's uuid, 'eos.rocks.own.manage', 'full')` returned `true` pre-fix.
  - Broader query: 17 accounts system-wide are currently `disabled = true, archived = false` (a real, reachable combination — the toggle-status flow only ever sets `disabled`, archival is a separate action). Only `sam@vivacity.com.au` currently also holds `role_permissions` grants via her `unicorn_role`, but the pattern generalizes to any future disable-without-archive action on a privileged account.
  - The 4 currently-disabled Super Admin accounts (`admin@vivacity.com.au`, `angela.connell@vivacity.com.au`, `jomar@vivacity.com.au`, `jose@vivacity.com.au`) are all also `archived = true`, so `is_super_admin_safe`'s pre-existing `archived` check already excluded them — no live SA-bypass exploit existed today, but the `is_super_admin_safe` gap was one disable-without-archive action away from being live for any Super Admin.

## Code changes (this entry accompanies one)

- Migration `gate_permission_core_on_disabled_and_archived` (already applied via Supabase MCP, committed for repo history — `CREATE OR REPLACE`, same signatures on all three functions, confirmed via live introspection before writing so no `DROP FUNCTION` was needed):
  1. `is_super_admin_safe`: added `AND COALESCE(disabled, false) = false` alongside the existing `archived` check.
  2. `has_permission`: wrapped the existing `role_permissions` lookup with a new guard — `EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND NOT archived AND NOT disabled)` — before evaluating either the primary-role or `user_roles`-supplemental path. The SA-bypass branch is unchanged in shape (still `is_super_admin_safe(auth.uid()) OR ...`), and inherits the fix transitively since `is_super_admin_safe` itself is now fixed.
  3. `check_permission`: added `disabled` to the single `SELECT ... INTO` that already pulled `unicorn_role`/`is_vivacity_internal`/`archived`, and added it to the existing `IF NOT FOUND OR v_archived THEN RETURN false` early-exit.
- Purely restrictive change: every branch only *removes* access from accounts that were already disabled or archived. No currently-active account's access is affected.

## Decisions

- Fixed immediately rather than deferred — matching this session's established same-day-fix precedent for `retire-client-eos-access` and `upsert_rock_with_parenting`, and if anything a higher-severity case: this is the RBAC v6 system's own core gate function, not one feature's RLS policy, and had a confirmed live instance (`sam@vivacity.com.au`), not just a latent risk.
- Bounded the fix to exactly the three functions read and confirmed exploitable (`is_super_admin_safe`, `has_permission`, `check_permission`) rather than attempting to fix the ~130 other functions a broad `ILIKE '%archived%'`/`%disabled%'` grep surfaced. That grep is a textual signal, not proof of a gap — several apparent "no disabled check" hits (e.g. `upsert_rock_with_parenting`, fixed earlier today) actually delegate correctly to a helper like `is_vivacity_team_safe` that already checks both fields; a real per-function audit of that list is a separately-scoped follow-up, not something to rush through inline here.
- Did not disable/re-enable `sam@vivacity.com.au`'s account or otherwise touch her row — read-only investigation of an existing account state, no data changed for any specific user as part of this fix.

## Verification

- Confirmed live via `pg_get_functiondef` re-fetch after the migration: all three functions carry the new checks.
- Regression check — active accounts unaffected:
  - `carl@vivacity.com.au` (active Super Admin): `is_super_admin_safe` → `true` (unchanged); `check_permission(..., 'eos.configurations.manage', 'full')` → `true` (unchanged).
  - `ezel@vivacity.com.au` (active CSC, not disabled/archived): impersonated via `SET LOCAL request.jwt.claim.sub` and called `has_permission('eos.rocks.own.manage', 'full')` directly (not just `check_permission`) → `true` (unchanged).
- Gap-closed check:
  - `sam@vivacity.com.au` (CSC, `disabled=true`, `archived=false`): `check_permission(..., 'eos.rocks.own.manage', 'full')` → `false` (was `true` pre-fix, confirmed by re-running the same call before applying the migration). Also impersonated her session directly and called `has_permission('eos.rocks.own.manage', 'full')` → `false`.
  - The 4 disabled+archived Super Admin accounts: `is_super_admin_safe` → `false` (unchanged from pre-fix, since `archived` already excluded them — confirms the fix didn't accidentally change behavior for a case that was already correct).

## Open questions parked

- A dedicated audit pass over the broader list of `SECURITY DEFINER` functions whose body textually lacks `disabled` (surfaced by a grep during this investigation, ~130 candidates before filtering false positives like delegating helpers) — not attempted here; scope and severity need per-function reading, not a blind batch fix.
- Whether `rpc_set_client_account_status` (despite its name, called for both client and internal-staff account toggles) should also call Supabase Admin API to actually invalidate the target's existing sessions/refresh tokens when disabling, rather than relying entirely on every downstream authorization check remembering to test `disabled`. Not done here — a bigger architectural change (requires a service-role-privileged Admin API call from within a `SECURITY DEFINER` SQL function, or moving the toggle into an Edge Function that can call `supabase.auth.admin.signOut`/`updateUserById` with `ban_duration`) than this bounded fix.
- Whether other `has_permission`/`check_permission`-adjacent functions in the codebase (e.g. any bespoke per-feature permission helper written before RBAC v6 standardized on these two) have the same gap — not swept.
