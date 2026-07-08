REVOKE EXECUTE ON FUNCTION public.retry_bulk_document_job(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stall_bulk_document_job(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_bulk_document_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stall_bulk_document_job(uuid, text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';