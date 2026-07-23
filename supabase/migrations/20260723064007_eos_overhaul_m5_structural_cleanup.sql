-- ============================================================
-- EOS Meeting Overhaul — Migration 5 (Structural cleanup)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). STRUCTURAL ONLY, runs after M4 (data-only). Apply in the
-- 22:00-04:00 AEST off-peak window per project convention.
--
-- Every drop below verified live before writing this file:
--   - eos_agenda_template_versions / eos_template_audit_log / their 3
--     RPCs: confirmed zero frontend callers (grep) and zero other DB
--     function bodies reference them.
--   - CRITICAL catch not in the original plan: eos_meetings.template_version_id
--     carries a live FK into eos_agenda_template_versions - this FK must
--     be dropped before the table, or the DROP TABLE fails outright.
--   - auto_seed_agenda_templates(): the tenant-insert trigger's only
--     action is `PERFORM seed_system_agenda_templates(NEW.id)` - the
--     (bigint) overload. The zero-arg seed_system_agenda_templates()
--     has no callers anywhere (confirmed) - already dead today. Once
--     the trigger is dropped, the (bigint) overload becomes orphaned
--     too, so both are dropped together here.
--   - create_meeting_from_template/create_meeting_basic: each has one
--     LIVE overload (confirmed by exact named-argument match against
--     the frontend's actual supabase.rpc() call) and one DEAD overload.
--     The dead create_meeting_from_template overload literally selects
--     `template_type`/`duration_minutes` columns that do not exist on
--     eos_agenda_templates - would error if ever invoked. The dead
--     create_meeting_basic overload has no `p_duration_minutes` param,
--     so a named-argument call that always includes it (as the frontend's
--     does) can never resolve to it. Only the dead overloads are dropped
--     here - the live ones stay until Stage 2's frontend rebuild replaces
--     the calling code entirely (out of scope for this migration).
--   - close_meeting_with_validation(uuid): confirmed dead-from-frontend
--     in the M6 investigation (frontend always passes p_force, resolving
--     to the (uuid,boolean) overload). Dropping the no-force overload here
--     to remove the overload-resolution ambiguity before M6 rewrites the
--     surviving one.
--   - Focus_Day/Custom: confirmed 0 meetings, 0 series for tenant 6372
--     (the only tenant with any real EOS usage) across the whole table.
--     Each still had exactly one unused tenant-6372 template row, backed
--     up and removed here to unblock the dd_ row delete (RESTRICT FK).
-- ============================================================

BEGIN;

-- 0. Back up + remove the 2 tenant-6372 templates for the retiring types
--    (unblocks the dd_eos_meeting_type delete below, which is RESTRICT-FK'd
--    against any referencing eos_agenda_templates row)
CREATE TABLE public._eos_retired_type_templates_backfill_20260723 AS
SELECT * FROM public.eos_agenda_templates WHERE tenant_id = 6372 AND meeting_type IN ('Focus_Day', 'Custom');

COMMENT ON TABLE public._eos_retired_type_templates_backfill_20260723 IS
  'Backup of the 2 tenant-6372 eos_agenda_templates rows for meeting types being retired (Focus_Day, Custom) - zero real meetings/series ever used either type, confirmed live 2026-07-23. DROP AFTER 2026-10-23.';

DELETE FROM public.eos_agenda_templates WHERE tenant_id = 6372 AND meeting_type IN ('Focus_Day', 'Custom');

-- 1. Break the circular/cross-table FKs before dropping the versions table
ALTER TABLE public.eos_agenda_templates DROP CONSTRAINT eos_agenda_templates_current_version_id_fkey;
ALTER TABLE public.eos_meetings DROP CONSTRAINT eos_meetings_template_version_id_fkey;

-- 2. Drop the dead versioning subsystem entirely (zero frontend callers, confirmed)
DROP TABLE public.eos_template_audit_log;
DROP TABLE public.eos_agenda_template_versions;
DROP FUNCTION public.create_template_version(uuid, jsonb, text, boolean);
DROP FUNCTION public.restore_template_version(uuid, text);
DROP FUNCTION public.init_template_versions();

-- 3. Stop auto-seeding templates on new tenant creation - EOS is Vivacity-only,
--    no future tenant will ever need this
DROP TRIGGER seed_agenda_templates_on_tenant_create ON public.tenants;
DROP FUNCTION public.auto_seed_agenda_templates();
DROP FUNCTION public.seed_system_agenda_templates();
DROP FUNCTION public.seed_system_agenda_templates(bigint);

-- 4. Drop duplicate/broken RPC overloads confirmed dead via live call-site check
DROP FUNCTION public.create_meeting_from_template(uuid, timestamp with time zone, timestamp with time zone, uuid, uuid, text, uuid[], text, uuid, bigint);
DROP FUNCTION public.create_meeting_basic(bigint, text, text, timestamp with time zone, uuid);
DROP FUNCTION public.close_meeting_with_validation(uuid);

-- 5. Focus_Day / Custom meeting types: zero real meetings/series ever created
DELETE FROM public.dd_eos_meeting_type WHERE value IN ('Focus_Day', 'Custom');

NOTIFY pgrst, 'reload schema';

COMMIT;
