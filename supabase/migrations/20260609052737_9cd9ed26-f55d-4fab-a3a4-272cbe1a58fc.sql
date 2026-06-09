
-- =========================================================
-- Migration C: RLS helpers and check_permission
-- =========================================================

-- ---- Pre-flight: refuse to harden if it would lock anyone out
DO $$
DECLARE
  v_sa_missing  integer;
  v_vt_missing  integer;
  v_offending   text;
BEGIN
  SELECT count(*) INTO v_sa_missing
  FROM public.users
  WHERE unicorn_role = 'Super Admin'
    AND COALESCE(is_vivacity_internal,false) = false;
  IF v_sa_missing <> 0 THEN
    SELECT string_agg(user_uuid::text, ', ') INTO v_offending
    FROM public.users
    WHERE unicorn_role = 'Super Admin'
      AND COALESCE(is_vivacity_internal,false) = false;
    RAISE EXCEPTION
      'Migration C pre-flight: % Super Admin users missing is_vivacity_internal=true: %',
      v_sa_missing, v_offending;
  END IF;

  SELECT count(*) INTO v_vt_missing
  FROM public.users
  WHERE user_type = 'Vivacity Team'
    AND COALESCE(is_vivacity_internal,false) = false;
  IF v_vt_missing <> 0 THEN
    RAISE EXCEPTION
      'Migration C pre-flight: % Vivacity Team users missing is_vivacity_internal=true',
      v_vt_missing;
  END IF;
END $$;

-- =========================================================
-- C1. Harden is_vivacity_team_safe
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN (
        'Super Admin','Team Leader','Team Member',
        'Integrator','BGT','CSC','CET'
      )
      AND COALESCE(is_vivacity_internal,false) = true
      AND archived IS DISTINCT FROM true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_vivacity_team_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO authenticated, service_role;

-- =========================================================
-- C2. Harden is_super_admin_safe
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_super_admin_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND (
        unicorn_role = 'Super Admin'
        OR global_role = 'SuperAdmin'
      )
      AND COALESCE(is_vivacity_internal,false) = true
      AND archived IS DISTINCT FROM true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_super_admin_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin_safe(uuid) TO authenticated, service_role;

-- =========================================================
-- C3. is_team_leader_or_above
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_team_leader_or_above(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin','Team Leader')
      AND COALESCE(is_vivacity_internal,false) = true
      AND archived IS DISTINCT FROM true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_team_leader_or_above(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_leader_or_above(uuid) TO authenticated, service_role;

-- =========================================================
-- C4. is_integrator_or_above
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_integrator_or_above(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin','Team Leader','Integrator')
      AND COALESCE(is_vivacity_internal,false) = true
      AND archived IS DISTINCT FROM true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_integrator_or_above(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_integrator_or_above(uuid) TO authenticated, service_role;

-- =========================================================
-- C5. is_any_team_member
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_any_team_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN (
        'Super Admin','Team Leader','Team Member',
        'Integrator','BGT','CSC','CET'
      )
      AND COALESCE(is_vivacity_internal,false) = true
      AND archived IS DISTINCT FROM true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_any_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_any_team_member(uuid) TO authenticated, service_role;

-- =========================================================
-- C6. check_permission
-- =========================================================
CREATE OR REPLACE FUNCTION public.check_permission(
  p_user_id     uuid,
  p_feature_key text,
  p_min_level   text DEFAULT 'full'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'off'
AS $function$
DECLARE
  v_min_ord      integer;
  v_user_role    text;
  v_internal     boolean;
  v_archived     boolean;
  v_has_feature  boolean;
  v_granted      boolean;
BEGIN
  -- Validate requested level
  v_min_ord := CASE lower(p_min_level)
    WHEN 'none'       THEN 0
    WHEN 'owner_only' THEN 1
    WHEN 'limited'    THEN 2
    WHEN 'full'       THEN 3
    ELSE NULL
  END;
  IF v_min_ord IS NULL THEN
    RAISE EXCEPTION
      'check_permission: invalid p_min_level %, expected one of none|owner_only|limited|full',
      p_min_level;
  END IF;

  -- Super Admin always passes
  IF public.is_super_admin_safe(p_user_id) THEN
    RETURN true;
  END IF;

  -- Unknown feature → false (no exception; callers may probe)
  SELECT EXISTS (
    SELECT 1 FROM public.permission_features
    WHERE feature_key = p_feature_key
  ) INTO v_has_feature;
  IF NOT v_has_feature THEN
    RETURN false;
  END IF;

  -- Pull primary role / internal / archived in one shot
  SELECT u.unicorn_role,
         COALESCE(u.is_vivacity_internal,false),
         COALESCE(u.archived,false)
    INTO v_user_role, v_internal, v_archived
  FROM public.users u
  WHERE u.user_uuid = p_user_id;

  IF NOT FOUND OR v_archived THEN
    RETURN false;
  END IF;

  -- Effective roles = primary unicorn_role (if internal) ∪ active user_roles grants.
  -- Evaluate against role_permissions and compare ordinal levels.
  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.feature_key = p_feature_key
      AND CASE rp.level
            WHEN 'none'       THEN 0
            WHEN 'owner_only' THEN 1
            WHEN 'limited'    THEN 2
            WHEN 'full'       THEN 3
          END >= v_min_ord
      AND (
        -- Primary role, only counts if the user is internal staff
        (v_internal AND rp.role = v_user_role)
        OR
        -- Additional active grants from user_roles
        rp.role IN (
          SELECT ur.role
          FROM public.user_roles ur
          WHERE ur.user_uuid = p_user_id
            AND (ur.expires_at IS NULL OR ur.expires_at > now())
        )
      )
  ) INTO v_granted;

  RETURN COALESCE(v_granted, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_permission(uuid, text, text) TO authenticated, service_role;
