-- Add tenant_id, related_entity, related_entity_id to messages table for tenant scoping
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS tenant_id integer REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS related_entity text,
  ADD COLUMN IF NOT EXISTS related_entity_id text;

-- Create index for tenant scoping
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON public.messages(tenant_id);

-- Enable RLS if not already
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own tenant messages
CREATE POLICY "Tenant members can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Vivacity staff can read all messages
CREATE POLICY "Staff can read all messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

-- Authenticated users can insert messages for their tenant
CREATE POLICY "Users can insert messages for their tenant"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Users can update is_read on their tenant messages
CREATE POLICY "Users can update messages in their tenant"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );
