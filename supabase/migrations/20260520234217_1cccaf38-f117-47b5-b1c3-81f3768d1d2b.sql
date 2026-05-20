-- BUG-005: restrict impersonator RPCs to authenticated users only
REVOKE EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) FROM anon;