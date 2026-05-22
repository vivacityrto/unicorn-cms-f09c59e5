## Fix: cross-tenant leak in `processes` RLS

Two policies on `public.processes` use the always-true clause `u.tenant_id = u.tenant_id`, letting any tenant Admin read all processes and any General User read all approved processes across every tenant.

### Migration (single file)

Drop and recreate the two broken policies, replacing the self-referential clause with a real tenant scope check against `processes.tenant_id`. SuperAdmin / Team Leader / Team Member policies are untouched (they intentionally see all tenants via `processes_superadmin_select`).

```sql
DROP POLICY IF EXISTS processes_admin_select ON public.processes;
CREATE POLICY processes_admin_select ON public.processes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND u.unicorn_role = 'Admin'
      AND u.tenant_id IS NOT NULL
      AND u.tenant_id = processes.tenant_id
  )
);

DROP POLICY IF EXISTS processes_users_select_approved ON public.processes;
CREATE POLICY processes_users_select_approved ON public.processes
FOR SELECT
USING (
  status = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND u.unicorn_role = 'User'
      AND u.tenant_id IS NOT NULL
      AND u.tenant_id = processes.tenant_id
  )
);
```

Note: the original `(u.tenant_id IS NULL) OR ...` branch is dropped intentionally — a NULL `tenant_id` on a non-SuperAdmin user should not grant global access. SuperAdmin/Team roles already have their own unrestricted SELECT policy.

### Verification

After apply:
- As a tenant Admin: `SELECT count(*) FROM processes` returns only rows where `tenant_id` matches their `users.tenant_id`.
- As a General User: same, additionally filtered to `status='approved'`.
- As Super Admin / Team Leader / Team Member: unchanged, sees all rows.

### Out of scope

No code changes — `useDashboardProcesses` and other callers already rely on RLS, no query updates needed. Other security findings (`_tenant_users_contact_backfill_20260512` RLS, Security Definer view) are separate and not addressed here.
