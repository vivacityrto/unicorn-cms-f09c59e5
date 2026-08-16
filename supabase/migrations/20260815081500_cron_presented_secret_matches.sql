-- service_role-only helper so edge functions can constant-time-ish compare
-- a presented cron credential against the vault values pg_cron actually
-- sends. Needed because vault.cron_function_jwt is a long-lived
-- service_role JWT and is not always identical to the current
-- SUPABASE_SERVICE_ROLE_KEY injected into the function environment.

CREATE OR REPLACE FUNCTION public.cron_presented_secret_matches(
  p_kind text,
  p_presented text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected text;
  secret_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN false;
  END IF;
  IF p_presented IS NULL OR length(p_presented) = 0 THEN
    RETURN false;
  END IF;
  IF p_kind = 'jwt' THEN
    secret_name := 'cron_function_jwt';
  ELSIF p_kind = 'invoke' THEN
    secret_name := 'cron_invoke_secret';
  ELSE
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO expected
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;

  IF expected IS NULL THEN
    RETURN false;
  END IF;

  -- Length mismatch is a definite no; still compare equal-length copies
  -- so a short presented value does not short-circuit on the first byte.
  IF length(expected) IS DISTINCT FROM length(p_presented) THEN
    RETURN false;
  END IF;
  RETURN expected = p_presented;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_presented_secret_matches(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_presented_secret_matches(text, text) TO service_role;
