REVOKE ALL ON FUNCTION public.user_staff_safe_fields_only_changed(public.users) FROM anon;
NOTIFY pgrst, 'reload schema';