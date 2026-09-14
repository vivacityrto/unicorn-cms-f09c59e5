-- Academy Solo: all active internal Vivacity staff may manage the controlled
-- pilot. The lifecycle RPC still enforces the canonical
-- is_vivacity_team_safe(auth.uid()) check server-side; these rows keep the
-- staff UI permission and check_permission contract aligned with that gate.
INSERT INTO public.role_permissions (feature_key, role, level)
VALUES
  ('academy.tenant_access.manage', 'Super Admin', 'full'),
  ('academy.tenant_access.manage', 'Team Leader', 'full'),
  ('academy.tenant_access.manage', 'Team Member', 'full'),
  ('academy.tenant_access.manage', 'Integrator', 'full'),
  ('academy.tenant_access.manage', 'BGT', 'full'),
  ('academy.tenant_access.manage', 'CSC', 'full'),
  ('academy.tenant_access.manage', 'CET', 'full')
ON CONFLICT (role, feature_key) DO UPDATE
SET level = EXCLUDED.level,
    updated_at = now();
