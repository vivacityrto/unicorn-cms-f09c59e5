# Audit: 2026-06-10 — tenant-registry-links-rls-fix

**Trigger:** ad-hoc — CSC user reported Integrations tab showing "not linked" despite
Super Admin confirming the TGA link was active.
**Scope:** `tenant_registry_links` RLS policies only. No FK changes, no grant changes,
no application code changes. Gap 4 (`client_audit_log` INSERT rights for tenant Admins)
and write access for Vivacity non-SA/TL staff were assessed and intentionally left
out of scope.

## Findings

- `tenant_registry_links_tenant_select_own` used `users.tenant_id = tenant_registry_links.tenant_id`
  to gate SELECT. CSC-style users have access via `tenant_members`; `users.tenant_id` is NULL
  or unset for these users. Supabase RLS returned 0 rows, `registryLink` fell back to null,
  and `ClientIntegrationsTab` defaulted to `'not_linked'` at line 374.
- Super Admin saw the correct status because `tenant_registry_links_superadmin_all` (ALL policy,
  `unicorn_role IN ('Super Admin','Team Leader')`) is a separate, unrelated policy that was
  unaffected.
- No INSERT/UPDATE policy existed for tenant Admins. The "Verify TGA" button was already exposed
  to tenant Admins via `canVerifyTga` in `ClientDetail.tsx` but writes silently failed at the
  DB layer.
- `has_tenant_access_safe` and `has_tenant_admin_safe` are both `SECURITY DEFINER`,
  `SET row_security=off`, consistent with the pattern used by `tenant_profile` and other
  tenant-scoped tables.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `dceaacc0`: migration `20260610025642_f8b11442-98c8-43e1-9a50-b3aaf3d485f2.sql`
  applied — 1 SELECT policy replaced, 2 new policies (INSERT + UPDATE) added on
  `public.tenant_registry_links`. Post-deploy verification confirmed 4 policies present
  with correct predicates. No other files changed.

## Decisions

- Read scope: any active `tenant_members` row (matching `tenant_profile` model) — not
  Admin-only.
- Write scope: tenant Admins only (`has_tenant_admin_safe`) — not all members.
- Vivacity non-SA/TL staff writes intentionally excluded: their TGA verify path goes
  through the `tga-integration` edge function (service role, bypasses RLS). No change
  to that path.
- No DELETE policy for tenant Admins — only SA/TL can delete. Matches current behaviour.

## Open questions parked

- Gap 4: tenant Admins' INSERT rights on `client_audit_log` were not verified. If they
  lack them, the audit row in `setRegistryLinkStatus:563` will silently fail while the
  upsert succeeds. Confirm separately.
- `updated_by` in the upsert payload is client-supplied and not validated by RLS. Low risk
  for now; worth a trigger if audit fidelity on this table becomes important.

## Tag
audit-2026-06-10-tenant-registry-links-rls-fix
