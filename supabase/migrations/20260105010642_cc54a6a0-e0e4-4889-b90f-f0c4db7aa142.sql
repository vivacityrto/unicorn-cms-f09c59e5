
-- Drop existing function first
DROP FUNCTION IF EXISTS public.transition_stage_state(bigint, text, text, uuid);

-- Recreate with correct return type
CREATE OR REPLACE FUNCTION public.transition_stage_state(
  p_stage_state_id bigint,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_tenant_id bigint;
  v_package_id bigint;
  v_stage_id bigint;
  v_is_required boolean;
BEGIN
  -- Get current state
  SELECT status, tenant_id, package_id, stage_id, is_required
  INTO v_old_status, v_tenant_id, v_package_id, v_stage_id, v_is_required
  FROM public.client_package_stage_state
  WHERE id = p_stage_state_id;

  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage state not found');
  END IF;

  -- Validate: can't skip required stages
  IF p_new_status = 'skipped' AND v_is_required THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot skip required stage');
  END IF;

  -- Validate: blocked/waiting require reason
  IF p_new_status IN ('blocked', 'waiting') AND (p_reason IS NULL OR p_reason = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason required for blocked/waiting status');
  END IF;

  -- Map 'active' to 'in_progress' for storage
  IF p_new_status = 'active' THEN
    p_new_status := 'in_progress';
  END IF;
  
  -- Map 'completed' to 'complete' for storage
  IF p_new_status = 'completed' THEN
    p_new_status := 'complete';
  END IF;

  -- Update the stage state
  UPDATE public.client_package_stage_state
  SET 
    status = p_new_status,
    updated_at = now(),
    updated_by = COALESCE(p_user_id, auth.uid()),
    started_at = CASE 
      WHEN p_new_status = 'in_progress' AND v_old_status = 'not_started' THEN now()
      ELSE started_at
    END,
    completed_at = CASE 
      WHEN p_new_status = 'complete' THEN now()
      WHEN v_old_status = 'complete' AND p_new_status != 'complete' THEN NULL
      ELSE completed_at
    END,
    blocked_at = CASE 
      WHEN p_new_status = 'blocked' THEN now()
      WHEN v_old_status = 'blocked' AND p_new_status != 'blocked' THEN NULL
      ELSE blocked_at
    END,
    blocked_reason = CASE 
      WHEN p_new_status = 'blocked' THEN p_reason
      WHEN v_old_status = 'blocked' AND p_new_status != 'blocked' THEN NULL
      ELSE blocked_reason
    END,
    waiting_at = CASE 
      WHEN p_new_status = 'waiting' THEN now()
      WHEN v_old_status = 'waiting' AND p_new_status != 'waiting' THEN NULL
      ELSE waiting_at
    END,
    waiting_reason = CASE 
      WHEN p_new_status = 'waiting' THEN p_reason
      WHEN v_old_status = 'waiting' AND p_new_status != 'waiting' THEN NULL
      ELSE waiting_reason
    END
  WHERE id = p_stage_state_id;

  -- Insert audit log entry
  INSERT INTO public.stage_audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    v_tenant_id,
    COALESCE(p_user_id, auth.uid()),
    'stage_state_updated',
    'client_package_stage_state',
    p_stage_state_id,
    jsonb_build_object(
      'package_id', v_package_id,
      'stage_id', v_stage_id,
      'old_state', v_old_status,
      'new_state', p_new_status,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END;
$$;

-- Create get_stage_progress RPC for dashboard rollups
DROP FUNCTION IF EXISTS public.get_stage_progress();

CREATE FUNCTION public.get_stage_progress()
RETURNS TABLE (
  tenant_id bigint,
  package_id bigint,
  total_stages int,
  completed_count int,
  active_count int,
  blocked_count int,
  percent_complete numeric,
  current_stage_name text,
  current_stage_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cpss.tenant_id,
    cpss.package_id,
    COUNT(*)::int AS total_stages,
    COUNT(*) FILTER (WHERE cpss.status = 'complete')::int AS completed_count,
    COUNT(*) FILTER (WHERE cpss.status IN ('in_progress', 'active'))::int AS active_count,
    COUNT(*) FILTER (WHERE cpss.status = 'blocked')::int AS blocked_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE cpss.status = 'complete')::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0
    END AS percent_complete,
    (
      SELECT ds.title 
      FROM public.client_package_stage_state cs
      JOIN public.documents_stages ds ON ds.id = cs.stage_id
      WHERE cs.tenant_id = cpss.tenant_id 
        AND cs.package_id = cpss.package_id
        AND cs.status NOT IN ('complete', 'skipped')
      ORDER BY cs.sort_order
      LIMIT 1
    ) AS current_stage_name,
    (
      SELECT cs.status 
      FROM public.client_package_stage_state cs
      WHERE cs.tenant_id = cpss.tenant_id 
        AND cs.package_id = cpss.package_id
        AND cs.status NOT IN ('complete', 'skipped')
      ORDER BY cs.sort_order
      LIMIT 1
    ) AS current_stage_status
  FROM public.client_package_stage_state cpss
  GROUP BY cpss.tenant_id, cpss.package_id;
$$;
