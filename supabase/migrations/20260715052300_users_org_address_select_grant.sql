-- Task #23 (14 Jul 2026 Unicorn security audit follow-up): street_address and
-- po_box_address on public.users had no column-level SELECT grant for the authenticated
-- role -- discovered while verifying the C2 REVOKE, and confirmed this predates C2 and
-- all of today's other migrations. These two columns are purely organisational
-- RTO/tenant business-address fields, not personal contact info (product decision, 14
-- Jul 2026: "we do not need their personal address in Unicorn"). TeamSettings.tsx
-- explicitly selects street_address directly, and TenantDetail.tsx's narrowed column
-- list (merged as part of PR #6/C2) deliberately keeps po_box_address -- both were
-- broken for any authenticated user without this grant.
-- Restoring column SELECT for authenticated; row-level access is still governed by the
-- existing RLS SELECT policies on users (users_select_own, users_select_staff,
-- users_select_same_tenant, users_select_assigned_csc, users_manage_superadmin -- none
-- apply to anon, confirmed), this only restores column-level access for rows RLS
-- already permits.
-- Applied directly to production 15 Jul 2026 and verified via has_column_privilege;
-- this migration is a no-op against current live behavior.
GRANT SELECT (street_address, po_box_address) ON public.users TO authenticated;
NOTIFY pgrst, 'reload schema';
