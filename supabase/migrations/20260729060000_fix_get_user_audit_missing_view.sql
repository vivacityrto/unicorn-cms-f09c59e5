-- get_user_audit has been 404ing since migration 20260106042554 dropped
-- public.v_user_audit (a security fix to stop exposing auth.users via a
-- queryable view) but never updated get_user_audit to stop reading from it.
-- That migration's own comment says the RPC "is already secure... and
-- doesn't expose auth.users directly" -- true of the RPC's output, but the
-- RPC body still referenced the now-dropped view, so every call has
-- returned `relation "public.v_user_audit" does not exist` (42P01) since
-- 2026-01-06.
--
-- Fix: inline the original view's query (from 20260106042524) directly
-- into the function body as a subquery instead of a standalone view. Same
-- data, same computed columns, no view object for anything else to query.
-- Verified all source tables/columns (tenant_members, user_invitations,
-- users, tenants, auth.users) are unchanged since the original view was
-- written.

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
  ),
  v AS (
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

      CASE WHEN au.auth_id IS NOT NULL THEN true ELSE false END as auth_user_exists,
      CASE WHEN lower(u.email) = lower(au.auth_email) THEN true
           WHEN au.auth_email IS NULL THEN null
           ELSE false END as email_match,
      CASE WHEN u.unicorn_role = 'Super Admin' OR u.global_role IS NOT NULL THEN true ELSE false END as has_global_role,
      COALESCE(um.total_membership_count, 0) as tenant_memberships_count,
      CASE WHEN COALESCE(um.active_membership_count, 0) > 0 THEN true ELSE false END as has_active_membership,
      CASE WHEN u.user_type IN ('Client Parent', 'Client Child') THEN true ELSE false END as has_parent_or_child,
      pi.invite_status as invitation_state,

      CASE
        WHEN au.auth_id IS NULL THEN 'missing_auth'
        WHEN lower(u.email) != lower(COALESCE(au.auth_email, '')) THEN 'email_mismatch'
        WHEN u.unicorn_role != 'Super Admin' AND COALESCE(um.active_membership_count, 0) = 0 THEN 'no_membership'
        WHEN u.disabled THEN 'disabled'
        WHEN u.archived THEN 'archived'
        ELSE 'ok'
      END as computed_status,

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
    LEFT JOIN pending_invites pi ON lower(u.email) = pi.email_lower
  )
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
  FROM v
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

GRANT EXECUTE ON FUNCTION public.get_user_audit(text, bigint, text, text) TO authenticated;
