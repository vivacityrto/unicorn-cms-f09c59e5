-- `fn_package_used_minutes` is SECURITY DEFINER and accepts a sequential
-- package-instance id without a caller/tenant check. Preserve authenticated
-- integrations while removing the anonymous PostgREST execution path.
REVOKE ALL ON FUNCTION public.fn_package_used_minutes(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_package_used_minutes(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_package_used_minutes(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_package_used_minutes(bigint) TO service_role;
