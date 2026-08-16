-- Seed feature keys for the edge-function check_permission consolidation.
-- Grants match the pre-refactor allowed-sets (behaviour-preserving):
--   staff.*          → every Vivacity internal role = full
--   staff.addin.use  → Super Admin / Team Leader / Team Member only
--                      (matches the add-in JWT allowlist)
--   admin.integrations.xero_connect → Super Admin + Integrator
--   remaining admin.* / audits.export_pack → Super Admin only
--
-- Super Admin always passes check_permission regardless of these rows.
-- Team Member is included on staff.* even though most existing keys omit
-- that role — is_vivacity_internal gates previously admitted them.
--
-- ROLLBACK:
--   DELETE FROM public.role_permissions
--     WHERE feature_key IN (
--       'staff.internal','staff.sharepoint.use','staff.email.send',
--       'staff.documents.generate','staff.ai.use','staff.research.use',
--       'staff.meetings.use','staff.billing.xero_view','staff.integrations.tga',
--       'staff.addin.use','admin.permissions.manage','admin.migration.unicorn1',
--       'admin.testing.seed','admin.vector.manage','admin.integrations.xero_connect',
--       'audits.export_pack'
--     );
--   DELETE FROM public.permission_features
--     WHERE feature_key IN (
--       'staff.internal','staff.sharepoint.use','staff.email.send',
--       'staff.documents.generate','staff.ai.use','staff.research.use',
--       'staff.meetings.use','staff.billing.xero_view','staff.integrations.tga',
--       'staff.addin.use','admin.permissions.manage','admin.migration.unicorn1',
--       'admin.testing.seed','admin.vector.manage','admin.integrations.xero_connect',
--       'audits.export_pack'
--     );

INSERT INTO public.permission_features
  (feature_key, label, module, category, description, is_active, sort_order)
VALUES
  ('staff.internal', 'Vivacity staff (generic)', 'Staff', 'Staff',
   'Generic is_vivacity_internal replacement. Prefer a more specific staff.* key when the capability is distinct.',
   true, 50),
  ('staff.sharepoint.use', 'SharePoint browse / provision', 'Staff', 'Staff — SharePoint',
   'Browse, resolve, validate, and provision client SharePoint folders.',
   true, 51),
  ('staff.email.send', 'Send composed / Graph email', 'Staff', 'Staff — Email',
   'Send mail as staff (or as a tenant member via the orAllow path). Replaces unicorn_role/global_role/role_type checks on the email surface.',
   true, 52),
  ('staff.documents.generate', 'Generate / deliver documents', 'Staff', 'Staff — Documents',
   'Generate, scan, analyse, pack, and deliver client documents.',
   true, 53),
  ('staff.ai.use', 'Staff AI assistants', 'Staff', 'Staff — AI',
   'Ask Viv, Copilot, compliance assistant, and related staff AI surfaces.',
   true, 54),
  ('staff.research.use', 'Research / knowledge tools', 'Staff', 'Staff — Research',
   'Research scrape, knowledge-graph, and public-snapshot tools.',
   true, 55),
  ('staff.meetings.use', 'Meeting artefacts', 'Staff', 'Staff — Meetings',
   'Publish minutes, sync artefacts, extract Copilot minutes.',
   true, 56),
  ('staff.billing.xero_view', 'View Xero invoice status', 'Staff', 'Staff — Billing',
   'Read redacted Xero invoice status / list for a client.',
   true, 57),
  ('staff.integrations.tga', 'TGA integration', 'Staff', 'Staff — Integrations',
   'TGA lookup / integration actions available to all internal staff.',
   true, 58),
  ('staff.addin.use', 'Outlook add-in', 'Staff', 'Staff — Add-in',
   'Outlook add-in capture / task / attachment actions. Granted to Super Admin, Team Leader, Team Member to match the previous JWT role allowlist.',
   true, 59),
  ('admin.permissions.manage', 'Edit role permissions', 'Administration', 'Administration',
   'Write to role_permissions via update-role-permission. Super Admin only.',
   true, 71),
  ('admin.migration.unicorn1', 'Unicorn 1 migration tools', 'Administration', 'Administration',
   'Search / lookup / import Unicorn 1 clients and users.',
   true, 72),
  ('admin.testing.seed', 'Dashboard test seed', 'Administration', 'Administration',
   'Seed disposable dashboard test data. Super Admin only.',
   true, 73),
  ('admin.vector.manage', 'Vector index admin', 'Administration', 'Administration',
   'Rebuild / remove Ask Viv vector indexes and embed corpora.',
   true, 74),
  ('admin.integrations.xero_connect', 'Connect / disconnect Xero', 'Administration', 'Administration',
   'Connect or disconnect the shared Vivacity Xero organisation. Super Admin + Integrator.',
   true, 75),
  ('audits.export_pack', 'Export compliance pack', 'Audits', 'Audits',
   'Download a compliance-pack zip. Super Admin via this key; client Admin via the edge-function orAllow path.',
   true, 931)
ON CONFLICT (feature_key) DO NOTHING;

-- All-staff keys (is_vivacity_internal equivalent)
INSERT INTO public.role_permissions (feature_key, role, level)
SELECT f.feature_key, r.role, 'full'::public.permission_level
FROM (VALUES
  ('staff.internal'),
  ('staff.sharepoint.use'),
  ('staff.email.send'),
  ('staff.documents.generate'),
  ('staff.ai.use'),
  ('staff.research.use'),
  ('staff.meetings.use'),
  ('staff.billing.xero_view'),
  ('staff.integrations.tga')
) AS f(feature_key)
CROSS JOIN (VALUES
  ('Super Admin'),
  ('Team Leader'),
  ('Team Member'),
  ('Integrator'),
  ('BGT'),
  ('CSC'),
  ('CET')
) AS r(role)
ON CONFLICT (role, feature_key) DO NOTHING;

-- Add-in: previous JWT allowlist was Super Admin / Team Leader / Team Member / SuperAdmin
INSERT INTO public.role_permissions (feature_key, role, level)
VALUES
  ('staff.addin.use', 'Super Admin', 'full'),
  ('staff.addin.use', 'Team Leader', 'full'),
  ('staff.addin.use', 'Team Member', 'full'),
  ('staff.addin.use', 'Integrator', 'none'),
  ('staff.addin.use', 'BGT', 'none'),
  ('staff.addin.use', 'CSC', 'none'),
  ('staff.addin.use', 'CET', 'none')
ON CONFLICT (role, feature_key) DO NOTHING;

-- Super Admin only (other roles none; SA also always-passes inside check_permission)
INSERT INTO public.role_permissions (feature_key, role, level)
SELECT f.feature_key, r.role,
       CASE WHEN r.role = 'Super Admin' THEN 'full' ELSE 'none' END::public.permission_level
FROM (VALUES
  ('admin.permissions.manage'),
  ('admin.migration.unicorn1'),
  ('admin.testing.seed'),
  ('admin.vector.manage'),
  ('audits.export_pack')
) AS f(feature_key)
CROSS JOIN (VALUES
  ('Super Admin'),
  ('Team Leader'),
  ('Team Member'),
  ('Integrator'),
  ('BGT'),
  ('CSC'),
  ('CET')
) AS r(role)
ON CONFLICT (role, feature_key) DO NOTHING;

-- Xero connect: Super Admin + Integrator (matches administration:access)
INSERT INTO public.role_permissions (feature_key, role, level)
VALUES
  ('admin.integrations.xero_connect', 'Super Admin', 'full'),
  ('admin.integrations.xero_connect', 'Team Leader', 'none'),
  ('admin.integrations.xero_connect', 'Team Member', 'none'),
  ('admin.integrations.xero_connect', 'Integrator', 'full'),
  ('admin.integrations.xero_connect', 'BGT', 'none'),
  ('admin.integrations.xero_connect', 'CSC', 'none'),
  ('admin.integrations.xero_connect', 'CET', 'none')
ON CONFLICT (role, feature_key) DO NOTHING;
