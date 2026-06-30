ALTER VIEW public.v_admin_zero_progress_packages SET (security_invoker = true);
ALTER VIEW public.v_client_dashboard_progress    SET (security_invoker = true);
ALTER VIEW public.v_client_home_feed             SET (security_invoker = true);
ALTER VIEW public.v_client_package_dashboard     SET (security_invoker = true);
ALTER VIEW public.v_client_package_stages        SET (security_invoker = true);
ALTER VIEW public.v_phase_progress_summary       SET (security_invoker = true);
SELECT pg_notify('pgrst', 'reload schema');