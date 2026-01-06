-- Enhanced User Audit View with Computed Status Flags
-- v_user_audit: Returns comprehensive user audit data with computed flags

-- Drop existing view if exists
DROP VIEW IF EXISTS public.v_user_audit;

-- Create the comprehensive user audit view
CREATE OR REPLACE VIEW public.v_user_audit AS
WITH user_memberships AS (
  SELECT 
    tm.user_id,
    COUNT(*) FILTER (WHERE tm.status = 'active') as active_membership_count,
    COUNT(*) as total_membership_count,
    array_agg(DISTINCT tm.tenant_id) FILTER (WHERE tm.status = 'active') as tenant_ids,
    array_agg(DISTINCT tm.role) FILTER (WHERE tm.status = 'active') as roles
  FROM public.tenant_members tm
  GROUP BY tm.user_id
),
pending_invites AS (
  SELECT 
    lower(ui.email) as email_lower,
    ui.status as invite_status,
    ui.tenant_id as invite_tenant_id,
    ui.unicorn_role as invite_role
  FROM public.user_invitations ui
  WHERE ui.status IN ('pending', 'sent')
),
auth_users AS (
  SELECT 
    au.id as auth_id,
    au.email as auth_email,
    au.created_at as auth_created_at,
    au.last_sign_in_at
  FROM auth.users au
)
SELECT 
  u.user_uuid,
  u.email,
  u.first_name,
  u.last_name,
  u.unicorn_role,
  u.user_type,
  u.tenant_id,
  u.disabled,
  u.archived,
  u.created_at,
  u.last_sign_in_at,
  u.global_role,
  t.name as tenant_name,
  
  -- Computed flags
  CASE WHEN au.auth_id IS NOT NULL THEN true ELSE false END as auth_user_exists,
  true as app_user_row_exists, -- By definition, if we're in this query, the user row exists
  CASE WHEN lower(u.email) = lower(au.auth_email) THEN true 
       WHEN au.auth_email IS NULL THEN null 
       ELSE false END as email_match,
  CASE WHEN u.unicorn_role = 'Super Admin' OR u.global_role IS NOT NULL THEN true ELSE false END as has_global_role,
  COALESCE(um.total_membership_count, 0) as tenant_memberships_count,
  CASE WHEN COALESCE(um.active_membership_count, 0) > 0 THEN true ELSE false END as has_active_membership,
  CASE WHEN u.user_type IN ('Client Parent', 'Client Child') THEN true ELSE false END as has_parent_or_child,
  pi.invite_status as invitation_state,
  
  -- Computed overall status
  CASE 
    WHEN au.auth_id IS NULL THEN 'missing_auth'
    WHEN lower(u.email) != lower(COALESCE(au.auth_email, '')) THEN 'email_mismatch'
    WHEN u.unicorn_role != 'Super Admin' AND COALESCE(um.active_membership_count, 0) = 0 THEN 'no_membership'
    WHEN u.disabled THEN 'disabled'
    WHEN u.archived THEN 'archived'
    ELSE 'ok'
  END as computed_status,
  
  -- Array of all issues
  ARRAY_REMOVE(ARRAY[
    CASE WHEN au.auth_id IS NULL THEN 'missing_auth' END,
    CASE WHEN au.auth_email IS NOT NULL AND lower(u.email) != lower(au.auth_email) THEN 'email_mismatch' END,
    CASE WHEN u.unicorn_role != 'Super Admin' AND COALESCE(um.active_membership_count, 0) = 0 THEN 'no_membership' END,
    CASE WHEN u.disabled THEN 'disabled' END,
    CASE WHEN u.archived THEN 'archived' END
  ], NULL) as issues

FROM public.users u
LEFT JOIN auth_users au ON u.user_uuid = au.auth_id
LEFT JOIN public.tenants t ON u.tenant_id = t.id
LEFT JOIN user_memberships um ON u.user_uuid = um.user_id
LEFT JOIN pending_invites pi ON lower(u.email) = pi.email_lower;

-- Grant access to authenticated users (RLS will filter)
GRANT SELECT ON public.v_user_audit TO authenticated;

-- Create RPC to get user audit data with filters
CREATE OR REPLACE FUNCTION public.get_user_audit(
  p_role_filter text DEFAULT NULL,
  p_tenant_filter bigint DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  user_uuid uuid,
  email text,
  first_name text,
  last_name text,
  unicorn_role text,
  user_type text,
  tenant_id bigint,
  tenant_name text,
  disabled boolean,
  archived boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  auth_user_exists boolean,
  email_match boolean,
  has_global_role boolean,
  tenant_memberships_count bigint,
  has_active_membership boolean,
  has_parent_or_child boolean,
  invitation_state text,
  computed_status text,
  issues text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only SuperAdmin can access this function
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin only';
  END IF;

  RETURN QUERY
  SELECT 
    v.user_uuid,
    v.email,
    v.first_name,
    v.last_name,
    v.unicorn_role::text,
    v.user_type::text,
    v.tenant_id,
    v.tenant_name,
    v.disabled,
    v.archived,
    v.created_at,
    v.last_sign_in_at,
    v.auth_user_exists,
    v.email_match,
    v.has_global_role,
    v.tenant_memberships_count,
    v.has_active_membership,
    v.has_parent_or_child,
    v.invitation_state,
    v.computed_status,
    v.issues
  FROM public.v_user_audit v
  WHERE 
    (p_role_filter IS NULL OR v.unicorn_role::text = p_role_filter)
    AND (p_tenant_filter IS NULL OR v.tenant_id = p_tenant_filter)
    AND (p_status_filter IS NULL OR v.computed_status = p_status_filter)
    AND (p_search IS NULL OR 
         v.email ILIKE '%' || p_search || '%' OR
         v.first_name ILIKE '%' || p_search || '%' OR
         v.last_name ILIKE '%' || p_search || '%')
  ORDER BY v.created_at DESC;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_audit(text, bigint, text, text) TO authenticated;

-- Create RPC to fix user linkage for a specific user
CREATE OR REPLACE FUNCTION public.admin_fix_user_linkage(
  p_user_uuid uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_auth_email text;
  v_profile_email text;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  -- Only SuperAdmin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin only';
  END IF;

  -- Get auth user email
  SELECT email INTO v_auth_email 
  FROM auth.users 
  WHERE id = p_user_uuid;

  -- Get profile email
  SELECT email INTO v_profile_email
  FROM public.users
  WHERE user_uuid = p_user_uuid;

  -- If profile exists but email is null/different, update it
  IF v_profile_email IS NULL AND v_auth_email IS NOT NULL THEN
    UPDATE public.users
    SET email = v_auth_email, updated_at = now()
    WHERE user_uuid = p_user_uuid;
    
    v_changes := v_changes || jsonb_build_object('action', 'filled_email', 'value', v_auth_email);
  END IF;

  -- Log the action
  INSERT INTO public.audit_eos_events (
    tenant_id, entity, action, entity_id, user_id, details
  ) VALUES (
    319, -- Vivacity tenant
    'user_audit',
    'fix_linkage',
    p_user_uuid::text,
    auth.uid(),
    jsonb_build_object('changes', v_changes)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_uuid', p_user_uuid,
    'changes', v_changes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_user_linkage(uuid) TO authenticated;

-- Create RPC to set user role type
CREATE OR REPLACE FUNCTION public.admin_set_role_type(
  p_user_uuid uuid,
  p_role_type text,
  p_tenant_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_unicorn_role text;
  v_user_type text;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  -- Only SuperAdmin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: SuperAdmin only';
  END IF;

  -- Map role_type to DB fields
  CASE p_role_type
    WHEN 'superadmin_administrator' THEN
      v_unicorn_role := 'Super Admin';
      v_user_type := 'Vivacity';
    WHEN 'superadmin_team_leader' THEN
      v_unicorn_role := 'Super Admin';
      v_user_type := 'Vivacity Team';
    WHEN 'superadmin_general' THEN
      v_unicorn_role := 'User';
      v_user_type := 'Vivacity Team';
    WHEN 'tenant_parent' THEN
      v_unicorn_role := 'Admin';
      v_user_type := 'Client Parent';
    WHEN 'tenant_child' THEN
      v_unicorn_role := 'User';
      v_user_type := 'Client Child';
    ELSE
      RAISE EXCEPTION 'Invalid role_type: %', p_role_type;
  END CASE;

  -- Get old data for audit
  SELECT jsonb_build_object(
    'unicorn_role', unicorn_role,
    'user_type', user_type,
    'tenant_id', tenant_id
  ) INTO v_old_data
  FROM public.users
  WHERE user_uuid = p_user_uuid;

  -- Update user
  UPDATE public.users
  SET 
    unicorn_role = v_unicorn_role::public.unicorn_role,
    user_type = v_user_type::public.user_type_enum,
    tenant_id = CASE 
      WHEN p_role_type LIKE 'superadmin_%' THEN 319 -- Vivacity tenant
      ELSE p_tenant_id
    END,
    updated_at = now()
  WHERE user_uuid = p_user_uuid;

  v_new_data := jsonb_build_object(
    'unicorn_role', v_unicorn_role,
    'user_type', v_user_type,
    'tenant_id', CASE WHEN p_role_type LIKE 'superadmin_%' THEN 319 ELSE p_tenant_id END
  );

  -- Log the action
  INSERT INTO public.audit_eos_events (
    tenant_id, entity, action, entity_id, user_id, details
  ) VALUES (
    319,
    'user_audit',
    'set_role_type',
    p_user_uuid::text,
    auth.uid(),
    jsonb_build_object('before', v_old_data, 'after', v_new_data, 'role_type', p_role_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_uuid', p_user_uuid,
    'role_type', p_role_type,
    'before', v_old_data,
    'after', v_new_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_role_type(uuid, text, bigint) TO authenticated;