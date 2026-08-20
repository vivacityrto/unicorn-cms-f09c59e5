-- fn_resolve_renewal_period_id() introduced in
-- 20260820160000_time_entry_allocations_renewal_period_tagging.sql is an
-- internal helper only ever meant to be called from allocate_time_entry()/
-- fn_reallocate_time_entry() (both SECURITY DEFINER), never directly by a
-- client. Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION,
-- which PostgREST then exposes at /rest/v1/rpc/fn_resolve_renewal_period_id
-- to anon and authenticated - caught by get_advisors immediately after
-- applying that migration. Same pattern/precedent as
-- 20260817080000_revoke_anon_package_used_minutes_execute.sql for
-- fn_package_used_minutes(). Function owner still executes it fine when
-- called internally from within another SECURITY DEFINER function's body -
-- revoking here only closes the direct external RPC path.
REVOKE ALL ON FUNCTION public.fn_resolve_renewal_period_id(bigint, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_resolve_renewal_period_id(bigint, date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_resolve_renewal_period_id(bigint, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_renewal_period_id(bigint, date) TO service_role;
