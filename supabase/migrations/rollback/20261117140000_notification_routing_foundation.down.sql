-- Rollback for 20261117140000_notification_routing_foundation.sql
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Removes everything the migration added. No existing object was altered other
-- than the new users.notification_exempt column. The delegate, preference and
-- override tables hold only data created after the migration; export them first
-- if they have been used. audit_events rows written by the delegate RPCs
-- (entity = 'notification_delegate') are history and are left in place.

DROP FUNCTION IF EXISTS public.end_notification_delegate(uuid);
DROP FUNCTION IF EXISTS public.create_notification_delegate(text, uuid, uuid, bigint, text[]);
DROP FUNCTION IF EXISTS public.resolve_notification_recipients(text, bigint, uuid, uuid);
DROP FUNCTION IF EXISTS public.notification_effective_pref(uuid, text, text);
DROP TABLE IF EXISTS public.staff_notification_delegates;
DROP TABLE IF EXISTS public.notification_client_overrides;
DROP TABLE IF EXISTS public.notification_preferences;
DROP TABLE IF EXISTS public.notification_role_defaults;
DROP TABLE IF EXISTS public.notification_category;
ALTER TABLE public.users DROP COLUMN IF EXISTS notification_exempt;
