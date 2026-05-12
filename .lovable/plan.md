## Bug
Academy-only users (`tenant_users.access_scope = 'academy_only'`) cannot read their own `public.tenants` row. The existing SELECT policy delegates to `app.user_can_access_tenant`, whose only non-staff branch requires `access_scope = 'full'`. `ClientTenantContext` therefore receives no row, `AcademyAccessGate` defaults `academyAccessEnabled` to `false`, and the inactive Academy screen is shown even when the tenant has Academy enabled.

## Fix — one additive SELECT-only RLS policy on `public.tenants`

```sql
DROP POLICY IF EXISTS tenants_select_academy_only_users ON public.tenants;

CREATE POLICY tenants_select_academy_only_users
ON public.tenants
FOR SELECT
TO authenticated
USING (
  academy_access_enabled = true
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND tu.user_id = auth.uid()
      AND tu.access_scope = 'academy_only'
  )
);
```

`DROP POLICY IF EXISTS` followed by `CREATE POLICY` makes the migration idempotent — re-applying succeeds without duplicate-policy errors.

## Privilege containment (verified against live `pg_policy`)

`public.tenants` writes — academy-only users remain blocked:
- `tenants_manage_superadmin` (ALL) gated by `is_super_admin_safe(auth.uid())`.
- `tenants_update_staff_logo` (UPDATE) gated by `is_vivacity_team_safe(auth.uid())`.
- The new policy is `FOR SELECT` only; Postgres evaluates write policies independently, so it cannot grant any write.

`public.tenant_users` (manage-user routes) — unchanged:
- INSERT/UPDATE/DELETE require `is_tenant_parent_safe(...) OR is_super_admin_safe(...)`. Academy-only members are not tenant parents.

`public.users` — unchanged:
- Writes restricted to vivacity team / SuperAdmin / own row, with `user_protected_fields_unchanged_safe` guarding role and tenant fields.

No edits to `app.user_can_access_tenant`, so blast radius for every other tenant-scoped policy is preserved.

## Out of scope
No changes to `AcademyAccessGate`, `ClientTenantContext`, `useTenantAcademyAccess`, the SuperAdmin Tenant Access page, enrolment logic, or the Academy toggle.

## Verification
1. Academy-only user on `academy_access_enabled = true` tenant → `/academy` loads.
2. Academy-only user on `academy_access_enabled = false` tenant → still sees inactive Academy screen.
3. Academy-only user `UPDATE public.tenants …` → denied.
4. Academy-only user insert/update/delete on `public.tenant_users` → denied.
5. Academy-only user cannot access client portal manage-user / admin tools.
6. Full-access client user behaviour unchanged.
7. SuperAdmin `/superadmin/academy/tenant-access` unchanged.
8. Re-running the migration succeeds without duplicate-policy errors (DROP IF EXISTS + CREATE).
