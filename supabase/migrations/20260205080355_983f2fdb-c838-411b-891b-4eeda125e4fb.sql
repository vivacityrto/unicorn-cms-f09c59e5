-- Create is_vivacity_member with row_security=off (standalone)
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

-- Update policies to use the new function
DROP POLICY IF EXISTS "Vivacity can view L10 meetings" ON public.eos_meetings;
CREATE POLICY "Vivacity can view L10 meetings"
ON public.eos_meetings
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_member(auth.uid())
  AND meeting_type::text = 'L10'
);

DROP POLICY IF EXISTS "Vivacity can view L10 participants" ON public.eos_meeting_participants;
CREATE POLICY "Vivacity can view L10 participants"
ON public.eos_meeting_participants
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_member(auth.uid())
);