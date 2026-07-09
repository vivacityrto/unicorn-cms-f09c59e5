REVOKE EXECUTE ON FUNCTION public.rpc_set_client_account_status(uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_client_account_status(uuid, boolean) TO authenticated;