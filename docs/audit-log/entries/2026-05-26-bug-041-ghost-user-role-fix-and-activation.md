# BUG-041 — Ghost User Role Change Fix + Account Activation Feature

**Date:** 26 May 2026
**Author:** Khian Sismundo
**Type:** Bug fix + Feature — Lovable deployment (2 migrations, 1 new edge function, 1 DB function, 1 frontend change)
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable)

---

## What shipped

### Bug fix — `set_relationship_role` FK violation for ghost users (BUG-041)

Dave reported "Failed to update role." when promoting Marvie Pascua (Australian Academy Pty Ltd, `tenant_id 7483`) from Secondary Contact to Primary Contact.

**Root cause (two-stage):**

Stage 1 — `set_relationship_role` declared `v_u_unicorn_role public.unicorn_role`. The `public.unicorn_role` enum was dropped in Phase 4C (18 May 2026). Postgres failed to parse the function at call time, returning a generic error. Fix: variable type changed to `text`. Migration `20260525072523`.

Stage 2 — After Stage 1 fix, Dave still could not promote Marvie. Console showed HTTP 409 on `rpc/set_relationship_role`. Diagnosis confirmed Marvie Pascua (`d4a8d89c-ec90-4be7-8753-a550269a57a2`) exists in `public.users` but has no `auth.users` row — a "ghost user" imported from Unicorn 1 who was never invited to log in. The final INSERT into `audit_eos_events` passes `p_user_id` as `user_id`. `audit_eos_events_user_id_fkey` references `auth.users(id)`. FK violation (SQLSTATE 23503) → HTTP 409 → entire transaction rolls back.

**Fix:** Wrapped the `audit_eos_events` INSERT in a `BEGIN/EXCEPTION WHEN foreign_key_violation THEN NULL END` subtransaction. Role change writes (`tenant_users`, `users`, `tenant_members`) succeed for ghost users. Audit row is silently skipped. The `fn_audit_tenant_users` trigger on `tenant_users` still writes to `audit_user_events` independently, so an audit trail is preserved.

**Scope of ghost users confirmed:** 470 users in `public.users` with no matching `auth.users` row — all imported from Unicorn 1. Breakdown: 394 primary contacts, 41 secondary contacts, 6 users, 2 with no role.

**Architectural note logged:** `audit_eos_events.user_id` FK references `auth.users(id)` rather than `public.users(user_uuid)`. This is architecturally incorrect — `public.users` is the app's source of truth. The exception handler is the correct short-term fix; the long-term fix (changing the FK) is logged as technical debt to discuss with Carl.

---

### Feature — Ghost user account activation

Ghost users cannot log in (no auth account). The standard invite flow is unsafe for ghost users — it would generate a new auth UUID that does not match the ghost user's existing `public.users.user_uuid`, creating potential data orphaning or a blocked relink.

**Safe activation approach confirmed:** `supabase.auth.admin.createUser({ id: ghost_uuid })` creates the auth row using the ghost user's existing UUID. `link_auth_user_to_profile` trigger fires, sees `v_existing_uuid = NEW.id` (same UUID), and no-ops. All FK references (`tenant_users`, `tenant_members`, and 80+ downstream tables with `ON UPDATE CASCADE`) remain valid with zero data migration.

**New DB function — `public.is_ghost_user(p_user_uuid uuid) RETURNS boolean`**
- `SECURITY DEFINER`, `STABLE`, `search_path = ''`
- `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`
- Returns `true` when UUID exists in `public.users` but not in `auth.users`

**New edge function — `supabase/functions/activate-ghost-user/index.ts`**
- Caller must be Vivacity staff (`is_vivacity_team_safe` or `is_super_admin_safe`)
- Validates target is a ghost via `auth.admin.getUserById`; returns 409 `ALREADY_ACTIVATED` if already active
- Defensive email collision check before `createUser`
- Creates `auth.users` row using **existing ghost UUID** — no UUID migration needed
- Generates password recovery link (`type: 'recovery'`)
- Sends branded "Your Unicorn account is ready" welcome email via Mailgun
- Writes to `audit_eos_events` post-activation (FK now satisfied)
- Email send failure is non-fatal — auth row is preserved, `email_sent: false` returned to caller

**Frontend — `src/components/client/TenantUsersTab.tsx`**
- Ghost detection: batched `is_ghost_user` calls per member after member list loads; results stored in `ghostUserIds` Set
- "Activate account" button rendered in member row when `canActivateGhosts && ghostUserIds.has(member.user_id)`
- `canActivateGhosts` gated on Vivacity staff role — never visible in client portal
- On success: success toast + button removed from row
- On email send failure: softer toast noting email failed, staff can resend via existing `send-password-reset` (now works since auth row exists)

---

## Changes

### Migrations
- `20260525072523` — `set_relationship_role`: `v_u_unicorn_role public.unicorn_role` → `text` (Stage 1 fix)
- `20260525081719` — `set_relationship_role`: exception handler on `audit_eos_events` INSERT for ghost users (BUG-041 Stage 2 fix)
- `20260526005226` — `public.is_ghost_user(uuid)` function + REVOKE/GRANT

### Edge functions
- `supabase/functions/activate-ghost-user/index.ts` — new function (commit `e6665f4b`)

### Frontend
- `src/components/client/TenantUsersTab.tsx` — ghost detection + "Activate account" button

---

## Verification

- `set_relationship_role` body confirmed in live DB: `v_u_unicorn_role text`, exception handler present
- `public.is_ghost_user` confirmed in live DB: `SECURITY DEFINER`, `STABLE`, `search_path = ''`
- REVOKE/GRANT confirmed: MCP call returned 42501 (permission denied for `postgres` role) — correct, only `authenticated` can call
- Marvie Pascua confirmed still ghost pre-activation: `in_public_users = true`, `missing_from_auth = true`
- 0 ghost academy enrollments, 0 ghost certificates, 0 ghost notifications
- `list_acting_user_options` confirmed excludes ghost users via `JOIN auth.users` — impersonation picker unaffected

---

## Bugs logged

- **BUG-041** — Ghost user FK violation in `set_relationship_role` → HTTP 409. Fixed (exception handler). Architectural debt (FK should reference `public.users`, not `auth.users`) flagged to Carl.
- **BUG-042** — `is_eos_admin()` calls `has_eos_role(..., 'admin'::public.eos_role)` — `public.eos_role` dropped in Phase 4C. Not in scope for this session. Logged for separate fix.

---

## Open questions parked

- **Architectural fix for `audit_eos_events.user_id` FK**: should reference `public.users(user_uuid)`, not `auth.users(id)`. Requires migration + blast-radius check. Carl to decide timing.
- **BUG-042 `is_eos_admin` fix**: dropped `eos_role` enum reference. Low urgency — logged, not yet in a hot code path.
- **Ghost user bulk email exposure**: 394 ghost primary contacts receive appointment/evidence/audit emails but cannot log in to act on them. Not urgent — resolves organically as Angela activates tenants. Flag to Angela to prioritise tenants with active client comms.
- **`toggle-user-status` on ghost users**: function actually works (writes `public.users.disabled` only; audit logs caller UUID not target UUID). Disabling a ghost has no practical effect but does not crash. No fix required.
- **Marvie Pascua**: Angela/Dave to decide whether to activate her account via the new button. Australian Academy Pty Ltd has no primary contact — Dave cannot promote Marvie until she is activated or her role is changed via `set_relationship_role` (now unblocked by BUG-041 fix).

## Tag
audit-2026-05-26-bug-041-ghost-user-role-fix-and-activation
