-- Reconciliation: formalize live EXECUTE grants for add_package_to_tenant
-- (14 Jul 2026 Unicorn security audit follow-up — keeper-repo drift).
-- Live: has_function_privilege('anon', ..., 'EXECUTE') = false.
-- Signature matches CREATE in 20251203051737_9194d9e4-8d56-499c-be63-ca305624886a.sql
-- and generated types (p_tenant_id bigint, p_package_id bigint).
-- Intended as a no-op against current production privilege state.

REVOKE ALL ON FUNCTION public.add_package_to_tenant(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_package_to_tenant(bigint, bigint) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
