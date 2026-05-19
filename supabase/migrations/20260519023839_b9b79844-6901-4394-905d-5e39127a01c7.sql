DROP POLICY IF EXISTS user_notifications_authenticated_insert
  ON public.user_notifications;

CREATE POLICY user_notifications_authenticated_insert
  ON public.user_notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_team_safe((SELECT auth.uid()))
  );