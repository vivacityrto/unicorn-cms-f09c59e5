-- The 2026-08-25 hide_system_accounts_from_staff_lists migration added
-- public.users.is_system_account but never granted authenticated SELECT on
-- it. public.users uses per-column grants (not a table-wide SELECT grant),
-- so every frontend query that added a `.eq('is_system_account', false)`
-- filter in that same PR started returning 403 for every logged-in user
-- (anon and service_role already had the grant; authenticated did not).
GRANT SELECT (is_system_account) ON public.users TO authenticated;
