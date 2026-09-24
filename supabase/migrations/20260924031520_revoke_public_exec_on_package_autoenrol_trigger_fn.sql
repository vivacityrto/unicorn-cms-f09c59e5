-- Trigger-only function; never meant to be invoked directly via RPC.
-- Flagged by mcp__supabase__get_advisors (anon_security_definer_function_executable,
-- authenticated_security_definer_function_executable) after the previous
-- migration's CREATE OR REPLACE reset its grants.
revoke execute on function public.fn_academy_autoenrol_on_package_instance() from public;
revoke execute on function public.fn_academy_autoenrol_on_package_instance() from anon;
revoke execute on function public.fn_academy_autoenrol_on_package_instance() from authenticated;
