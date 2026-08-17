-- Published-course facilitator names are rendered by an authenticated Academy
-- UI through this SECURITY DEFINER helper. Remove public/anonymous direct RPC
-- access while retaining the existing authenticated and service-role contract.
REVOKE ALL ON FUNCTION public.get_academy_facilitator_names_safe(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_academy_facilitator_names_safe(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_academy_facilitator_names_safe(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_academy_facilitator_names_safe(uuid[]) TO service_role;
