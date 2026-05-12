CREATE TABLE IF NOT EXISTS public.audit_user_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_uuid  uuid,
  target_user_uuid uuid NOT NULL,
  action           text NOT NULL,
  reason           text,
  details          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_user_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS audit_user_events_actor_idx
  ON public.audit_user_events (actor_user_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_user_events_target_idx
  ON public.audit_user_events (target_user_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_user_events_created_idx
  ON public.audit_user_events (created_at DESC);

DROP POLICY IF EXISTS "audit_user_events_select_own" ON public.audit_user_events;
CREATE POLICY "audit_user_events_select_own"
  ON public.audit_user_events FOR SELECT TO authenticated
  USING (
    actor_user_uuid    = (SELECT auth.uid())
    OR target_user_uuid = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "audit_user_events_select_superadmin" ON public.audit_user_events;
CREATE POLICY "audit_user_events_select_superadmin"
  ON public.audit_user_events FOR SELECT TO authenticated
  USING (is_super_admin_safe((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
$$;