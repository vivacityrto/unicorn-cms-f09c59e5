-- Add verified_at and verified_by columns to tenant_registry_links if not present
ALTER TABLE public.tenant_registry_links 
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by uuid;

-- Create or replace function to set TGA link with role-based auto-verification
CREATE OR REPLACE FUNCTION public.client_tga_link_set(
  p_tenant_id bigint,
  p_rto_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_is_super_admin boolean := false;
  v_is_tenant_admin boolean := false;
  v_new_status text;
  v_old_status text;
  v_result jsonb;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check if user is SuperAdmin (global_role = 'SuperAdmin')
  SELECT EXISTS(
    SELECT 1 FROM public.users 
    WHERE user_uuid = v_user_id AND global_role = 'SuperAdmin'
  ) INTO v_is_super_admin;

  -- Check if user is Admin for this tenant
  IF NOT v_is_super_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM public.tenant_members 
      WHERE user_id = v_user_id 
        AND tenant_id = p_tenant_id 
        AND role = 'Admin' 
        AND status = 'active'
    ) INTO v_is_tenant_admin;
    
    -- Verify user has access to this tenant at all
    IF NOT v_is_tenant_admin THEN
      IF NOT EXISTS(
        SELECT 1 FROM public.tenant_members 
        WHERE user_id = v_user_id 
          AND tenant_id = p_tenant_id 
          AND status = 'active'
      ) THEN
        RAISE EXCEPTION 'Access denied: no membership for this tenant';
      END IF;
    END IF;
  END IF;

  -- Get old status for audit
  SELECT link_status INTO v_old_status
  FROM public.tenant_registry_links
  WHERE tenant_id = p_tenant_id AND registry = 'tga';

  -- Determine new status based on role
  IF v_is_super_admin OR v_is_tenant_admin THEN
    v_new_status := 'linked';
  ELSE
    v_new_status := 'pending';
  END IF;

  -- Upsert the registry link
  INSERT INTO public.tenant_registry_links (
    tenant_id, 
    registry, 
    external_id, 
    link_status, 
    verified_at, 
    verified_by,
    updated_by,
    updated_at
  )
  VALUES (
    p_tenant_id,
    'tga',
    p_rto_number,
    v_new_status,
    CASE WHEN v_new_status = 'linked' THEN now() ELSE NULL END,
    CASE WHEN v_new_status = 'linked' THEN v_user_id ELSE NULL END,
    v_user_id,
    now()
  )
  ON CONFLICT (tenant_id, registry)
  DO UPDATE SET
    external_id = EXCLUDED.external_id,
    link_status = EXCLUDED.link_status,
    verified_at = CASE WHEN EXCLUDED.link_status = 'linked' THEN now() ELSE NULL END,
    verified_by = CASE WHEN EXCLUDED.link_status = 'linked' THEN v_user_id ELSE NULL END,
    updated_by = v_user_id,
    updated_at = now();

  -- Audit log
  INSERT INTO public.client_audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    p_tenant_id,
    v_user_id,
    'tga.link.set',
    'tenant_registry_links',
    p_tenant_id::text,
    jsonb_build_object(
      'rto_number', p_rto_number,
      'old_status', v_old_status,
      'new_status', v_new_status,
      'auto_verified', v_is_super_admin OR v_is_tenant_admin
    )
  );

  -- If auto-verified, also log verification event
  IF v_new_status = 'linked' THEN
    INSERT INTO public.client_audit_log (
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      details
    ) VALUES (
      p_tenant_id,
      v_user_id,
      'tga.link.verified',
      'tenant_registry_links',
      p_tenant_id::text,
      jsonb_build_object(
        'rto_number', p_rto_number,
        'verification_type', 'auto',
        'actor_role', CASE WHEN v_is_super_admin THEN 'SuperAdmin' ELSE 'Admin' END
      )
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'auto_verified', v_is_super_admin OR v_is_tenant_admin
  );

  RETURN v_result;
END;
$$;

-- Create or replace function to verify pending TGA link (Admin-only)
CREATE OR REPLACE FUNCTION public.client_tga_link_verify(
  p_tenant_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_is_super_admin boolean := false;
  v_is_tenant_admin boolean := false;
  v_current_status text;
  v_rto_number text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check if user is SuperAdmin
  SELECT EXISTS(
    SELECT 1 FROM public.users 
    WHERE user_uuid = v_user_id AND global_role = 'SuperAdmin'
  ) INTO v_is_super_admin;

  -- Check if user is Admin for this tenant
  IF NOT v_is_super_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM public.tenant_members 
      WHERE user_id = v_user_id 
        AND tenant_id = p_tenant_id 
        AND role = 'Admin' 
        AND status = 'active'
    ) INTO v_is_tenant_admin;
  END IF;

  -- Only SuperAdmin or Admin can verify
  IF NOT v_is_super_admin AND NOT v_is_tenant_admin THEN
    RAISE EXCEPTION 'Access denied: only SuperAdmin or Admin can verify TGA links';
  END IF;

  -- Get current link status
  SELECT link_status, external_id INTO v_current_status, v_rto_number
  FROM public.tenant_registry_links
  WHERE tenant_id = p_tenant_id AND registry = 'tga';

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'No TGA link found for this tenant';
  END IF;

  IF v_current_status = 'linked' THEN
    RETURN jsonb_build_object('success', true, 'status', 'linked', 'message', 'Already verified');
  END IF;

  -- Update to linked
  UPDATE public.tenant_registry_links
  SET 
    link_status = 'linked',
    verified_at = now(),
    verified_by = v_user_id,
    updated_by = v_user_id,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND registry = 'tga';

  -- Audit log
  INSERT INTO public.client_audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    p_tenant_id,
    v_user_id,
    'tga.link.verified',
    'tenant_registry_links',
    p_tenant_id::text,
    jsonb_build_object(
      'rto_number', v_rto_number,
      'previous_status', v_current_status,
      'verification_type', 'manual',
      'actor_role', CASE WHEN v_is_super_admin THEN 'SuperAdmin' ELSE 'Admin' END
    )
  );

  RETURN jsonb_build_object('success', true, 'status', 'linked');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.client_tga_link_set(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_tga_link_verify(bigint) TO authenticated;