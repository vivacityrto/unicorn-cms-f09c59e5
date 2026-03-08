-- Fix cascade_stage_recurring to use 'stages' table instead of deprecated 'documents_stages'
CREATE OR REPLACE FUNCTION public.cascade_stage_recurring(
  p_stage_id integer,
  p_is_recurring boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ps_count integer;
  v_si_count integer;
  v_stage_title text;
BEGIN
  -- Verify stage exists in the canonical 'stages' table
  SELECT name INTO v_stage_title
  FROM stages WHERE id = p_stage_id;

  IF v_stage_title IS NULL THEN
    RAISE EXCEPTION 'Stage % not found', p_stage_id;
  END IF;

  -- Update the stages registry
  UPDATE stages
  SET is_recurring = p_is_recurring
  WHERE id = p_stage_id;

  -- Cascade to all package_stages
  UPDATE package_stages
  SET is_recurring = p_is_recurring
  WHERE stage_id = p_stage_id;
  GET DIAGNOSTICS v_ps_count = ROW_COUNT;

  -- Cascade to all stage_instances for ACTIVE (non-complete) package instances only
  UPDATE stage_instances si
  SET is_recurring = p_is_recurring
  FROM package_instances pi
  WHERE si.stage_id = p_stage_id
    AND si.packageinstance_id = pi.id
    AND pi.is_complete = false;
  GET DIAGNOSTICS v_si_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'stage_title', v_stage_title,
    'package_stages_updated', v_ps_count,
    'stage_instances_updated', v_si_count
  );
END;
$$;