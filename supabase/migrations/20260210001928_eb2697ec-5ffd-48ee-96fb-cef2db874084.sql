
-- 1) Create tenant_document_requests table
CREATE TABLE public.tenant_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  created_by_user_id uuid NOT NULL,
  assigned_to_user_id uuid NULL,
  title text NOT NULL,
  details text NOT NULL,
  category text NULL CHECK (category IN ('Compliance', 'Evidence', 'Admin', 'Other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz NULL,
  related_package_id integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

-- Indexes
CREATE INDEX idx_tenant_document_requests_tenant_status ON public.tenant_document_requests (tenant_id, status, created_at DESC);
CREATE INDEX idx_tenant_document_requests_assigned ON public.tenant_document_requests (assigned_to_user_id, status);

-- Enable RLS
ALTER TABLE public.tenant_document_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tenant_document_requests_select"
  ON public.tenant_document_requests FOR SELECT
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "tenant_document_requests_insert"
  ON public.tenant_document_requests FOR INSERT
  WITH CHECK (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "tenant_document_requests_update"
  ON public.tenant_document_requests FOR UPDATE
  USING (
    (created_by_user_id = auth.uid() AND status NOT IN ('completed', 'cancelled'))
    OR assigned_to_user_id = auth.uid()
    OR is_vivacity_team_safe(auth.uid())
  );

-- Updated_at trigger
CREATE TRIGGER update_tenant_document_requests_updated_at
  BEFORE UPDATE ON public.tenant_document_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Create tenant_document_request_attachments table
CREATE TABLE public.tenant_document_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  request_id uuid NOT NULL REFERENCES public.tenant_document_requests(id) ON DELETE CASCADE,
  portal_document_id uuid NOT NULL REFERENCES public.portal_documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_document_request_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_document_request_attachments_select"
  ON public.tenant_document_request_attachments FOR SELECT
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "tenant_document_request_attachments_insert"
  ON public.tenant_document_request_attachments FOR INSERT
  WITH CHECK (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "tenant_document_request_attachments_delete"
  ON public.tenant_document_request_attachments FOR DELETE
  USING (has_tenant_access_safe(tenant_id, auth.uid()) AND is_vivacity_team_safe(auth.uid()));

-- 3) Add notification event type for document requests
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'document_request_created';
