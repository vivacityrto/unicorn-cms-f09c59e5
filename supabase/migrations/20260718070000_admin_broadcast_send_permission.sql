-- =====================================================================
-- Seed admin.broadcast.send feature + role_permissions
-- Used by send-broadcast-campaign edge function via check_permission.
--
-- ROLLBACK:
--   DELETE FROM public.role_permissions WHERE feature_key = 'admin.broadcast.send';
--   DELETE FROM public.permission_features WHERE feature_key = 'admin.broadcast.send';
-- =====================================================================

INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active, sort_order)
VALUES (
  'admin.broadcast.send',
  'Send broadcast campaigns',
  'Administration',
  'Administration',
  'Send bulk broadcast messages to clients via send-broadcast-campaign',
  true,
  45
)
ON CONFLICT (feature_key) DO NOTHING;

-- Match admin.cohort.send / admin.invites.manage: Super Admin full, others none
INSERT INTO public.role_permissions (feature_key, role, level) VALUES
  ('admin.broadcast.send', 'Super Admin', 'full'),
  ('admin.broadcast.send', 'Team Leader', 'none'),
  ('admin.broadcast.send', 'Integrator', 'none'),
  ('admin.broadcast.send', 'BGT', 'none'),
  ('admin.broadcast.send', 'CSC', 'none'),
  ('admin.broadcast.send', 'CET', 'none')
ON CONFLICT (role, feature_key) DO NOTHING;
