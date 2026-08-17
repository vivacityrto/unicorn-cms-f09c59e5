-- REVOKE from role-specific grantees does not remove a pre-existing PUBLIC
-- grant. These helpers are not public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.lease_bulk_document_job_items(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_resolve_validation_trigger(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_validation_trigger(uuid, uuid) TO authenticated;
