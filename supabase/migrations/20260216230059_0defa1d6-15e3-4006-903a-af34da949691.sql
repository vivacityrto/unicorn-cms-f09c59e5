
-- Phase 17: Client-Facing Guided AI Companion

-- 1) client_ai_sessions
CREATE TABLE public.client_ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage_instance_id bigint,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'orientation'
    CHECK (mode IN ('orientation','evidence_prep','active_build')),
  message_count int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX idx_cas_tenant ON public.client_ai_sessions(tenant_id);
CREATE INDEX idx_cas_user ON public.client_ai_sessions(user_id);

ALTER TABLE public.client_ai_sessions ENABLE ROW LEVEL SECURITY;

-- Clients see own sessions
CREATE POLICY "client_own_sessions_select"
  ON public.client_ai_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "client_own_sessions_insert"
  ON public.client_ai_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_own_sessions_update"
  ON public.client_ai_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Vivacity staff can view all (CSC visibility)
CREATE POLICY "vivacity_staff_select_client_ai_sessions"
  ON public.client_ai_sessions FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

-- Service role insert (edge function)
CREATE POLICY "service_insert_client_ai_sessions"
  ON public.client_ai_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service_update_client_ai_sessions"
  ON public.client_ai_sessions FOR UPDATE
  USING (true);

-- 2) client_ai_messages
CREATE TABLE public.client_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.client_ai_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  message_content text NOT NULL,
  citations_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cam_session ON public.client_ai_messages(session_id);

ALTER TABLE public.client_ai_messages ENABLE ROW LEVEL SECURITY;

-- Clients see own messages (via session ownership)
CREATE POLICY "client_own_messages_select"
  ON public.client_ai_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_ai_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- Vivacity staff can view
CREATE POLICY "vivacity_staff_select_client_ai_messages"
  ON public.client_ai_messages FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

-- Service role insert
CREATE POLICY "service_insert_client_ai_messages"
  ON public.client_ai_messages FOR INSERT
  WITH CHECK (true);

-- 3) Audit trigger
CREATE OR REPLACE FUNCTION public.fn_audit_client_ai_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'client_ai_session_started',
    'client_ai_sessions',
    NEW.id::text,
    NEW.user_id,
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'mode', NEW.mode,
      'stage_instance_id', NEW.stage_instance_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_client_ai_session
  AFTER INSERT ON public.client_ai_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_client_ai_session();
