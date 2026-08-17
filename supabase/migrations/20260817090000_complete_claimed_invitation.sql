-- `set-invite-password` claims a ghost-account invitation as `successful`
-- before changing the Supabase Auth password.  The ordinary invitation
-- completer only reads `pending` rows, so a ghost user could sign in and be
-- told success without their tenant membership being created.
--
-- Keep the claim (it is what makes the password token single-use), but
-- complete it atomically: lock the claimed row, temporarily restore the
-- in-transaction `pending` state, then reuse the canonical completer. Other
-- sessions cannot observe that temporary state before it is accepted.

CREATE OR REPLACE FUNCTION public.complete_claimed_invitation(
  p_token_hash text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_PARAMS',
      'message', 'Missing required parameters'
    );
  END IF;

  -- The browser caller must only complete its own invitation. This matches
  -- the canonical accept_invitation_v2 identity binding.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'IDENTITY_MISMATCH',
      'message', 'Invitation can only be accepted by the signed-in user'
    );
  END IF;

  SELECT status INTO v_status
  FROM public.user_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TOKEN',
      'message', 'Invalid invitation token'
    );
  END IF;

  IF v_status = 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_ACCEPTED',
      'message', 'Invitation already accepted'
    );
  END IF;

  IF v_status <> 'successful' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TOKEN',
      'message', 'Invitation has not been claimed for password activation'
    );
  END IF;

  UPDATE public.user_invitations
  SET status = 'pending', updated_at = now()
  WHERE token_hash = p_token_hash;

  RETURN public.accept_invitation_v2(p_token_hash, p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_claimed_invitation(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_claimed_invitation(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_claimed_invitation(text, uuid) IS
  'Atomically completes a single-use invitation claimed by set-invite-password for a signed-in ghost account.';
