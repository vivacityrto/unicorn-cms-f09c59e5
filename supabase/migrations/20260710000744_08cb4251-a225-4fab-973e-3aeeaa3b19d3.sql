DROP POLICY IF EXISTS "Vivacity team can view all timeline events" ON public.client_timeline_events;
DROP POLICY IF EXISTS "Vivacity team can insert timeline events" ON public.client_timeline_events;
DROP POLICY IF EXISTS client_timeline_events_vivacity_select ON public.client_timeline_events;
DROP POLICY IF EXISTS client_timeline_events_vivacity_insert ON public.client_timeline_events;

CREATE POLICY client_timeline_events_vivacity_select
  ON public.client_timeline_events
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET')
    )
  );

CREATE POLICY client_timeline_events_vivacity_insert
  ON public.client_timeline_events
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin','Team Leader','Team Member','Integrator','BGT','CSC','CET')
    )
  );