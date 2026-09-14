-- Expose the invitation relationship to the public validation response so
-- the acceptance page can render Academy copy without granting anonymous
-- tenant-row access. The token remains the only lookup key.
CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', ui.id,
    'email', ui.email,
    'first_name', ui.first_name,
    'last_name', ui.last_name,
    'tenant_id', ui.tenant_id,
    'unicorn_role', ui.unicorn_role,
    'relationship_role', ui.relationship_role,
    'status', ui.status,
    'expires_at', ui.expires_at
  ) INTO v_result
  FROM public.user_invitations ui
  WHERE ui.token_hash = p_token_hash
    AND ui.status = 'pending'
    AND ui.expires_at > now()
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation token');
  END IF;
  RETURN v_result;
END;
$function$;
