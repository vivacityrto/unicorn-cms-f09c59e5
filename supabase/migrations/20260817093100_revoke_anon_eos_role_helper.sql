-- A direct anon grant survives REVOKE ... FROM PUBLIC. The helper is only
-- needed by authenticated EOS policies and service-role maintenance paths.
REVOKE EXECUTE ON FUNCTION public.has_eos_role(uuid, bigint, public.eos_role) FROM anon;
