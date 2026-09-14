-- Academy Solo MVP: close the explicit anon EXECUTE grants present in the
-- hosted Supabase role model. REVOKE FROM PUBLIC alone does not remove a
-- role-specific anon grant that was present when the function was created.
REVOKE ALL ON FUNCTION public.has_academy_access_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_academy_access_safe(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_academy_solo_account(text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_academy_solo_account(text, text, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_academy_enrollment(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_academy_enrollment(bigint) TO authenticated;
