
-- Create help_threads table for tenant-scoped Help Center conversations
CREATE TABLE public.help_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('chatbot', 'csc', 'support')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create help_messages table
CREATE TABLE public.help_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.help_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'staff')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_help_threads_tenant_id ON public.help_threads(tenant_id);
CREATE INDEX idx_help_threads_user_id ON public.help_threads(user_id);
CREATE INDEX idx_help_threads_channel ON public.help_threads(channel);
CREATE INDEX idx_help_messages_thread_id ON public.help_messages(thread_id);
CREATE INDEX idx_help_messages_sender_id ON public.help_messages(sender_id);

-- Enable RLS
ALTER TABLE public.help_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_messages ENABLE ROW LEVEL SECURITY;

-- RLS: help_threads SELECT - own threads OR Vivacity staff with tenant access
CREATE POLICY "help_threads_select"
  ON public.help_threads FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_vivacity_team_safe(auth.uid())
  );

-- RLS: help_threads INSERT - own threads only
CREATE POLICY "help_threads_insert"
  ON public.help_threads FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND has_tenant_access_safe(tenant_id, auth.uid())
  );

-- RLS: help_threads UPDATE - own threads or Vivacity staff
CREATE POLICY "help_threads_update"
  ON public.help_threads FOR UPDATE
  USING (
    auth.uid() = user_id
    OR is_vivacity_team_safe(auth.uid())
  );

-- RLS: help_messages SELECT - thread owner or Vivacity staff
CREATE POLICY "help_messages_select"
  ON public.help_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.help_threads t
      WHERE t.id = thread_id
      AND (t.user_id = auth.uid() OR is_vivacity_team_safe(auth.uid()))
    )
  );

-- RLS: help_messages INSERT - thread owner or Vivacity staff can add messages
CREATE POLICY "help_messages_insert"
  ON public.help_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.help_threads t
      WHERE t.id = thread_id
      AND (t.user_id = auth.uid() OR is_vivacity_team_safe(auth.uid()))
    )
  );

-- Trigger: auto-update updated_at on help_threads
CREATE TRIGGER update_help_threads_updated_at
  BEFORE UPDATE ON public.help_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
