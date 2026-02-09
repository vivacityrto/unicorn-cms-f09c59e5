-- ============================================================
-- Security Fix: Add search_path to is_vivacity_internal_safe function
-- Issue: SUPA_function_search_path_mutable
-- Remediation: Set explicit search_path to prevent search_path injection
-- ============================================================

-- Recreate function with both security settings
CREATE OR REPLACE FUNCTION public.is_vivacity_internal_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_uuid = p_user_id
      AND u.is_vivacity_internal = true
      AND u.archived = false
  )
$$;

COMMENT ON FUNCTION public.is_vivacity_internal_safe IS 'Recursion-safe check for Vivacity internal staff access. Used in RLS policies for Ask Viv features. Fixed search_path for security.';

-- Also fix sync_is_vivacity_internal trigger function which was missing search_path
CREATE OR REPLACE FUNCTION public.sync_is_vivacity_internal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.is_vivacity_internal := NEW.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member');
  RETURN NEW;
END;
$$;