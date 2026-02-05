-- ============================================================================
-- Fix Infinite RLS Recursion on eos_meetings (42P17)
-- Creates recursion-safe SECURITY DEFINER function and replaces all policies
-- ============================================================================

-- ============================================================================
-- 1. Create recursion-safe membership function (SECURITY DEFINER bypasses RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_vivacity_team_rls(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.user_uuid
    WHERE u.user_uuid = p_user_id
      AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
  );
$$;

COMMENT ON FUNCTION public.is_vivacity_team_rls(uuid) IS 
'Recursion-safe Vivacity Team membership check. SECURITY DEFINER bypasses RLS on users table. Use this in RLS policies to avoid infinite recursion.';

-- ============================================================================
-- 2. Fix eos_meetings RLS policies - remove all recursive ones
-- ============================================================================

-- Drop ALL potentially problematic policies on eos_meetings
DROP POLICY IF EXISTS "vivacity_team_can_view_level_10_meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "Vivacity team can view L10 meetings" ON public.eos_meetings;
DROP POLICY IF EXISTS "eos_meetings_select_staff" ON public.eos_meetings;
DROP POLICY IF EXISTS "Staff can view all meetings" ON public.eos_meetings;

-- Create clean, non-recursive policy for L10 meetings
CREATE POLICY "Vivacity team can view L10 meetings"
ON public.eos_meetings
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_team_rls(auth.uid())
  AND meeting_type::text = 'L10'
);

-- ============================================================================
-- 3. Fix eos_meeting_participants RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Vivacity team can view L10 participants" ON public.eos_meeting_participants;
DROP POLICY IF EXISTS "Vivacity team can manage L10 participants" ON public.eos_meeting_participants;

-- Recreate with recursion-safe function
CREATE POLICY "Vivacity team can view L10 participants"
ON public.eos_meeting_participants
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_team_rls(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.eos_meetings m
    WHERE m.id = eos_meeting_participants.meeting_id
    AND m.meeting_type::text = 'L10'
  )
);

CREATE POLICY "Vivacity team can manage L10 participants"
ON public.eos_meeting_participants
FOR ALL
TO authenticated
USING (
  public.is_vivacity_team_rls(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.eos_meetings m
    WHERE m.id = eos_meeting_participants.meeting_id
    AND m.meeting_type::text = 'L10'
  )
)
WITH CHECK (
  public.is_vivacity_team_rls(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.eos_meetings m
    WHERE m.id = eos_meeting_participants.meeting_id
    AND m.meeting_type::text = 'L10'
  )
);