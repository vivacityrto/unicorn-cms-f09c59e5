-- Security fix: is_super_admin_safe / has_permission / check_permission --
-- the three core RBAC v6 authorization primitives -- did not consistently
-- exclude disabled/archived accounts, even though disabling or archiving a
-- user never revokes their existing Supabase Auth session
-- (rpc_set_client_account_status only flips public.users.disabled; it
-- never touches auth.users). Confirmed live and exploitable 2026-09-15:
-- sam@vivacity.com.au (unicorn_role 'CSC', disabled=true, archived=false)
-- currently holds 'full'-level role_permissions grants across many
-- feature keys (clients.emails.manage, eos.rocks.*, packages.*,
-- resource_hub.upload, staff.*, etc.) that has_permission() would still
-- grant to any still-valid session for that account, because its
-- role_permissions lookup never filtered on the calling user's own
-- disabled/archived status at all.
--
-- Three distinct gaps, all in the same three functions:
--   1. is_super_admin_safe(uuid): checked `archived` but never `disabled`.
--      This function is also the unconditional SA-bypass inside both
--      has_permission() and check_permission(), so the gap propagated
--      into every caller of either.
--   2. has_permission(text, text): the non-SA role_permissions lookup
--      (primary unicorn_role UNION user_roles grants) never checked
--      archived OR disabled on the calling user at all.
--   3. check_permission(uuid, text, text): its own non-SA path checked
--      archived but never disabled.
--
-- Fix is purely restrictive (removes access only from accounts that
-- should never have had it) -- verified zero regression risk by checking
-- there is no currently-disabled-or-archived account whose access this
-- migration is needed for; the only rows affected are exactly the
-- disabled/archived accounts this closes the gap for.
--
-- Same signatures as the live functions -- CREATE OR REPLACE is safe,
-- no DROP FUNCTION needed (confirmed via pg_get_function_identity_arguments
-- before writing this migration).

CREATE OR REPLACE FUNCTION public.is_super_admin_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
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
      AND COALESCE(disabled, false) = false
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_feature_key text,
  p_min_level text DEFAULT 'limited'::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_super_admin_safe(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_uuid = auth.uid()
          AND COALESCE(u.archived, false) = false
          AND COALESCE(u.disabled, false) = false
      )
      AND EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.feature_key = p_feature_key
          AND (CASE rp.level WHEN 'full' THEN 3 WHEN 'limited' THEN 2 WHEN 'owner_only' THEN 1 ELSE 0 END)
              >= (CASE p_min_level WHEN 'full' THEN 3 WHEN 'limited' THEN 2 WHEN 'owner_only' THEN 1 ELSE 0 END)
          AND rp.role IN (
            SELECT unicorn_role FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role IS NOT NULL
            UNION
            SELECT role FROM public.user_roles WHERE user_uuid = auth.uid()
          )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.check_permission(p_user_id uuid, p_feature_key text, p_min_level text DEFAULT 'full'::text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $function$
DECLARE
  v_min_ord      integer;
  v_user_role    text;
  v_internal     boolean;
  v_archived     boolean;
  v_disabled     boolean;
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

  -- Super Admin always passes (is_super_admin_safe itself now also
  -- excludes disabled accounts, closing the same gap here transitively)
  IF public.is_super_admin_safe(p_user_id) THEN
    RETURN true;
  END IF;

  -- Unknown feature -> false (no exception; callers may probe)
  SELECT EXISTS (
    SELECT 1 FROM public.permission_features
    WHERE feature_key = p_feature_key
  ) INTO v_has_feature;
  IF NOT v_has_feature THEN
    RETURN false;
  END IF;

  -- Pull primary role / internal / archived / disabled in one shot
  SELECT u.unicorn_role,
         COALESCE(u.is_vivacity_internal,false),
         COALESCE(u.archived,false),
         COALESCE(u.disabled,false)
    INTO v_user_role, v_internal, v_archived, v_disabled
  FROM public.users u
  WHERE u.user_uuid = p_user_id;

  IF NOT FOUND OR v_archived OR v_disabled THEN
    RETURN false;
  END IF;

  -- Effective roles = primary unicorn_role (if internal) union active user_roles grants.
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
