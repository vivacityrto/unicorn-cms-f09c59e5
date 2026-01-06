-- Add versioning fields to email_templates
ALTER TABLE email_templates 
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Create email_send_log table for audit trail
CREATE TABLE IF NOT EXISTS email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id),
  package_id bigint NULL REFERENCES packages(id),
  stage_id bigint NULL REFERENCES documents_stages(id),
  email_template_id uuid NOT NULL REFERENCES email_templates(id),
  email_template_version integer NOT NULL DEFAULT 1,
  to_email text NOT NULL,
  cc_emails text[] DEFAULT '{}',
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NULL,
  merge_data jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Create indexes for email_send_log
CREATE INDEX IF NOT EXISTS idx_email_send_log_tenant ON email_send_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_template ON email_send_log(email_template_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_status ON email_send_log(status);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON email_send_log(created_at DESC);

-- Enable RLS on email_send_log
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

-- SuperAdmin can do everything on email_send_log
CREATE POLICY "SuperAdmin full access to email_send_log"
ON email_send_log
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.user_uuid = auth.uid() 
    AND users.unicorn_role = 'Super Admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.user_uuid = auth.uid() 
    AND users.unicorn_role = 'Super Admin'
  )
);

-- No tenant access to email_send_log (they cannot see send logs)