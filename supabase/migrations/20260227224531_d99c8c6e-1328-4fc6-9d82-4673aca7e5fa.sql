
-- RPC to cascade is_recurring from registry to all package_stages and stage_instances
CREATE OR REPLACE FUNCTION public.cascade_stage_recurring(
  p_stage_id bigint,
  p_is_recurring boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ps_count integer;
  v_si_count integer;
  v_stage_title text;
BEGIN
  -- Verify stage exists
  SELECT title INTO v_stage_title
  FROM documents_stages WHERE id = p_stage_id;

  IF v_stage_title IS NULL THEN
    RAISE EXCEPTION 'Stage % not found', p_stage_id;
  END IF;

  -- Update registry
  UPDATE documents_stages
  SET is_recurring = p_is_recurring
  WHERE id = p_stage_id;

  -- Cascade to all package_stages
  UPDATE package_stages
  SET is_recurring = p_is_recurring
  WHERE stage_id = p_stage_id;
  GET DIAGNOSTICS v_ps_count = ROW_COUNT;

  -- Cascade to all stage_instances
  UPDATE stage_instances
  SET is_recurring = p_is_recurring
  WHERE stage_id = p_stage_id;
  GET DIAGNOSTICS v_si_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'stage_title', v_stage_title,
    'package_stages_updated', v_ps_count,
    'stage_instances_updated', v_si_count
  );
END;
$$;

-- Grant to authenticated users (admin check done in app layer)
GRANT EXECUTE ON FUNCTION public.cascade_stage_recurring(bigint, boolean) TO authenticated;
