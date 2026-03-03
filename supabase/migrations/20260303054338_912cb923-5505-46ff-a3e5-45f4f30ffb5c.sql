
-- Sprint 3A: Document Acknowledgements table
CREATE TABLE public.document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL,
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

-- Enable RLS
ALTER TABLE public.document_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Tenant members can view acknowledgements within their tenant
CREATE POLICY "Tenant members can view acknowledgements"
  ON public.document_acknowledgements
  FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()));

-- Users can insert their own acknowledgements
CREATE POLICY "Users can acknowledge documents"
  ON public.document_acknowledgements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = (SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid())
  );

-- SuperAdmins can view all
CREATE POLICY "SuperAdmins can view all acknowledgements"
  ON public.document_acknowledgements
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()));

-- Index for performance
CREATE INDEX idx_document_acks_tenant ON public.document_acknowledgements(tenant_id);
CREATE INDEX idx_document_acks_doc ON public.document_acknowledgements(document_id);
