-- Create accept_invitation_v2 RPC for atomic invitation acceptance
-- This function validates the token, creates tenant membership, and marks invitation as accepted

CREATE OR REPLACE FUNCTION public.accept_invitation_v2(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation record;
  v_tenant_role text;
  v_user_exists boolean;
BEGIN
  -- Validate inputs
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS', 'message', 'Missing required parameters');
  END IF;

  -- Find invitation by token hash
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
    AND status = 'pending';

  IF v_invitation IS NULL THEN
    -- Check if already accepted
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations 
      WHERE token_hash = p_token_hash AND status IN ('accepted', 'successful')
    ) INTO v_user_exists;
    
    IF v_user_exists THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED', 'message', 'Invitation already accepted');
    END IF;
    
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN', 'message', 'Invalid or expired invitation token');
  END IF;

  -- Check expiry
  IF v_invitation.expires_at < now() THEN
    -- Mark as expired
    UPDATE public.user_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = v_invitation.id;
    
    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', 'This invitation has expired');
  END IF;

  -- Map invitation unicorn_role to tenant_members role
  v_tenant_role := CASE v_invitation.unicorn_role
    WHEN 'Super Admin' THEN 'Admin'
    WHEN 'Admin' THEN 'Admin'
    WHEN 'General User' THEN 'General User'
    WHEN 'User' THEN 'General User'
    ELSE 'General User'
  END;

  -- Create or update tenant membership
  INSERT INTO public.tenant_members (
    id, user_id, tenant_id, role, status, joined_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_user_id, v_invitation.tenant_id, v_tenant_role, 'active', now(), now(), now()
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    joined_at = COALESCE(tenant_members.joined_at, now()),
    updated_at = now();

  -- Update users table with tenant_id if not set (for primary tenant association)
  UPDATE public.users
  SET tenant_id = v_invitation.tenant_id,
      updated_at = now()
  WHERE user_uuid = p_user_id
    AND (tenant_id IS NULL OR tenant_id = 0);

  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = p_user_id,
      updated_at = now()
  WHERE id = v_invitation.id;

  -- Audit log
  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id,
    p_user_id,
    'user_invitations',
    v_invitation.id,
    'invitation_accepted',
    'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email,
      'role', v_tenant_role,
      'tenant_id', v_invitation.tenant_id,
      'invitation_id', v_invitation.id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'SUCCESS',
    'tenant_id', v_invitation.tenant_id,
    'role', v_tenant_role,
    'message', 'Invitation accepted successfully'
  );
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.accept_invitation_v2(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_v2(text, uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.accept_invitation_v2 IS 'Atomically accepts an invitation: validates token, creates tenant membership, updates user record, and marks invitation as accepted. Returns JSON with ok, code, and details.';