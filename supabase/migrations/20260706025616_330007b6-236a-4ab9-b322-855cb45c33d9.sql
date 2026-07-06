-- M1b: Revoke unnecessary EXECUTE grant from authenticated
-- sync_tenant_lifecycle_status() is trigger-only (references OLD/NEW).
-- It will error if called directly via RPC, and fires automatically via
-- triggers regardless of grants. Therefore it does not need EXECUTE on
-- authenticated. service_role grant remains untouched.

REVOKE EXECUTE ON FUNCTION public.sync_tenant_lifecycle_status() FROM authenticated;

NOTIFY pgrst, 'reload schema';
