
# NEW-002 — Rekey `pdp_cycles` tenant-admin SELECT policy to `relationship_role`

## Scope
Single RLS policy replacement on `public.pdp_cycles`. No data changes, no FK changes, no other tables, no other policies touched.

## Migration
- File: `supabase/migrations/20260513090001_pdp_cycles_tenant_admin_relationship_role.sql` (timestamp strictly after `20260513090000`)
- Wrapped in `BEGIN; … COMMIT;`
- Body:
  1. `DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles;`
  2. `CREATE POLICY "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles FOR SELECT USING (EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.tenant_id = pdp_cycles.tenant_id AND tu.access_scope = 'full' AND tu.relationship_role IN ('primary_contact','secondary_contact')));`

## Untouched policies (verified)
- `pdp_cycles: Vivacity staff manage all` (ALL)
- `pdp_cycles: manager views assigned` (SELECT)
- `pdp_cycles: users insert own` (INSERT)
- `pdp_cycles: users update own while open` (UPDATE)
- `pdp_cycles: users view own` (SELECT)

## Pre-checks
- Confirm `tenant_users.relationship_role` column exists and is the canonical field (per 12 May 2026 standard).
- Confirm policy `pdp_cycles: tenant admins view their tenant` currently uses boolean check.

## Post-check (run after apply, output included in reply)
```sql
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.pdp_cycles'::regclass
  AND polname = 'pdp_cycles: tenant admins view their tenant';
```
Expected: `using_expr` contains `relationship_role IN ('primary_contact', 'secondary_contact')` and does NOT contain `primary_contact = true`.

## Rollback
Re-create the policy with the original boolean expression `(tu.primary_contact = true) OR (tu.secondary_contact = true)`.

## Risk
Very low. Behavior parity expected because the boolean columns are now trigger-maintained mirrors of `relationship_role`; the new expression reads the canonical source directly.

Ready to implement on approval.
