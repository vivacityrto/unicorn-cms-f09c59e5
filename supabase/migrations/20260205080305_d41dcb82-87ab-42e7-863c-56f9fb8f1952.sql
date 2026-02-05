-- ============================================================================
-- Hard-fix EOS Meetings RLS recursion (42P17)
-- Creates is_vivacity_member with row_security=off and minimal policy replace
-- ============================================================================

-- ============================================================================
-- Step 1: Create recursion-safe membership function with row_security = off
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_vivacity_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users au
    JOIN public.users u
      ON u.user_uuid = au.id
    WHERE au.id = p_user_id
      AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
  );
$$;

REVOKE ALL ON FUNCTION public.is_vivacity_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_vivacity_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_vivacity_member(uuid) IS 
'Recursion-safe Vivacity Team check. Uses SECURITY DEFINER + row_security=off to bypass RLS. Use in RLS policies to prevent infinite recursion.';

-- ============================================================================
-- Step 2: Drop ONLY the problematic EOS meetings policies that use is_vivacity_team
-- Keep any tenant-scoped or other non-Vivacity policies
-- ============================================================================

DROP POLICY IF EXISTS "Vivacity team can view L10 meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "vivacity_team_can_view_level_10_meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "eos_meetings_select_staff" ON public.eos_meetings;
DROP POLICY IF EXISTS "Staff can view all meetings" ON public.eos_meetings;

-- Create clean SELECT policy for L10 using new function
CREATE POLICY "Vivacity can view L10 meetings"
ON public.eos_meetings
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_member(auth.uid())
  AND meeting_type::text = 'L10'
);

-- ============================================================================
-- Step 3: Drop ONLY the problematic EOS meeting participants policies
-- ============================================================================

DROP POLICY IF EXISTS "Vivacity team can view L10 participants" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "Vivacity team can manage L10 participants" ON public.eos_meeting_participants;

-- Create clean SELECT policy for participants using new function
CREATE POLICY "Vivacity can view L10 participants"
ON public.eos_meeting_participants
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_member(auth.uid())
);