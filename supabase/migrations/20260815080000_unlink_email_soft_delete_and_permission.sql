-- Soft-delete + permission gate for linked Outlook emails (unlink-email).
--
-- The live unlink-email edge function hard-deleted email_messages, attachments,
-- storage objects, and converted notes after a seven-role allowlist check, with
-- no tenant scoping and no audit row. This migration:
--   1. Adds nullable unlinked_at / unlinked_by (soft delete).
--   2. Seeds clients.emails.manage (the email-management feature key) and
--      grants `full` to every Vivacity staff role that the old allowlist
--      accepted, so check_permission is a replacement rather than a lock-out.
--   3. Hides unlinked rows from authenticated SELECT.
--   4. Adds email_messages_restrict_staff_only, mirroring emails_restrict_staff_only
--      on public.emails, so an ANON+JWT fetch 404s for non-staff.
--
-- Write-path sweep (nullable columns — no NOT NULL / CHECK narrowing):
--   Frontend: src/hooks/useLinkedEmails.tsx (.from('email_messages'))
--   Edge: unlink-email, capture-outlook-email, addin-email-capture,
--         addin-email-create-task, addin-email-link-attachments,
--         generate-email-note
--   RPCs: merge_tenants (updates email_messages; does not insert these cols)
--   Triggers: update_email_messages_updated_at only
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS email_messages_restrict_staff_only ON public.email_messages;
--   DROP POLICY IF EXISTS email_messages_select ON public.email_messages;
--   -- restore prior SELECT (owner OR vivacity team OR super admin), no unlinked filter
--   DELETE FROM public.role_permissions WHERE feature_key = 'clients.emails.manage';
--   DELETE FROM public.permission_features WHERE feature_key = 'clients.emails.manage';
--   DROP INDEX IF EXISTS public.idx_email_messages_active;
--   ALTER TABLE public.email_messages DROP COLUMN IF EXISTS unlinked_by;
--   ALTER TABLE public.email_messages DROP COLUMN IF EXISTS unlinked_at;

-- 1. Soft-delete columns
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS unlinked_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlinked_by uuid REFERENCES public.users(user_uuid);

COMMENT ON COLUMN public.email_messages.unlinked_at IS
  'When set, the linked Outlook email is soft-unlinked and hidden from queries.';
COMMENT ON COLUMN public.email_messages.unlinked_by IS
  'auth.users / public.users id of the staff member who unlinked this email.';

CREATE INDEX IF NOT EXISTS idx_email_messages_active
  ON public.email_messages (tenant_id, received_at DESC)
  WHERE unlinked_at IS NULL;

-- 2. Email-management feature key
INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active, sort_order)
VALUES (
  'clients.emails.manage',
  'Manage linked emails',
  'Clients',
  'Client Management',
  'Link and unlink Outlook emails on a client / package / task. Used by unlink-email via check_permission.',
  true,
  160
)
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO public.role_permissions (feature_key, role, level) VALUES
  ('clients.emails.manage', 'Super Admin', 'full'),
  ('clients.emails.manage', 'Team Leader', 'full'),
  ('clients.emails.manage', 'Team Member', 'full'),
  ('clients.emails.manage', 'Integrator', 'full'),
  ('clients.emails.manage', 'BGT', 'full'),
  ('clients.emails.manage', 'CSC', 'full'),
  ('clients.emails.manage', 'CET', 'full')
ON CONFLICT (role, feature_key) DO NOTHING;

-- 3. Hide unlinked rows. Live SELECT (broader than the committed 2026-02
--    owner-or-SA policy) is owner OR vivacity team OR super admin.
DROP POLICY IF EXISTS email_messages_select ON public.email_messages;
CREATE POLICY email_messages_select
ON public.email_messages
FOR SELECT TO authenticated
USING (
  unlinked_at IS NULL
  AND (
    user_uuid = (SELECT auth.uid())
    OR public.is_vivacity_team_safe((SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
  )
);

-- 4. Restrictive staff-only backstop — same predicate as emails_restrict_staff_only
--    on public.emails. An ANON-key client carrying the caller's JWT will 404
--    if the caller is not staff / super admin.
DROP POLICY IF EXISTS email_messages_restrict_staff_only ON public.email_messages;
CREATE POLICY email_messages_restrict_staff_only
ON public.email_messages AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_staff() OR public.is_super_admin())
WITH CHECK (public.is_staff() OR public.is_super_admin());

NOTIFY pgrst, 'reload schema';
