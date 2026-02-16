
-- Phase 14: Internal AI Advisory Copilot

-- 1) Copilot Sessions
CREATE TABLE public.copilot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id bigint,
  stage_instance_id uuid,
  template_id uuid,
  context_mode text NOT NULL DEFAULT 'general',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  message_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_sessions_select_own"
  ON public.copilot_sessions FOR SELECT
  USING (auth.uid() = user_id AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "copilot_sessions_insert_own"
  ON public.copilot_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "copilot_sessions_update_own"
  ON public.copilot_sessions FOR UPDATE
  USING (auth.uid() = user_id AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "copilot_sessions_select_superadmin"
  ON public.copilot_sessions FOR SELECT
  USING (public.is_super_admin_safe(auth.uid()));

CREATE INDEX idx_copilot_sessions_user ON public.copilot_sessions(user_id);
CREATE INDEX idx_copilot_sessions_tenant ON public.copilot_sessions(tenant_id);

-- 2) Copilot Messages
CREATE TABLE public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'copilot', 'system')),
  message_content text NOT NULL,
  citations_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_messages_select_session_owner"
  ON public.copilot_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.copilot_sessions cs
      WHERE cs.id = session_id AND cs.user_id = auth.uid()
    )
    OR public.is_super_admin_safe(auth.uid())
  );

CREATE POLICY "copilot_messages_insert_session_owner"
  ON public.copilot_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.copilot_sessions cs
      WHERE cs.id = session_id AND cs.user_id = auth.uid()
    )
  );

CREATE INDEX idx_copilot_messages_session ON public.copilot_messages(session_id, created_at);

-- 3) Audit trigger
CREATE OR REPLACE FUNCTION public.fn_audit_copilot_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    TG_ARGV[0],
    'copilot_session',
    NEW.id::text,
    NEW.user_id,
    jsonb_build_object('context_mode', NEW.context_mode, 'tenant_id', NEW.tenant_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_copilot_session_start
  AFTER INSERT ON public.copilot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_copilot_session('copilot_session_started');
