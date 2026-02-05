-- Add meeting_scope column to distinguish Vivacity internal meetings from tenant meetings
ALTER TABLE public.eos_meetings
ADD COLUMN IF NOT EXISTS meeting_scope text NOT NULL DEFAULT 'vivacity_team';

-- Add comment explaining the column
COMMENT ON COLUMN public.eos_meetings.meeting_scope IS 'Scope of the meeting: vivacity_team for internal Vivacity meetings, tenant for client-scoped meetings';

-- Set all existing Level 10 and other EOS meetings to vivacity_team scope
-- (All current meetings are internal Vivacity meetings)
UPDATE public.eos_meetings
SET meeting_scope = 'vivacity_team'
WHERE meeting_scope IS DISTINCT FROM 'vivacity_team';

-- Also update agenda templates if they have a scope column
ALTER TABLE public.eos_agenda_templates
ADD COLUMN IF NOT EXISTS meeting_scope text NOT NULL DEFAULT 'vivacity_team';

-- Update helper function for RLS to check if user can access vivacity_team scoped meetings
CREATE OR REPLACE FUNCTION public.can_access_vivacity_meetings(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = user_id
      AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND COALESCE(u.archived, false) = false
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.can_access_vivacity_meetings(uuid) TO authenticated;

-- Update RLS on eos_meetings to be clearer about vivacity_team scope access
DROP POLICY IF EXISTS "Vivacity team can view vivacity_team meetings" ON public.eos_meetings;
CREATE POLICY "Vivacity team can view vivacity_team meetings"
ON public.eos_meetings
FOR SELECT
USING (
  -- Vivacity Team members can view all vivacity_team scoped meetings
  (meeting_scope = 'vivacity_team' AND can_access_vivacity_meetings(auth.uid()))
  OR
  -- SuperAdmins can view all meetings
  is_super_admin()
  OR
  -- Meeting participants can view their meetings
  EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees ema
    WHERE ema.meeting_id = eos_meetings.id
      AND ema.user_id = auth.uid()
  )
);

-- Note: Other existing RLS policies (is_vivacity_team_user, is_staff) already provide adequate coverage
-- This new policy adds explicit support for meeting_scope logic