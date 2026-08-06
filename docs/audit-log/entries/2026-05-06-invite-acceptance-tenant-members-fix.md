# Audit: 2026-05-06 — invite-acceptance-tenant-members-fix

**Trigger:** ad-hoc — bug investigation surfaced during client portal testing with `khianbsismundo@gmail.com`
**Author:** Khian (Brian Sismundo) · **Reviewer:** Carl
**Scope:** Invite acceptance flow (`accept_invitation_v2`), `tenant_members` table, `profiles` table, `tenant_users` table. Did not touch RLS policies, auth triggers, or any other edge functions.

---

## Findings

- `accept_invitation_v2` (SECURITY DEFINER) wrote to `tenant_users`, `users`, `user_invitations`, and `audit_eos_events` — but never to `tenant_members` or `profiles`. This has been the case since the function was introduced.
- `tenant_members` is the canonical table read by `useAuth.fetchMemberships()`, all RBAC helpers (`hasTenantAccess`, `hasTenantAdmin`, `getTenantRole`), RLS policies, and the Ask Viv client access gate (`validateClientAskVivAccess`). Missing rows here silently denied invited users access to the platform.
- `tenant_users` and `tenant_members` serve different purposes. `tenant_users` is the legacy relationship table (parent/child, primary_contact). `tenant_members` is the platform access table (Admin/General User, active/inactive). They are not synced — no trigger exists between them.
- `profiles.active_tenant_id` (UUID) is not read by the main app. The app reads `users.tenant_id` (bigint) via `useAuth` → `ClientTenantContext`. The profiles write added to the fix is harmless but does not affect current app behaviour.
- `AcceptInvitation.tsx` line 81 was found to already have `VIVACITY_TENANT_ID = 6372` — the fix identified an earlier version of this constant at 319, but it had already been corrected. No frontend change was needed.
- Pre-backfill check: 421 `tenant_users` rows were missing a `tenant_members` counterpart. 5 of those had orphaned tenant_ids (low-range IDs 1–55, Unicorn 1.0 ghost tenants) — excluded from backfill.
- Of the 416 backfill candidates: 83 users were `disabled=false, archived=false` (active); 333 were `disabled=true` or `archived=true` (intentionally inactive). Original backfill plan would have inserted all 416 as `status='active'` — caught and corrected before live run.
- Two accounts have a data inconsistency: `kim.luehman@sunrise.org.au` and `chris@thinkrealestate.net.au` have `users.unicorn_role = 'User'` but `tenant_users.role = 'parent'`, mapping them to `tenant_members.role = 'Admin'`. The backfill mapping is correct (parent → Admin); the `users.unicorn_role` inconsistency is a separate data quality issue.

---

## Changes shipped

### 1. Lovable migration — `accept_invitation_v2` extended

Added two statements after the existing `tenant_users` INSERT:

```sql
-- Mirror membership into tenant_members (canonical RLS source)
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
VALUES (
  v_invitation.tenant_id, p_user_id,
  CASE WHEN v_tu_role = 'parent' THEN 'Admin' ELSE 'General User' END,
  'active'
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  role = EXCLUDED.role, status = 'active', updated_at = now();

-- Set active tenant on profiles if not already set
UPDATE public.profiles
SET active_tenant_id = (SELECT id_uuid FROM public.tenants WHERE id = v_invitation.tenant_id),
    updated_at = now()
WHERE user_id = p_user_id AND active_tenant_id IS NULL;
```

Function signature, return shape, and all existing logic preserved verbatim.
Codebase: `unicorn-cms-f09c59e5` @ `d35a20df`

### 2. Production data backfill — `tenant_members`

416 rows inserted via transaction with automatic count verification:
- 83 rows → `status = 'active'` (users where `disabled=false AND archived=false`)
- 333 rows → `status = 'inactive'` (users where `disabled=true OR archived=true`)
- 5 orphaned-tenant rows excluded (tenant IDs 1, 2, 3, 4, 17, 20–28, 33, 36, 38, 46, 54, 55)
- `ON CONFLICT DO NOTHING` — no existing rows were modified

Verification query confirmed: `active: 83, inactive: 333` post-insert.

---

## KB changes shipped

No KB changes in this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `d35a20df` — `accept_invitation_v2` live function confirmed updated with both new writes via `pg_proc` query post-deploy.
- `useAuth.tsx` reads `tenant_members` directly for all memberships. No tenant switcher UI exists. Client users are tied to one RTO via `users.tenant_id`.
- `ClientTenantContext.tsx` derives `activeTenantId` from `profile?.tenant_id` (bigint from `public.users`), not from `profiles.active_tenant_id` (UUID).

---

## Decisions

- Backfill status mapping: `disabled=false AND archived=false` → `active`; anything else → `inactive`. Used `disabled` and `archived` boolean flags as the canonical signal; `state` bigint column not used (mapping unknown, flagged to Carl).
- `profiles.active_tenant_id` write included in `accept_invitation_v2` fix as a forward-looking hygiene measure despite not being read by the current app.
- 5 orphaned-tenant rows excluded from backfill — ghost records from Unicorn 1.0, no corresponding tenant in the `tenants` table.

---

## Open questions parked

- **`users.state` column** — values 0–7, meaning unknown. Does not affect backfill outcome but Carl should document the mapping in KB.
- **Two unicorn_role mismatches** — `kim.luehman@sunrise.org.au` (Dijan Training Program) and `chris@thinkrealestate.net.au` (Think Real Estate) have `unicorn_role = 'User'` but are primary contacts (`tenant_users.role = 'parent'`). Carl to review and correct `users.unicorn_role` for these two accounts.
- **5 orphaned tenant_users rows** — tenant IDs in the 1–55 range not present in `tenants`. Carl to confirm whether these are safe to delete or need migration.
- **Bug #1 (tenants_id_seq desync)** — separate issue blocking new client creation. Fix SQL known (`SELECT setval('tenants_id_seq', (SELECT max(id) FROM public.tenants))`), not yet applied. Needs its own session.

---

## Tag

`audit-2026-05-06-invite-acceptance-tenant-members-fix`
