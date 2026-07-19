INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active, sort_order)
VALUES ('admin.broadcast.send', 'Send broadcast campaigns', 'Administration', 'Administration',
        'Send bulk broadcast messages to clients via send-broadcast-campaign', true, 45)
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO public.role_permissions (feature_key, role, level) VALUES
  ('admin.broadcast.send', 'Super Admin', 'full'),
  ('admin.broadcast.send', 'Team Leader', 'full'),
  ('admin.broadcast.send', 'Team Member', 'full'),
  ('admin.broadcast.send', 'Integrator', 'none'),
  ('admin.broadcast.send', 'BGT', 'none'),
  ('admin.broadcast.send', 'CSC', 'none'),
  ('admin.broadcast.send', 'CET', 'none')
ON CONFLICT (role, feature_key) DO UPDATE SET level = EXCLUDED.level;