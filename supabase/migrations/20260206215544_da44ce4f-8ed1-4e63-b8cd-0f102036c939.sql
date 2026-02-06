-- =============================================
-- RLS Standardization: meeting_participants
-- Drop legacy policies and create standardized versions
-- =============================================

-- 1. DROP existing legacy policies
DROP POLICY IF EXISTS "Users can view participants of own meetings" ON public.meeting_participants;
DROP POLICY IF EXISTS "Users can view participants of shared meetings with details" ON public.meeting_participants;
DROP POLICY IF EXISTS "Users can insert participants to own meetings" ON public.meeting_participants;
DROP POLICY IF EXISTS "Users can delete participants from own meetings" ON public.meeting_participants;

-- 2. CREATE standardized policies

-- SELECT: Via parent meeting access (owner, shared viewer) or SuperAdmin
CREATE POLICY "meeting_participants_select"
ON public.meeting_participants
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND (
        m.owner_user_uuid = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.calendar_shares cs
          WHERE cs.owner_user_uuid = m.owner_user_uuid
            AND cs.viewer_user_uuid = auth.uid()
        )
      )
  )
  OR public.is_super_admin_safe(auth.uid())
);

-- INSERT: Meeting owner only
CREATE POLICY "meeting_participants_insert"
ON public.meeting_participants
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
);

-- UPDATE: Meeting owner or SuperAdmin
CREATE POLICY "meeting_participants_update"
ON public.meeting_participants
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);

-- DELETE: Meeting owner or SuperAdmin
CREATE POLICY "meeting_participants_delete"
ON public.meeting_participants
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);