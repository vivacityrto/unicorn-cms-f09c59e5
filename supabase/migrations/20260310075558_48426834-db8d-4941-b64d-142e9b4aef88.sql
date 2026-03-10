
-- ============================================================================
-- Suggestion & Issue Register: Tables, Seed Data, RLS, Storage
-- ============================================================================

-- 1. Dropdown tables (dd_suggest_*)

CREATE TABLE public.dd_suggest_item_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dd_suggest_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dd_suggest_priority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dd_suggest_impact_rating (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dd_suggest_release_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dd_suggest_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Main tables

CREATE TABLE public.suggest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  suggest_item_type_id uuid NOT NULL REFERENCES public.dd_suggest_item_type(id),
  suggest_status_id uuid NOT NULL REFERENCES public.dd_suggest_status(id),
  suggest_priority_id uuid NOT NULL REFERENCES public.dd_suggest_priority(id),
  suggest_impact_rating_id uuid NOT NULL REFERENCES public.dd_suggest_impact_rating(id),
  suggest_category_id uuid REFERENCES public.dd_suggest_category(id) ON DELETE SET NULL,
  suggest_release_status_id uuid NOT NULL REFERENCES public.dd_suggest_release_status(id),

  title text NOT NULL,
  description text NOT NULL,
  title_generated_by_ai boolean NOT NULL DEFAULT false,

  source_page_url text,
  source_page_label text,
  source_area text,
  source_component text,

  assigned_to uuid REFERENCES public.users(user_uuid),
  reported_by uuid NOT NULL REFERENCES public.users(user_uuid),

  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(user_uuid),
  resolution_notes text,

  release_version text,
  release_notes text,
  released_at timestamptz,
  released_by uuid REFERENCES public.users(user_uuid),

  is_deleted boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users(user_uuid),
  updated_by uuid REFERENCES public.users(user_uuid)
);

CREATE TABLE public.suggest_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  suggest_item_id uuid NOT NULL REFERENCES public.suggest_items(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  attachment_kind text NOT NULL DEFAULT 'file',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users(user_uuid)
);

-- 3. Indexes

CREATE INDEX idx_suggest_items_tenant_id ON public.suggest_items(tenant_id);
CREATE INDEX idx_suggest_items_type_id ON public.suggest_items(suggest_item_type_id);
CREATE INDEX idx_suggest_items_status_id ON public.suggest_items(suggest_status_id);
CREATE INDEX idx_suggest_items_priority_id ON public.suggest_items(suggest_priority_id);
CREATE INDEX idx_suggest_items_impact_id ON public.suggest_items(suggest_impact_rating_id);
CREATE INDEX idx_suggest_items_category_id ON public.suggest_items(suggest_category_id);
CREATE INDEX idx_suggest_items_release_status_id ON public.suggest_items(suggest_release_status_id);
CREATE INDEX idx_suggest_items_assigned_to ON public.suggest_items(assigned_to);
CREATE INDEX idx_suggest_items_reported_by ON public.suggest_items(reported_by);
CREATE INDEX idx_suggest_items_release_version ON public.suggest_items(release_version);
CREATE INDEX idx_suggest_attachments_item_id ON public.suggest_attachments(suggest_item_id);

-- 4. Seed data

INSERT INTO public.dd_suggest_item_type (code, label, description, sort_order) VALUES
('suggestion', 'Suggestion', 'New idea or request', 10),
('improvement', 'Improvement', 'Improvement to an existing feature or workflow', 20),
('data_enhancement', 'Data Enhancement', 'Improvement to data structure, mapping, validation, migration, display, or reporting', 30),
('error', 'Error', 'Defect or bug', 40),
('functionality_fail', 'Functionality Fail', 'Expected feature failed during use', 50);

INSERT INTO public.dd_suggest_status (code, label, description, sort_order) VALUES
('new', 'New', 'Newly logged item', 10),
('triaged', 'Triaged', 'Reviewed and categorised', 20),
('in_progress', 'In Progress', 'Being worked on', 30),
('blocked', 'Blocked', 'Cannot proceed yet', 40),
('resolved', 'Resolved', 'Completed internally', 50),
('closed', 'Closed', 'No further action required', 60);

INSERT INTO public.dd_suggest_release_status (code, label, description, sort_order) VALUES
('not_released', 'Not Released', 'Not yet included in release notes', 10),
('released', 'Released', 'Included in release notes', 20);

INSERT INTO public.dd_suggest_priority (code, label, description, sort_order) VALUES
('low', 'Low', 'Low urgency', 10),
('medium', 'Medium', 'Normal urgency', 20),
('high', 'High', 'High urgency', 30),
('critical', 'Critical', 'Immediate attention required', 40);

INSERT INTO public.dd_suggest_impact_rating (code, label, description, sort_order) VALUES
('very_low', 'Very Low', 'Negligible impact', 10),
('low', 'Low', 'Minor impact', 20),
('medium', 'Medium', 'Moderate impact', 30),
('high', 'High', 'Major impact', 40),
('severe', 'Severe', 'Severe operational impact', 50);

INSERT INTO public.dd_suggest_category (code, label, description, sort_order) VALUES
('ui', 'UI', 'User interface matters', 10),
('data', 'Data', 'Data quality, mapping, import, or structure', 20),
('performance', 'Performance', 'Speed or responsiveness', 30),
('workflow', 'Workflow', 'Process or flow issues', 40),
('compliance', 'Compliance', 'Compliance or standards issues', 50),
('security', 'Security', 'Security concerns', 60),
('reporting', 'Reporting', 'Reports and dashboards', 70),
('integrations', 'Integrations', 'Third-party or internal integrations', 80),
('notifications', 'Notifications', 'Alerts and messaging', 90),
('documents', 'Documents', 'Document generation or file issues', 100),
('other', 'Other', 'Anything else', 110);

-- 5. RLS

ALTER TABLE public.suggest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggest_attachments ENABLE ROW LEVEL SECURITY;

-- dd_suggest_* tables: read-only for authenticated, manage for super admin
ALTER TABLE public.dd_suggest_item_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_suggest_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_suggest_priority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_suggest_impact_rating ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_suggest_release_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_suggest_category ENABLE ROW LEVEL SECURITY;

-- Dropdown read policies
CREATE POLICY "dd_suggest_item_type_select" ON public.dd_suggest_item_type FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_suggest_status_select" ON public.dd_suggest_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_suggest_priority_select" ON public.dd_suggest_priority FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_suggest_impact_rating_select" ON public.dd_suggest_impact_rating FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_suggest_release_status_select" ON public.dd_suggest_release_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_suggest_category_select" ON public.dd_suggest_category FOR SELECT TO authenticated USING (true);

-- Dropdown manage policies (super admin only)
CREATE POLICY "dd_suggest_item_type_manage" ON public.dd_suggest_item_type FOR ALL TO authenticated USING (public.is_super_admin_safe(auth.uid())) WITH CHECK (public.is_super_admin_safe(auth.uid()));
CREATE POLICY "dd_suggest_status_manage" ON public.dd_suggest_status FOR ALL TO authenticated USING (public.is_super_admin_safe(auth.uid())) WITH CHECK (public.is_super_admin_safe(auth.uid()));
CREATE POLICY "dd_suggest_priority_manage" ON public.dd_suggest_priority FOR ALL TO authenticated USING (public.is_super_admin_safe(auth.uid())) WITH CHECK (public.is_super_admin_safe(auth.uid()));
CREATE POLICY "dd_suggest_impact_rating_manage" ON public.dd_suggest_impact_rating FOR ALL TO authenticated USING (public.is_super_admin_safe(auth.uid())) WITH CHECK (public.is_super_admin_safe(auth.uid()));
CREATE POLICY "dd_suggest_release_status_manage" ON public.dd_suggest_release_status FOR ALL TO authenticated USING (public.is_super_admin_safe(auth.uid())) WITH CHECK (public.is_super_admin_safe(auth.uid()));
CREATE POLICY "dd_suggest_category_manage" ON public.dd_suggest_category FOR ALL TO authenticated USING (public.is_super_admin_safe(auth.uid())) WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- suggest_items policies
CREATE POLICY "suggest_items_select" ON public.suggest_items
FOR SELECT TO authenticated
USING (
  NOT is_deleted
  AND (
    public.is_super_admin_safe(auth.uid())
    OR public.is_vivacity_team_safe(auth.uid())
    OR public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  )
);

CREATE POLICY "suggest_items_insert" ON public.suggest_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "suggest_items_update" ON public.suggest_items
FOR UPDATE TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
)
WITH CHECK (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
);

-- suggest_attachments policies
CREATE POLICY "suggest_attachments_select" ON public.suggest_attachments
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
);

CREATE POLICY "suggest_attachments_insert" ON public.suggest_attachments
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "suggest_attachments_delete" ON public.suggest_attachments
FOR DELETE TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR created_by = auth.uid()
);

-- 6. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('suggest-attachments', 'suggest-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "suggest_attach_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'suggest-attachments');

CREATE POLICY "suggest_attach_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'suggest-attachments');

CREATE POLICY "suggest_attach_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'suggest-attachments' AND (auth.uid())::text = (storage.foldername(name))[2]);

-- 7. Updated_at trigger
CREATE OR REPLACE FUNCTION public.suggest_items_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suggest_items_updated_at
  BEFORE UPDATE ON public.suggest_items
  FOR EACH ROW
  EXECUTE FUNCTION public.suggest_items_set_updated_at();
