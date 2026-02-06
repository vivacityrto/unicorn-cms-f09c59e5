-- =====================================================
-- OUTLOOK EMAIL LINKING - COMPLETE SETUP
-- =====================================================

-- 1. Email Messages Table (linked Outlook emails)
CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'microsoft',
  external_message_id text NOT NULL,
  subject text,
  sender_email text,
  sender_name text,
  received_at timestamptz,
  has_attachments boolean DEFAULT false,
  body_preview text,
  client_id bigint REFERENCES tenants(id) ON DELETE SET NULL,
  package_id bigint REFERENCES packages(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_uuid, external_message_id)
);

-- 2. Email Message Attachments Table
CREATE TABLE email_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id uuid NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  file_size integer,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Email Linking Audit Log
CREATE TABLE email_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  user_uuid uuid NOT NULL,
  email_message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  linked_entity_type text,
  linked_entity_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', false, 26214400)
ON CONFLICT (id) DO NOTHING;

-- 5. Enable RLS
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_link_audit ENABLE ROW LEVEL SECURITY;

-- 6. email_messages policies
CREATE POLICY "email_messages_select_own"
  ON email_messages FOR SELECT
  USING (user_uuid = auth.uid());

CREATE POLICY "email_messages_select_superadmin"
  ON email_messages FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "email_messages_insert_own"
  ON email_messages FOR INSERT
  WITH CHECK (user_uuid = auth.uid());

CREATE POLICY "email_messages_update_own"
  ON email_messages FOR UPDATE
  USING (user_uuid = auth.uid())
  WITH CHECK (user_uuid = auth.uid());

CREATE POLICY "email_messages_delete_superadmin"
  ON email_messages FOR DELETE
  USING (public.is_super_admin());

-- 7. email_message_attachments policies
CREATE POLICY "email_msg_attachments_select_own"
  ON email_message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM email_messages em
      WHERE em.id = email_message_attachments.email_message_id
      AND em.user_uuid = auth.uid()
    )
  );

CREATE POLICY "email_msg_attachments_select_superadmin"
  ON email_message_attachments FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "email_msg_attachments_insert_own"
  ON email_message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM email_messages em
      WHERE em.id = email_message_attachments.email_message_id
      AND em.user_uuid = auth.uid()
    )
  );

-- 8. email_link_audit policies
CREATE POLICY "email_link_audit_select_own"
  ON email_link_audit FOR SELECT
  USING (user_uuid = auth.uid());

CREATE POLICY "email_link_audit_select_superadmin"
  ON email_link_audit FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "email_link_audit_insert"
  ON email_link_audit FOR INSERT
  WITH CHECK (true);

-- 9. Storage policies
CREATE POLICY "email_attach_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'email-attachments'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

CREATE POLICY "email_attach_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

CREATE POLICY "email_attach_storage_superadmin"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'email-attachments'
    AND public.is_super_admin()
  );

-- 10. Indexes
CREATE INDEX idx_email_messages_user ON email_messages(user_uuid);
CREATE INDEX idx_email_messages_client ON email_messages(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_email_messages_package ON email_messages(package_id) WHERE package_id IS NOT NULL;
CREATE INDEX idx_email_messages_task ON email_messages(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_email_messages_received ON email_messages(received_at DESC);
CREATE INDEX idx_email_msg_attachments_msg ON email_message_attachments(email_message_id);
CREATE INDEX idx_email_link_audit_user ON email_link_audit(user_uuid);
CREATE INDEX idx_email_link_audit_msg ON email_link_audit(email_message_id);

-- 11. Updated_at trigger
CREATE TRIGGER update_email_messages_updated_at
  BEFORE UPDATE ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();