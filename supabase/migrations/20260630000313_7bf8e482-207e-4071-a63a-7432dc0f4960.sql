CREATE TABLE public.engagement_exit_interviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id uuid NOT NULL REFERENCES public.staff_engagements(id) ON DELETE CASCADE,
  responses jsonb NOT NULL DEFAULT '{}',
  is_submitted boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id)
);

GRANT ALL ON public.engagement_exit_interviews TO authenticated;
GRANT ALL ON public.engagement_exit_interviews TO service_role;

ALTER TABLE public.engagement_exit_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_admin_select" ON public.engagement_exit_interviews
  FOR SELECT TO authenticated
  USING (is_vivacity_admin_role());

CREATE POLICY "linked_user_insert" ON public.engagement_exit_interviews
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_engagements se
      WHERE se.id = engagement_exit_interviews.engagement_id
        AND se.linked_unicorn_user_id = auth.uid()
        AND se.type = 'offboarding'
    )
  );

CREATE POLICY "linked_user_update" ON public.engagement_exit_interviews
  FOR UPDATE TO authenticated
  USING (
    is_submitted = false AND
    EXISTS (
      SELECT 1 FROM public.staff_engagements se
      WHERE se.id = engagement_exit_interviews.engagement_id
        AND se.linked_unicorn_user_id = auth.uid()
        AND se.type = 'offboarding'
    )
  );

CREATE POLICY "linked_user_select" ON public.engagement_exit_interviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_engagements se
      WHERE se.id = engagement_exit_interviews.engagement_id
        AND se.linked_unicorn_user_id = auth.uid()
        AND se.type = 'offboarding'
    )
  );

CREATE TRIGGER update_engagement_exit_interviews_updated_at
  BEFORE UPDATE ON public.engagement_exit_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();