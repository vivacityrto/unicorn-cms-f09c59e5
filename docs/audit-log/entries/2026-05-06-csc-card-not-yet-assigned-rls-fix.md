# Audit: 2026-05-06 — csc-card-not-yet-assigned-rls-fix

**Trigger:** ad-hoc — bug report from client user `khianbsismundo@gmail.com`: CSC card on client portal home screen showed "Not yet assigned" despite the tenant having a CSC assigned in `tenant_csc_assignments`.
**Author:** Khian (Brian Sismundo) · **Reviewer:** Carl
**Scope:** `users` table RLS policies, `v_client_home_hero` view, `tenant_csc_assignments` table, `app.user_can_access_tenant` function. Did not touch any frontend code, views, edge functions, or other tables.

---

## Findings

- `v_client_home_hero` is not SECURITY DEFINER. It runs with the caller's JWT security context.
- The view's `csc_primary` CTE does `LEFT JOIN users u ON u.user_uuid = tca.csc_user_id` to resolve the CSC's name, email, and avatar from `tenant_csc_assignments`.
- The `users` table had three SELECT policies: `users_select_own` (own row only), `users_select_same_tenant` (users in the same tenant via `tenant_members`), `users_select_staff` (Vivacity staff only). None of these permitted a client user to read a Vivacity staff member's row.
- When a client user queried the view, the LEFT JOIN to `users` was silently blocked by RLS. The CSC's name, email, and avatar columns all returned NULL. `csc_user_id` was correctly populated from `tenant_csc_assignments` (accessible via `app.user_can_access_tenant`), but all display fields were NULL.
- `ClientHomePage.tsx` sets `hasCSC = !!hero?.csc_user_id` — so `hasCSC` was true (buttons enabled), but `cscName` was null, causing the display to fall back to "Not yet assigned".
- 107 rows in `tenant_csc_assignments` confirmed (80 primary). Data was present and correct; the failure was purely an RLS gap.
- Blast radius check: two client-facing components (`ClientNotesTab`, `ConsultantAssignmentCard`) were identified as potential side-effect surfaces but confirmed orphaned dead code with no active consumers.
- `users` full-row exposure noted: the new policy grants SELECT on the full `users` row for the assigned CSC, including internal operational columns (`unicorn_role`, `is_vivacity_internal`, `allocation_paused`, `working_days`). No secrets are exposed (passwords live in `auth.users`), but this is internal HR-adjacent data. Flagged for Angela to decide whether column-scoping is warranted in a follow-up session.

---

## Changes shipped

### Lovable migration — `users_select_assigned_csc` RLS policy

One new PERMISSIVE SELECT policy added to `public.users`:

```sql
CREATE POLICY users_select_assigned_csc
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_csc_assignments tca
      WHERE tca.csc_user_id = users.user_uuid
        AND app.user_can_access_tenant(tca.tenant_id)
    )
  );
```

- Additive only — no existing policies modified.
- Gated by `app.user_can_access_tenant` (SECURITY DEFINER), the canonical tenant-access function already in use across the platform.
- Allows a client user to read the `users` row of any person assigned as their CSC via `tenant_csc_assignments`, scoped to tenants they have access to.
- No recursion risk: `tenant_csc_assignments` policies do not query `users`; `app.user_can_access_tenant` is SECURITY DEFINER and bypasses RLS.

Codebase: `unicorn-cms-f09c59e5` @ `2b6cae03`
Migration file: `supabase/migrations/20260506074647_f2f05378-8cf6-4921-b262-809de3a0fa4c.sql`

---

## KB changes shipped

No KB changes in this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `2b6cae03` — migration confirmed shipped. Two migrations landed in this Lovable push: `20260506073840` (conversation participant safety function and `tenant_messages` policies — unrelated to this fix) and `20260506074647` (this fix).
- `use-client-home-hero.ts` queries `v_client_home_hero` directly — no changes required there.
- `useTenantCSCAssignment.tsx` makes a secondary query to `users` after fetching `tenant_csc_assignments`. This will also benefit from the new policy (the separate `users` fetch for CSC details will now succeed for client users), though this hook is currently only called from staff-side pages.

---

## Decisions

- Fix scoped to RLS only — no view or frontend changes. The view already selects only the columns needed (name, email, avatar); the gap was purely in read permission.
- Full-row policy accepted for now pending Angela's decision on column-scoping.

---

## Open questions parked

- **Full-row CSC exposure** — `users_select_assigned_csc` grants SELECT on all `users` columns including `unicorn_role`, `is_vivacity_internal`, `allocation_paused`, `working_days`. Not a blocker, but Angela should decide whether to narrow this to a column-scoped view in a follow-up. No current client portal query reads these columns directly.
- **Bug #1 (tenants_id_seq desync)** — carried over from previous session. Fix SQL known, not yet applied. Needs its own session.

---

## Tag

`audit-2026-05-06-csc-card-not-yet-assigned-rls-fix`
