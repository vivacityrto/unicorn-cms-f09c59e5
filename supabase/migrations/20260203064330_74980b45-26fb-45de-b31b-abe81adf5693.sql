-- Drop the duplicate INTEGER version of the function
DROP FUNCTION IF EXISTS public.admin_set_tenant_csc_assignment(INTEGER, UUID, BOOLEAN, TEXT);

-- Recreate the function with correct BIGINT type and updated staff_teams logic
CREATE OR REPLACE FUNCTION public.admin_set_tenant_csc_assignment(
  p_tenant_id BIGINT,
  p_csc_user_id UUID,
  p_is_primary BOOLEAN DEFAULT TRUE,
  p_role_label TEXT DEFAULT 'CSC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_is_csc BOOLEAN;
  v_staff_teams TEXT[];
  v_staff_team TEXT;
BEGIN
  -- Check if actor is SuperAdmin
  SELECT public.is_super_admin() INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only SuperAdmin can manage CSC assignments');
  END IF;
  
  -- Check if user is a CSC using staff_teams array, legacy staff_team, or is_csc flag
  SELECT is_csc, staff_teams, staff_team 
  INTO v_is_csc, v_staff_teams, v_staff_team 
  FROM public.users 
  WHERE user_uuid = p_csc_user_id;
  
  IF NOT (
    COALESCE(v_is_csc, FALSE) OR 
    v_staff_team = 'client_success' OR 
    'client_success' = ANY(COALESCE(v_staff_teams, ARRAY[]::TEXT[]))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not marked as Client Success team member');
  END IF;
  
  -- If setting as primary, unset other primaries first
  IF p_is_primary THEN
    UPDATE public.tenant_csc_assignments
    SET is_primary = FALSE, updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND is_primary = TRUE;
  END IF;
  
  -- Upsert assignment
  INSERT INTO public.tenant_csc_assignments (tenant_id, csc_user_id, is_primary, role_label, updated_at)
  VALUES (p_tenant_id, p_csc_user_id, p_is_primary, p_role_label, NOW())
  ON CONFLICT (tenant_id, csc_user_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    role_label = EXCLUDED.role_label,
    updated_at = NOW();
  
  -- Audit log
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('set_assignment', 'tenant_csc_assignment', p_tenant_id::text, v_actor_id, jsonb_build_object(
    'tenant_id', p_tenant_id,
    'csc_user_id', p_csc_user_id,
    'is_primary', p_is_primary,
    'role_label', p_role_label
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;