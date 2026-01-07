-- Phase 13: Stage Templates - Create stage-level content tables
-- These tables store the "template" content for stages, independent of packages

-- 1. Stage Team Tasks (template tasks)
CREATE TABLE public.stage_team_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  owner_role text DEFAULT 'Admin',
  estimated_hours numeric(5,2),
  is_mandatory boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- 2. Stage Client Tasks (template tasks)
CREATE TABLE public.stage_client_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  instructions text,
  required_documents text[],
  is_mandatory boolean DEFAULT true,
  due_date_offset int,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- 3. Stage Emails (template email links)
CREATE TABLE public.stage_emails (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  email_template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('on_stage_start', 'on_task_complete', 'manual')),
  recipient_type text NOT NULL DEFAULT 'tenant' CHECK (recipient_type IN ('internal', 'tenant', 'both')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- 4. Stage Documents (template document links)
CREATE TABLE public.stage_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'both' CHECK (visibility IN ('team_only', 'tenant_download', 'both')),
  delivery_type text NOT NULL DEFAULT 'manual' CHECK (delivery_type IN ('manual', 'auto_generate')),
  is_team_only boolean DEFAULT false,
  is_tenant_downloadable boolean DEFAULT true,
  is_auto_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(stage_id, document_id)
);

-- 5. Add use_overrides flag to package_stages
ALTER TABLE public.package_stages 
ADD COLUMN IF NOT EXISTS use_overrides boolean DEFAULT false;

-- Add comment explaining the flag
COMMENT ON COLUMN public.package_stages.use_overrides IS 
'When false, package uses stage template content. When true, package uses package_* rows as overrides.';

-- Create indexes for performance
CREATE INDEX idx_stage_team_tasks_stage_id ON public.stage_team_tasks(stage_id);
CREATE INDEX idx_stage_client_tasks_stage_id ON public.stage_client_tasks(stage_id);
CREATE INDEX idx_stage_emails_stage_id ON public.stage_emails(stage_id);
CREATE INDEX idx_stage_documents_stage_id ON public.stage_documents(stage_id);

-- Enable RLS on new tables
ALTER TABLE public.stage_team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stage_team_tasks (same pattern as package builder tables)
CREATE POLICY "Authenticated users can view stage_team_tasks"
  ON public.stage_team_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stage_team_tasks"
  ON public.stage_team_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stage_team_tasks"
  ON public.stage_team_tasks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete stage_team_tasks"
  ON public.stage_team_tasks FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for stage_client_tasks
CREATE POLICY "Authenticated users can view stage_client_tasks"
  ON public.stage_client_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stage_client_tasks"
  ON public.stage_client_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stage_client_tasks"
  ON public.stage_client_tasks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete stage_client_tasks"
  ON public.stage_client_tasks FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for stage_emails
CREATE POLICY "Authenticated users can view stage_emails"
  ON public.stage_emails FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stage_emails"
  ON public.stage_emails FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stage_emails"
  ON public.stage_emails FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete stage_emails"
  ON public.stage_emails FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for stage_documents
CREATE POLICY "Authenticated users can view stage_documents"
  ON public.stage_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stage_documents"
  ON public.stage_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stage_documents"
  ON public.stage_documents FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete stage_documents"
  ON public.stage_documents FOR DELETE
  TO authenticated
  USING (true);