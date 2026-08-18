-- Follow-up to the 2026-08-17 and 2026-08-18 SECURITY DEFINER entries: Carl
-- confirmed there is no external integration depending on
-- fn_package_used_minutes(bigint), so the previously-parked open question
-- is now resolved -- revoke the remaining authenticated grant, matching
-- the 15 other no-caller functions fixed on 2026-08-18.
REVOKE EXECUTE ON FUNCTION public.fn_package_used_minutes(bigint) FROM authenticated;
