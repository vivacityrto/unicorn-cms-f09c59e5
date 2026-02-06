-- =====================================================
-- PART A: Two-Way Documents Hub Schema
-- Extend existing tables + new evidence request system
-- =====================================================

-- 1) Add direction/visibility/metadata columns to existing document tables
-- Extend generated_documents with portal visibility
ALTER TABLE public.generated_documents 
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'vivacity_to_client',
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES public.users(user_uuid),
  ADD COLUMN IF NOT EXISTS version_group_id uuid DEFAULT gen_random_uuid();

-- Add constraint for valid directions
ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_direction_check 
  CHECK (direction IN ('vivacity_to_client', 'client_to_vivacity', 'internal'));

-- 2) Create document categories table for portal documents
CREATE TABLE IF NOT EXISTS public.portal_document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(user_uuid)
);

-- Seed categories
INSERT INTO public.portal_document_categories (code, name, description, display_order) VALUES
  ('compliance', 'Compliance Documents', 'RTO compliance policies and procedures', 1),
  ('training', 'Training & Assessment', 'TAS documents, assessments, learning resources', 2),
  ('evidence', 'Evidence & Records', 'Student records, assessment evidence, validation', 3),
  ('marketing', 'Marketing & Enrolment', 'Brochures, enrolment forms, student info', 4),
  ('hr', 'HR & Staff', 'Staff qualifications, position descriptions', 5),
  ('audit', 'Audit & Review', 'Audit reports, self-assessments, rectifications', 6),
  ('other', 'Other', 'Miscellaneous documents', 99)
ON CONFLICT (code) DO NOTHING;

-- 3) Create portal_documents table for client uploads and flexible sharing
CREATE TABLE public.portal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- File metadata
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  
  -- Classification
  category_id uuid REFERENCES public.portal_document_categories(id),
  tags text[] DEFAULT '{}',
  
  -- Direction and visibility
  direction text NOT NULL DEFAULT 'client_to_vivacity',
  is_client_visible boolean NOT NULL DEFAULT true,
  
  -- Status workflow
  status text NOT NULL DEFAULT 'draft',
  
  -- Versioning
  version_group_id uuid DEFAULT gen_random_uuid(),
  version_number integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.portal_documents(id),
  
  -- Source tracking
  source text NOT NULL DEFAULT 'manual_upload',
  
  -- Linkages (nullable - can link to various entities)
  linked_package_id bigint,
  linked_stage_id bigint,
  linked_task_id uuid,
  linked_support_request_id uuid REFERENCES public.support_requests(id),
  evidence_request_item_id uuid, -- Will be populated after evidence_request_items created
  
  -- Notes
  description text,
  internal_notes text, -- Vivacity-only notes
  
  -- Upload metadata
  uploaded_by uuid REFERENCES public.users(user_uuid),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  
  -- Sharing metadata
  shared_at timestamptz,
  shared_by uuid REFERENCES public.users(user_uuid),
  
  -- Soft delete
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(user_uuid),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT portal_documents_direction_check 
    CHECK (direction IN ('vivacity_to_client', 'client_to_vivacity', 'internal')),
  CONSTRAINT portal_documents_status_check 
    CHECK (status IN ('draft', 'shared', 'requested', 'received', 'superseded', 'archived', 'deleted')),
  CONSTRAINT portal_documents_source_check 
    CHECK (source IN ('manual_upload', 'generated', 'imported', 'evidence_response'))
);

-- Indexes for portal_documents
CREATE INDEX idx_portal_documents_tenant ON public.portal_documents(tenant_id);
CREATE INDEX idx_portal_documents_direction ON public.portal_documents(direction);
CREATE INDEX idx_portal_documents_status ON public.portal_documents(status);
CREATE INDEX idx_portal_documents_category ON public.portal_documents(category_id);
CREATE INDEX idx_portal_documents_version_group ON public.portal_documents(version_group_id);
CREATE INDEX idx_portal_documents_uploaded_by ON public.portal_documents(uploaded_by);
CREATE INDEX idx_portal_documents_not_deleted ON public.portal_documents(tenant_id) WHERE deleted_at IS NULL;

-- 4) Create evidence request templates (predefined structures for Health Check, TAS, etc.)
CREATE TABLE public.evidence_request_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(user_uuid),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT evidence_request_templates_category_check 
    CHECK (category IN ('health_check', 'tas_build', 'dap', 'llnd', 'audit', 'general'))
);

-- 5) Create evidence request template items (defines what items are in each template)
CREATE TABLE public.evidence_request_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.evidence_request_templates(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  guidance_text text,
  accepted_file_types text[] DEFAULT '{}', -- e.g., ['pdf', 'docx', 'xlsx']
  is_required boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_template_items_template ON public.evidence_request_template_items(template_id);

-- 6) Create evidence requests (actual requests sent to clients)
CREATE TABLE public.evidence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Request details
  title text NOT NULL,
  description text,
  due_date date,
  category text NOT NULL DEFAULT 'general',
  
  -- Optional template reference
  template_id uuid REFERENCES public.evidence_request_templates(id),
  
  -- Assignment
  requested_by_user_id uuid NOT NULL REFERENCES public.users(user_uuid),
  assigned_to_client_user_id uuid REFERENCES public.users(user_uuid),
  
  -- Status
  status text NOT NULL DEFAULT 'open',
  
  -- Linkages
  linked_package_id bigint,
  linked_stage_id bigint,
  linked_support_request_id uuid REFERENCES public.support_requests(id),
  
  -- Timestamps
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT evidence_requests_category_check 
    CHECK (category IN ('health_check', 'tas_build', 'dap', 'llnd', 'audit', 'general')),
  CONSTRAINT evidence_requests_status_check 
    CHECK (status IN ('draft', 'open', 'partially_received', 'received', 'overdue', 'closed', 'cancelled'))
);

CREATE INDEX idx_evidence_requests_tenant ON public.evidence_requests(tenant_id);
CREATE INDEX idx_evidence_requests_status ON public.evidence_requests(status);
CREATE INDEX idx_evidence_requests_due_date ON public.evidence_requests(due_date);
CREATE INDEX idx_evidence_requests_requested_by ON public.evidence_requests(requested_by_user_id);

-- 7) Create evidence request items (individual items within a request)
CREATE TABLE public.evidence_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.evidence_requests(id) ON DELETE CASCADE,
  
  -- Item details
  item_name text NOT NULL,
  guidance_text text,
  accepted_file_types text[] DEFAULT '{}',
  is_required boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  
  -- Response tracking
  received_document_id uuid REFERENCES public.portal_documents(id),
  received_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(user_uuid),
  review_notes text,
  
  -- Status
  status text NOT NULL DEFAULT 'pending',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT evidence_request_items_status_check 
    CHECK (status IN ('pending', 'received', 'accepted', 'rejected', 'resubmit_requested'))
);

CREATE INDEX idx_evidence_request_items_request ON public.evidence_request_items(request_id);
CREATE INDEX idx_evidence_request_items_status ON public.evidence_request_items(status);

-- Add FK to portal_documents for evidence_request_item_id
ALTER TABLE public.portal_documents 
  ADD CONSTRAINT portal_documents_evidence_item_fk 
  FOREIGN KEY (evidence_request_item_id) REFERENCES public.evidence_request_items(id);

-- 8) Create portal document audit log
CREATE TABLE public.portal_document_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  document_id uuid NOT NULL, -- Can be portal_documents.id or generated_documents.id
  document_type text NOT NULL, -- 'portal' or 'generated'
  
  -- Action details
  action text NOT NULL,
  actor_user_id uuid REFERENCES public.users(user_uuid),
  actor_role text,
  
  -- Context
  reason text,
  metadata jsonb DEFAULT '{}',
  
  occurred_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT portal_document_audit_action_check 
    CHECK (action IN ('uploaded', 'downloaded', 'viewed', 'shared_to_client', 'unshared', 
                      'superseded', 'deleted', 'restored', 'status_changed', 'metadata_updated'))
);

CREATE INDEX idx_portal_document_audit_tenant ON public.portal_document_audit(tenant_id);
CREATE INDEX idx_portal_document_audit_document ON public.portal_document_audit(document_id);
CREATE INDEX idx_portal_document_audit_action ON public.portal_document_audit(action);
CREATE INDEX idx_portal_document_audit_occurred ON public.portal_document_audit(occurred_at DESC);

-- 9) Seed evidence request templates
INSERT INTO public.evidence_request_templates (code, name, description, category) VALUES
  ('health_check_standard', 'Standard Health Check', 'Standard compliance health check evidence requirements', 'health_check'),
  ('tas_build_initial', 'TAS Build - Initial', 'Training and Assessment Strategy build requirements', 'tas_build'),
  ('dap_validation', 'DAP Validation', 'Delivery and Assessment Plan validation evidence', 'dap'),
  ('llnd_evidence', 'LLND Evidence Pack', 'Language, Literacy, Numeracy and Digital capability evidence', 'llnd'),
  ('audit_prep', 'Audit Preparation', 'Pre-audit evidence collection', 'audit')
ON CONFLICT (code) DO NOTHING;

-- 10) Enable RLS on all new tables
ALTER TABLE public.portal_document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_request_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_document_audit ENABLE ROW LEVEL SECURITY;

-- 11) RLS Policies

-- portal_document_categories: Everyone can read, only staff can modify
CREATE POLICY "Anyone can view document categories"
  ON public.portal_document_categories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Staff can manage document categories"
  ON public.portal_document_categories FOR ALL
  TO authenticated
  USING (public.is_staff());

-- portal_documents: Complex access based on direction and visibility
CREATE POLICY "Staff can view all portal documents"
  ON public.portal_documents FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can view their visible documents"
  ON public.portal_documents FOR SELECT
  TO authenticated
  USING (
    NOT public.is_staff() 
    AND public.user_has_tenant_access(tenant_id)
    AND is_client_visible = true
    AND deleted_at IS NULL
  );

CREATE POLICY "Staff can insert portal documents"
  ON public.portal_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "Clients can upload to their tenant"
  ON public.portal_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT public.is_staff()
    AND public.user_has_tenant_access(tenant_id)
    AND direction = 'client_to_vivacity'
  );

CREATE POLICY "Staff can update portal documents"
  ON public.portal_documents FOR UPDATE
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can update their own uploads"
  ON public.portal_documents FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_staff()
    AND public.user_has_tenant_access(tenant_id)
    AND uploaded_by = auth.uid()
    AND direction = 'client_to_vivacity'
  );

-- evidence_request_templates: Staff can manage, clients can view active
CREATE POLICY "Staff can manage evidence templates"
  ON public.evidence_request_templates FOR ALL
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can view active templates"
  ON public.evidence_request_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- evidence_request_template_items: Follow parent template access
CREATE POLICY "Staff can manage template items"
  ON public.evidence_request_template_items FOR ALL
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can view template items"
  ON public.evidence_request_template_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evidence_request_templates t 
    WHERE t.id = template_id AND t.is_active = true
  ));

-- evidence_requests: Staff can manage all, clients can view their tenant's
CREATE POLICY "Staff can manage evidence requests"
  ON public.evidence_requests FOR ALL
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can view their evidence requests"
  ON public.evidence_requests FOR SELECT
  TO authenticated
  USING (
    NOT public.is_staff() 
    AND public.user_has_tenant_access(tenant_id)
  );

-- evidence_request_items: Follow parent request access
CREATE POLICY "Staff can manage evidence request items"
  ON public.evidence_request_items FOR ALL
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can view their request items"
  ON public.evidence_request_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evidence_requests r 
    WHERE r.id = request_id 
    AND NOT public.is_staff()
    AND public.user_has_tenant_access(r.tenant_id)
  ));

CREATE POLICY "Clients can update their request items"
  ON public.evidence_request_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evidence_requests r 
    WHERE r.id = request_id 
    AND NOT public.is_staff()
    AND public.user_has_tenant_access(r.tenant_id)
  ));

-- portal_document_audit: Staff can manage, clients can view their tenant's
CREATE POLICY "Staff can manage audit logs"
  ON public.portal_document_audit FOR ALL
  TO authenticated
  USING (public.is_staff());

CREATE POLICY "Clients can view their audit logs"
  ON public.portal_document_audit FOR SELECT
  TO authenticated
  USING (
    NOT public.is_staff() 
    AND public.user_has_tenant_access(tenant_id)
  );

-- 12) Create unified documents view for portal display (FIXED: use first_name || last_name)
CREATE OR REPLACE VIEW public.v_portal_documents_unified AS
SELECT 
  pd.id,
  pd.tenant_id,
  'portal' AS document_type,
  pd.file_name,
  pd.file_type,
  pd.file_size,
  pd.storage_path,
  pdc.name AS category_name,
  pd.tags,
  pd.direction,
  pd.is_client_visible,
  pd.status,
  pd.version_number,
  pd.source,
  pd.description,
  pd.uploaded_by,
  COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by_name,
  CASE WHEN pd.direction = 'vivacity_to_client' THEN 'Vivacity' ELSE 'Client' END AS uploaded_by_type,
  pd.uploaded_at,
  pd.shared_at,
  pd.linked_package_id,
  pd.linked_stage_id,
  pd.evidence_request_item_id,
  pd.deleted_at
FROM public.portal_documents pd
LEFT JOIN public.portal_document_categories pdc ON pdc.id = pd.category_id
LEFT JOIN public.users u ON u.user_uuid = pd.uploaded_by
WHERE pd.deleted_at IS NULL

UNION ALL

SELECT 
  gd.id::uuid,
  gd.tenant_id::bigint,
  'generated' AS document_type,
  gd.file_name,
  NULL AS file_type,
  NULL AS file_size,
  gd.file_path AS storage_path,
  d.category AS category_name,
  ARRAY[]::text[] AS tags,
  COALESCE(gd.direction, 'vivacity_to_client') AS direction,
  COALESCE(gd.is_client_visible, false) AS is_client_visible,
  gd.status,
  1 AS version_number,
  'generated' AS source,
  d.description,
  gd.generated_by AS uploaded_by,
  COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by_name,
  'Vivacity' AS uploaded_by_type,
  gd.generated_at AS uploaded_at,
  gd.shared_at,
  gd.package_id AS linked_package_id,
  gd.stage_id AS linked_stage_id,
  NULL::uuid AS evidence_request_item_id,
  NULL::timestamptz AS deleted_at
FROM public.generated_documents gd
LEFT JOIN public.documents d ON d.id = gd.source_document_id
LEFT JOIN public.users u ON u.user_uuid = gd.generated_by;

-- Set security invoker on view
ALTER VIEW public.v_portal_documents_unified SET (security_invoker = true);

-- 13) Function to log portal document audit events
CREATE OR REPLACE FUNCTION public.log_portal_document_event(
  p_tenant_id bigint,
  p_document_id uuid,
  p_document_type text,
  p_action text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_log_id uuid;
BEGIN
  -- Determine actor role
  SELECT COALESCE(global_role, 'General User') INTO v_actor_role
  FROM public.users WHERE user_uuid = auth.uid();
  
  INSERT INTO public.portal_document_audit (
    tenant_id, document_id, document_type, action, 
    actor_user_id, actor_role, reason, metadata
  ) VALUES (
    p_tenant_id, p_document_id, p_document_type, p_action,
    auth.uid(), v_actor_role, p_reason, p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- 14) Function to update evidence request status based on items
CREATE OR REPLACE FUNCTION public.update_evidence_request_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_items integer;
  v_received_items integer;
  v_required_items integer;
  v_received_required integer;
  v_new_status text;
BEGIN
  -- Count items
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('received', 'accepted')),
    COUNT(*) FILTER (WHERE is_required = true),
    COUNT(*) FILTER (WHERE is_required = true AND status IN ('received', 'accepted'))
  INTO v_total_items, v_received_items, v_required_items, v_received_required
  FROM public.evidence_request_items
  WHERE request_id = COALESCE(NEW.request_id, OLD.request_id);
  
  -- Determine new status
  IF v_received_items = 0 THEN
    v_new_status := 'open';
  ELSIF v_received_required = v_required_items AND v_received_items = v_total_items THEN
    v_new_status := 'received';
  ELSIF v_received_items > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := 'open';
  END IF;
  
  -- Update parent request
  UPDATE public.evidence_requests
  SET status = v_new_status, updated_at = now()
  WHERE id = COALESCE(NEW.request_id, OLD.request_id)
    AND status NOT IN ('closed', 'cancelled');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_evidence_request_status
  AFTER INSERT OR UPDATE OF status ON public.evidence_request_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_evidence_request_status();

-- 15) Timestamps trigger for portal_documents
CREATE TRIGGER set_portal_documents_updated_at
  BEFORE UPDATE ON public.portal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_evidence_requests_updated_at
  BEFORE UPDATE ON public.evidence_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_evidence_request_items_updated_at
  BEFORE UPDATE ON public.evidence_request_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();