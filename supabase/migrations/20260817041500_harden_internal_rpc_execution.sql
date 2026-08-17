-- The document worker is the only caller of this leasing helper. A later
-- CREATE OR REPLACE lost its original explicit revocation.
REVOKE EXECUTE ON FUNCTION public.lease_bulk_document_job_items(uuid, text, integer)
  FROM anon, authenticated;

-- Validation resolution is a staff workflow. Do not trust the caller-supplied
-- p_resolved_by value; derive the actor from the verified database JWT.
CREATE OR REPLACE FUNCTION public.rpc_resolve_validation_trigger(
  p_trigger_id uuid,
  p_resolved_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tool_id uuid;
  v_remaining integer;
  v_last_validated date;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_vivacity_team_safe(v_actor_id) THEN
    RAISE EXCEPTION 'Not authorized to resolve validation triggers' USING ERRCODE = '42501';
  END IF;

  UPDATE public.validation_trigger_events
  SET resolved_at = now(),
      resolved_by = v_actor_id
  WHERE id = p_trigger_id AND resolved_at IS NULL
  RETURNING tool_id INTO v_tool_id;

  IF v_tool_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trigger not found or already resolved');
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.validation_trigger_events
  WHERE tool_id = v_tool_id AND resolved_at IS NULL;

  SELECT last_validated_at INTO v_last_validated
  FROM public.validation_tools WHERE id = v_tool_id;

  IF v_remaining = 0 AND v_last_validated IS NOT NULL THEN
    UPDATE public.validation_tools
    SET validation_required = false,
        validation_required_reason = NULL,
        updated_at = now()
    WHERE id = v_tool_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'tool_id', v_tool_id, 'remaining_triggers', v_remaining);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_resolve_validation_trigger(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_validation_trigger(uuid, uuid) TO authenticated;
