-- =============================================================
-- FIX EOS MEETINGS INFINITE RLS RECURSION (42P17)
-- =============================================================
-- This migration creates recursion-safe helpers and replaces all
-- problematic RLS policies on eos_meetings, eos_meeting_participants,
-- and eos_meeting_attendees with clean workspace-based policies.
-- =============================================================

-- STEP 1: Create recursion-safe helper functions
-- -----------------------------------------------

-- 1a. Membership check that bypasses RLS completely
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users au
    JOIN public.users u ON u.user_uuid = au.id
    WHERE au.id = p_user_id
      AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
  );
$$;

-- 1b. Workspace ID getter that bypasses RLS completely  
CREATE OR REPLACE FUNCTION public.get_vivacity_workspace_id_safe()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id FROM public.eos_workspaces WHERE slug = 'vivacity' LIMIT 1;
$$;

-- Grant execute only to authenticated users
REVOKE ALL ON FUNCTION public.is_vivacity_team_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_vivacity_workspace_id_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vivacity_workspace_id_safe() TO authenticated;

-- STEP 2: Drop ALL existing policies on target tables
-- ----------------------------------------------------

-- Drop all policies on eos_meetings
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE schemaname = 'public' AND tablename = 'eos_meetings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.eos_meetings;', r.policyname);
  END LOOP;
END $$;

-- Drop all policies on eos_meeting_participants
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE schemaname = 'public' AND tablename = 'eos_meeting_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.eos_meeting_participants;', r.policyname);
  END LOOP;
END $$;

-- Drop all policies on eos_meeting_attendees
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE schemaname = 'public' AND tablename = 'eos_meeting_attendees'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.eos_meeting_attendees;', r.policyname);
  END LOOP;
END $$;

-- STEP 3: Create clean workspace-based policies
-- ----------------------------------------------

-- Ensure RLS is enabled on all tables
ALTER TABLE public.eos_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_meeting_attendees ENABLE ROW LEVEL SECURITY;

-- 3a. eos_meetings Policies
-- SELECT: Vivacity team can view meetings in vivacity workspace
CREATE POLICY "vivacity_select_meetings"
ON public.eos_meetings FOR SELECT TO authenticated
USING (
  public.is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id_safe())
);

-- INSERT: Vivacity team can create meetings in vivacity workspace
CREATE POLICY "vivacity_insert_meetings"
ON public.eos_meetings FOR INSERT TO authenticated
WITH CHECK (
  public.is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id_safe())
);

-- UPDATE: Vivacity team can update their workspace meetings
CREATE POLICY "vivacity_update_meetings"
ON public.eos_meetings FOR UPDATE TO authenticated
USING (
  public.is_vivacity_team_safe(auth.uid()) 
  AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id_safe())
)
WITH CHECK (
  public.is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id_safe())
);

-- DELETE: Vivacity team can delete their workspace meetings
CREATE POLICY "vivacity_delete_meetings"
ON public.eos_meetings FOR DELETE TO authenticated
USING (
  public.is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = public.get_vivacity_workspace_id_safe())
);

-- 3b. eos_meeting_participants Policies
-- SELECT: Vivacity team can view all participants
CREATE POLICY "vivacity_select_participants"
ON public.eos_meeting_participants FOR SELECT TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));

-- INSERT: Vivacity team can add participants
CREATE POLICY "vivacity_insert_participants"
ON public.eos_meeting_participants FOR INSERT TO authenticated
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- UPDATE: Vivacity team can update participants
CREATE POLICY "vivacity_update_participants"
ON public.eos_meeting_participants FOR UPDATE TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- DELETE: Vivacity team can remove participants
CREATE POLICY "vivacity_delete_participants"
ON public.eos_meeting_participants FOR DELETE TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));

-- 3c. eos_meeting_attendees Policies
-- SELECT: Vivacity team can view all attendees
CREATE POLICY "vivacity_select_attendees"
ON public.eos_meeting_attendees FOR SELECT TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));

-- INSERT: Vivacity team can add attendees
CREATE POLICY "vivacity_insert_attendees"
ON public.eos_meeting_attendees FOR INSERT TO authenticated
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- UPDATE: Vivacity team can update attendees
CREATE POLICY "vivacity_update_attendees"
ON public.eos_meeting_attendees FOR UPDATE TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- DELETE: Vivacity team can remove attendees
CREATE POLICY "vivacity_delete_attendees"
ON public.eos_meeting_attendees FOR DELETE TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));