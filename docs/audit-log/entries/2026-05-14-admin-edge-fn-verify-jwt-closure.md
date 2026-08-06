# Audit: 2026-05-14 — Admin Edge Function `verify_jwt` closure (8 May P2 reconciliation)

**Trigger:** Drift-surfaced. 8 May 2026 Deployment Readiness Audit §4.2 listed 10 admin edge functions with `verify_jwt = false` that "should require JWT verification — they are admin operations" and recommended each be audited for whether they have an alternative auth path or are genuinely exposed. The residual sat parked for six days. This session ran the audit as a read-only reconciliation: of the 10 originally named functions, **4 have been deleted, 4 have been hardened to `verify_jwt = true`, and the remaining 2 handle authentication themselves via the canonical pattern**. Zero remaining exposure on the named list. The residual closed organically through unrelated work over the past week.
**Author:** Carl
**Scope:** Read-only investigation. No DB changes. No code changes. No documentation changes. Reconciles the 8 May audit's §4.2 admin Edge Function list against current `supabase/config.toml` + function body inspection. Surfaces the **broader 96-function `verify_jwt = false` total** as a separate parked workstream (not in scope here).

---

## Findings

- **The named list of 10 admin functions has 0 remaining exposure.** Detailed status:

  | Function | 8 May state | Current state | Verdict |
  |---|---|---|---|
  | `delete-user` | `verify_jwt = false` | `verify_jwt = true` (default; no config entry) | ✅ Hardened |
  | `admin-change-password` | `verify_jwt = false` | **Deleted** | ✅ Removed |
  | `admin-reset-user` | `verify_jwt = false` | **Deleted** | ✅ Removed |
  | `bulk-user-action` | `verify_jwt = false` | `verify_jwt = false` + handles auth itself | ✅ Safe |
  | `update-user-role` | `verify_jwt = false` | `verify_jwt = true` (default) | ✅ Hardened |
  | `toggle-user-status` | `verify_jwt = false` | `verify_jwt = true` (default) | ✅ Hardened |
  | `provision-m365-user` | `verify_jwt = false` | `verify_jwt = true` (default) | ✅ Hardened |
  | `tenant-lifecycle` | `verify_jwt = false` | `verify_jwt = false` + handles auth itself | ✅ Safe |
  | `assign-package-to-tenant` | `verify_jwt = false` | **Deleted** | ✅ Removed |
  | `create-tenant` | `verify_jwt = false` | **Deleted** | ✅ Removed |

- **`bulk-user-action` handles auth itself (SafeAdmin pattern).** Lines 42-66 of `supabase/functions/bulk-user-action/index.ts`:
  1. Extract `Authorization` header
  2. Call `supabase.auth.getUser(token)` via the service-role client to verify the JWT
  3. Look up the caller's profile (`users` table) for `global_role` / `unicorn_role` / `user_type`
  4. Confirm SuperAdmin status — return 403 if not
  
  The `verify_jwt = false` is intentional: the function does its own controlled verification using the service-role client (which has elevated privileges to query `users` for the SuperAdmin check). Setting `verify_jwt = true` in the gateway would verify against anon context first, requiring an awkward re-verify in the function.

- **`tenant-lifecycle` uses the canonical shared helpers.** Lines 17, 40-46 of `supabase/functions/tenant-lifecycle/index.ts`:
  ```ts
  import { extractToken, verifyAuth, checkSuperAdmin, checkVivacityTeam }
    from "../_shared/auth-helpers.ts";
  ...
  const token = extractToken(req);
  if (!token) return CommonErrors.unauthorized();
  const supabase = createServiceClient();
  const { user, profile, error: authError } = await verifyAuth(supabase, token);
  if (authError || !user || !profile) return jsonError(401, ...);
  if (!checkVivacityTeam(profile)) return CommonErrors.forbidden();
  ```
  This is the canonical pattern documented in `CONTRIBUTING.md` → Edge Function Development.

- **The closure was organic, not deliberate.** No prior audit or workstream this session targeted the 8 May admin-function list. The 4 hardenings + 4 deletions presumably came from incidental cleanup during the contact-role-canonicalisation work (12 May), the academy user isolation work (12 May), or the bulk-invite review (11 May). The 2 remaining functions were always handling auth correctly; the 8 May audit's framing of them as "admin operations without JWT verification" was true *literally* (gateway-side `verify_jwt = false`) but misleading *operationally* (in-function auth verification was always present).

- **The bigger picture: 96 functions total have `verify_jwt = false`.** That's far more than the 10 the 8 May audit sampled. Most are presumably legitimate (webhooks with header-secret validation, public utilities like password reset, service-role-only batch jobs, AI assistants called from edge context, etc.) but a comprehensive audit hasn't been done. **Parked as a separate workstream** — would be ~4-6 hours of read-only investigation across `supabase/functions/*/index.ts`.

---

## DB changes shipped

None. Read-only reconciliation.

---

## Code changes shipped

None. Read-only reconciliation.

---

## KB changes shipped

None. The canonical patterns are already documented:
- `CONTRIBUTING.md` → Edge Function Development (the `_shared/auth-helpers.ts` import pattern)
- `pinned/conventions.md` → Edge functions (canonical pattern)

The `_shared/auth-helpers.ts` extraction (used by `tenant-lifecycle`) is already the documented standard. The in-function `auth.getUser` + role-check pattern (used by `bulk-user-action`) is conceptually equivalent — it predates the shared helpers and inlines the same logic. Worth a small KB note? Marginal; flagged as an open question below.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start: `2ec20216`. No commits touched during this session.

- `supabase/config.toml`: 96 entries with `verify_jwt = false`
- 4 of the 10 originally-flagged admin functions have no config entry (default = `verify_jwt = true`)
- 4 of the 10 do not exist in `supabase/functions/` at all (deleted/renamed)
- 2 of the 10 are present with `verify_jwt = false` AND handle auth themselves correctly

---

## Decisions

- **Read-only reconciliation, no remediation needed.** The 8 May P2 residual is closed by current state — no migrations, no code changes, no documentation updates required to close it.
- **Comprehensive 96-function audit parked as separate workstream.** Out of scope for today; surfaced for future reference.
- **The `bulk-user-action` inline-auth pattern is acceptable.** It functions correctly; could be migrated to `_shared/auth-helpers.ts` for consistency in a future cleanup, but the audit doesn't mandate it.

---

## Open questions parked

- **Comprehensive 96-function `verify_jwt = false` audit.** Categorize each: webhook (signature-validated) / public utility (token-validated) / service-role internal (no caller auth needed) / handles-auth-itself / genuinely-exposed-vulnerability. Worth its own session; ~4-6 hours read-only.
- **Migrate `bulk-user-action` to `_shared/auth-helpers.ts` for pattern consistency.** Optional cleanup, not security-blocking.
- **Phase 2 gate** (from 8 May audit, §5 closing assessment): one of the deferred items was "audit the `verify_jwt = false` admin Edge Functions". With the 10 named items now closed, this Phase 2 gate criterion is met for the named list — but the broader 96-function question above remains as a separate Phase 2 readiness item if the team wants exhaustive coverage.

---

## Tag

`audit-2026-05-14-admin-edge-fn-verify-jwt-closure`
