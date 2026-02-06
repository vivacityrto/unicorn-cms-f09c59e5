
-- ============================================================
-- Security Fix: Strengthen calendar_events RLS policies
-- Issue: calendar_events_privacy_breach
-- Pattern: Owner + Staff + Shared calendar access
-- ============================================================

-- 1. DROP existing policies
DROP POLICY IF EXISTS "Users can view own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Service role can manage calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_select_own" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_select_staff" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_select_shared" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_insert" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;

-- 2. SELECT: Owner can view their own events
CREATE POLICY "calendar_events_select_own"
ON public.calendar_events
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3. SELECT: SuperAdmin and Vivacity staff can view all events
CREATE POLICY "calendar_events_select_staff"
ON public.calendar_events
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- 4. SELECT: Users with calendar sharing access can view shared events
-- This respects the calendar_shares table for permission control
CREATE POLICY "calendar_events_select_shared"
ON public.calendar_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.calendar_shares cs
    WHERE cs.owner_user_uuid = calendar_events.user_id
      AND cs.viewer_user_uuid = auth.uid()
  )
);

-- 5. INSERT: Owner can insert their own events
CREATE POLICY "calendar_events_insert"
ON public.calendar_events
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- 6. UPDATE: Owner can update their own events
CREATE POLICY "calendar_events_update"
ON public.calendar_events
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- 7. DELETE: Owner or SuperAdmin can delete events
CREATE POLICY "calendar_events_delete"
ON public.calendar_events
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- Add documentation comment
COMMENT ON TABLE public.calendar_events IS 
'Calendar events synced from external providers (Outlook/Google). RLS enforces owner access, staff visibility, and calendar sharing permissions. Sensitive data is redacted in calendar_events_shared view for shared access.';
