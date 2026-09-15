-- Introduce a dedicated "System Account" primary role for non-human
-- identities (Carl, 2026-09-15), rather than continuing to overload the
-- already-deprecated "Team Member" role (dd_unicorn_roles.is_active=false
-- for Team Member confirms it) for test/admin/automation accounts.
--
-- bulk-generate-automation@vivacity.com.au is a live production automation
-- identity (see supabase/functions/bulk-generate-documents-worker/index.ts)
-- whose one real capability (admin.documents.bulk_generate) is already
-- granted via a separate supplemental "Bulk Generate Automation" role in
-- user_roles/role_permissions -- untouched by this migration. Its primary
-- unicorn_role is reassigned here; its actual worker capability is
-- unaffected.
--
-- No role_permissions rows are added for System Account itself
-- (least-privilege default) -- any future system account needing a real
-- capability should get it via its own dedicated supplemental role,
-- matching the existing Bulk Generate Automation precedent.

INSERT INTO public.dd_unicorn_roles (label, value, description, is_active, sort_order, is_internal)
VALUES (
  'System Account',
  'System Account',
  'Non-human identity: test fixture, generic admin utility account, or automation/service principal. Never selectable for a real staff invite. Excluded from all staff-facing pickers/directories via is_system_account.',
  false,
  100,
  true
)
ON CONFLICT (value) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_internal = EXCLUDED.is_internal,
      updated_at = now();

UPDATE public.users
SET unicorn_role = 'System Account',
    is_system_account = true
WHERE lower(COALESCE(email, email_address)) IN (
  'admin@vivacity.com.au',
  'angela+invitetest@vivacity.com.au',
  'bulk-generate-automation@vivacity.com.au'
);
