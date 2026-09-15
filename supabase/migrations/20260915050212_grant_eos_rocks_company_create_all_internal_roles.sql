-- RBAC v6 decision (Carl, 2026-09-15, per P1-x eos.rocks.own.manage golden-
-- matrix draft): "internal staff can create rocks" -- eos.rocks.company.create
-- should not be restricted to Super Admin/Team Leader. This was already the
-- de facto behavior (neither the UI dropdown gate nor eos_rocks RLS actually
-- checks rock_level on create), so this migration brings the permission
-- catalogue in line with the confirmed policy rather than adding new
-- enforcement to match the old, narrower catalogue row.

UPDATE public.role_permissions
SET level = 'full'
WHERE feature_key = 'eos.rocks.company.create'
  AND role IN ('BGT', 'CET', 'CSC', 'Integrator')
  AND level = 'none';
