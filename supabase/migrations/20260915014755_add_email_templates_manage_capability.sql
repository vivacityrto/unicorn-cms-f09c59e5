-- New capability row for the email-templates admin page (Carl, 2026-09-15).
--
-- admin.email_templates.manage is retained unchanged as send-stage-email's
-- own downstream consumption gate (unrelated concept). This introduces a
-- separate, correctly-scoped key for "who can view/manage the email
-- templates CRUD page", modeled directly on the actual RLS boundary:
-- writes are Super-Admin-only (is_super_admin_safe), reads are open to any
-- internal Vivacity staff (is_vivacity_internal = true).

INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active, sort_order)
VALUES (
  'email_templates.manage',
  'Email templates (CRUD page)',
  'Administration',
  'Administration',
  'View/edit the Manage Email Templates page. Distinct from admin.email_templates.manage, which gates send-stage-email''s own template lookup. full = create/edit/duplicate/activate/archive; limited = view only.',
  true,
  61
);

INSERT INTO public.role_permissions (role, feature_key, level) VALUES
  ('Super Admin', 'email_templates.manage', 'full'),
  ('Team Leader', 'email_templates.manage', 'limited'),
  ('Team Member', 'email_templates.manage', 'limited'),
  ('BGT', 'email_templates.manage', 'limited'),
  ('CSC', 'email_templates.manage', 'limited'),
  ('Integrator', 'email_templates.manage', 'limited'),
  ('CET', 'email_templates.manage', 'limited')
ON CONFLICT (role, feature_key) DO UPDATE SET level = EXCLUDED.level;
