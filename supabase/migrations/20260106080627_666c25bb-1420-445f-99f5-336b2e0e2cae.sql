-- Package Builder Enhancement Migration
-- Adds support for package stage emails, AI hints, and improved audit logging

-- 1. Add AI hint and is_reusable to documents_stages if not exists
ALTER TABLE documents_stages 
ADD COLUMN IF NOT EXISTS ai_hint TEXT,
ADD COLUMN IF NOT EXISTS is_reusable BOOLEAN DEFAULT true;

-- 2. Create package_stage_emails join table for email triggers per stage
CREATE TABLE IF NOT EXISTS package_stage_emails (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  stage_id BIGINT NOT NULL REFERENCES documents_stages(id) ON DELETE CASCADE,
  email_template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('on_stage_start', 'on_task_complete', 'manual')),
  recipient_type TEXT NOT NULL DEFAULT 'tenant' CHECK (recipient_type IN ('internal', 'tenant', 'both')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(package_id, stage_id, email_template_id)
);

-- 3. Add owner_role and estimated_hours to package_staff_tasks
ALTER TABLE package_staff_tasks 
ADD COLUMN IF NOT EXISTS owner_role TEXT DEFAULT 'Admin',
ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT true;

-- 4. Add required_documents and instructions to package_client_tasks  
ALTER TABLE package_client_tasks
ADD COLUMN IF NOT EXISTS instructions TEXT,
ADD COLUMN IF NOT EXISTS required_documents TEXT[];

-- 5. Add document flags for package builder
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_team_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_tenant_downloadable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS merge_fields JSONB;

-- 6. Create package_builder_audit_log for tracking changes
CREATE TABLE IF NOT EXISTS package_builder_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Enable RLS on new tables
ALTER TABLE package_stage_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_builder_audit_log ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for package_stage_emails
CREATE POLICY "Authenticated users can view package stage emails"
ON package_stage_emails FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert package stage emails"
ON package_stage_emails FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update package stage emails"
ON package_stage_emails FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete package stage emails"
ON package_stage_emails FOR DELETE
TO authenticated
USING (true);

-- 9. RLS Policies for package_builder_audit_log
CREATE POLICY "Authenticated users can view package builder audit log"
ON package_builder_audit_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert package builder audit log"
ON package_builder_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_package_stage_emails_package ON package_stage_emails(package_id);
CREATE INDEX IF NOT EXISTS idx_package_stage_emails_stage ON package_stage_emails(stage_id);
CREATE INDEX IF NOT EXISTS idx_package_builder_audit_package ON package_builder_audit_log(package_id);
CREATE INDEX IF NOT EXISTS idx_documents_stages_stage_type ON documents_stages(stage_type);
CREATE INDEX IF NOT EXISTS idx_documents_stages_is_reusable ON documents_stages(is_reusable);