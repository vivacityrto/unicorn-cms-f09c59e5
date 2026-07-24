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
--   - CATCH FOUND ON REVIEW: public.v_workspace_audit_log has a UNION ALL
--     branch selecting FROM eos_template_audit_log - a plain DROP TABLE
--     (no CASCADE) would fail with 2BP01 "dependent objects still exist"
--     and abort this whole migration. Fixed by CREATE OR REPLACE VIEW
--     dropping that branch (view's other columns/branches are byte-for-
--     byte identical to the live definition, captured via pg_get_viewdef
--     before writing this) immediately before the DROP TABLE below.
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

-- 1.5. Detach v_workspace_audit_log from eos_template_audit_log before dropping it
--      (identical to the live view except the eos_template_audit_log UNION ALL
--      branch is removed - every other branch/column/order is unchanged)
CREATE OR REPLACE VIEW public.v_workspace_audit_log AS
 SELECT audit_eos_events.id,
    audit_eos_events.tenant_id,
    audit_eos_events.user_id AS actor_id,
    audit_eos_events.action,
    'eos_event'::text AS domain,
    audit_eos_events.entity AS entity_type,
    audit_eos_events.entity_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    audit_eos_events.details AS metadata,
    audit_eos_events.created_at
   FROM audit_eos_events
UNION ALL
 SELECT client_audit_log.id,
    client_audit_log.tenant_id,
    client_audit_log.actor_user_id AS actor_id,
    client_audit_log.action,
    'client'::text AS domain,
    client_audit_log.entity_type,
    client_audit_log.entity_id,
    client_audit_log.before_data AS old_val,
    client_audit_log.after_data AS new_val,
    client_audit_log.details AS metadata,
    client_audit_log.created_at
   FROM client_audit_log
UNION ALL
 SELECT time_entry_audit_log.id,
    time_entry_audit_log.tenant_id::bigint AS tenant_id,
    time_entry_audit_log.actor_user_id AS actor_id,
    time_entry_audit_log.action,
    'time_entry'::text AS domain,
    'time_entry'::text AS entity_type,
    time_entry_audit_log.time_entry_id::text AS entity_id,
    time_entry_audit_log.old_row AS old_val,
    time_entry_audit_log.new_row AS new_val,
    NULL::jsonb AS metadata,
    time_entry_audit_log.created_at
   FROM time_entry_audit_log
UNION ALL
 SELECT audit_client_impersonation.id,
    audit_client_impersonation.tenant_id::bigint AS tenant_id,
    audit_client_impersonation.actor_user_id AS actor_id,
    'impersonation_started'::text AS action,
    'impersonation'::text AS domain,
    'tenant'::text AS entity_type,
    audit_client_impersonation.tenant_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('reason', audit_client_impersonation.reason, 'started_at', audit_client_impersonation.started_at, 'ended_at', audit_client_impersonation.ended_at) AS metadata,
    audit_client_impersonation.started_at AS created_at
   FROM audit_client_impersonation
UNION ALL
 SELECT tga_import_audit.id,
    tga_import_audit.tenant_id,
    tga_import_audit.triggered_by AS actor_id,
    tga_import_audit.action,
    'tga_import'::text AS domain,
    'tga_import'::text AS entity_type,
    COALESCE(tga_import_audit.run_id::text, tga_import_audit.rto_code) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(tga_import_audit.metadata, '{}'::jsonb) || jsonb_build_object('rto_code', tga_import_audit.rto_code, 'stage', tga_import_audit.stage, 'status', tga_import_audit.status, 'rows_affected', tga_import_audit.rows_affected, 'error_message', tga_import_audit.error_message) AS metadata,
    tga_import_audit.created_at
   FROM tga_import_audit
UNION ALL
 SELECT sharepoint_access_log.id,
    sharepoint_access_log.tenant_id,
    sharepoint_access_log.user_id AS actor_id,
    sharepoint_access_log.action,
    'sharepoint'::text AS domain,
    'sharepoint_item'::text AS entity_type,
    sharepoint_access_log.item_id AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('drive_id', sharepoint_access_log.drive_id, 'file_name', sharepoint_access_log.file_name) AS metadata,
    sharepoint_access_log.created_at
   FROM sharepoint_access_log
UNION ALL
 SELECT document_activity_log.id,
    document_activity_log.tenant_id,
    document_activity_log.actor_user_id AS actor_id,
    document_activity_log.activity_type AS action,
    'document'::text AS domain,
    'document'::text AS entity_type,
    document_activity_log.document_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(document_activity_log.metadata, '{}'::jsonb) || jsonb_build_object('client_id', document_activity_log.client_id, 'package_id', document_activity_log.package_id, 'stage_id', document_activity_log.stage_id, 'actor_role', document_activity_log.actor_role, 'file_name', document_activity_log.file_name) AS metadata,
    document_activity_log.occurred_at AS created_at
   FROM document_activity_log
UNION ALL
 SELECT portal_document_audit.id,
    portal_document_audit.tenant_id,
    portal_document_audit.actor_user_id AS actor_id,
    portal_document_audit.action,
    'portal_document'::text AS domain,
    portal_document_audit.document_type AS entity_type,
    portal_document_audit.document_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(portal_document_audit.metadata, '{}'::jsonb) || jsonb_build_object('actor_role', portal_document_audit.actor_role, 'reason', portal_document_audit.reason) AS metadata,
    portal_document_audit.occurred_at AS created_at
   FROM portal_document_audit
UNION ALL
 SELECT meeting_sync_audit.id,
    meeting_sync_audit.tenant_id,
    meeting_sync_audit.user_id AS actor_id,
    meeting_sync_audit.action,
    'meeting_sync'::text AS domain,
    'meeting_sync'::text AS entity_type,
    NULL::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('meetings_created', meeting_sync_audit.meetings_created, 'meetings_updated', meeting_sync_audit.meetings_updated, 'meetings_skipped', meeting_sync_audit.meetings_skipped, 'error_message', meeting_sync_audit.error_message) AS metadata,
    meeting_sync_audit.created_at
   FROM meeting_sync_audit
UNION ALL
 SELECT engagement_audit_log.id,
    engagement_audit_log.tenant_id,
    engagement_audit_log.actor_user_uuid AS actor_id,
    engagement_audit_log.event_type AS action,
    'engagement'::text AS domain,
    'engagement'::text AS entity_type,
    COALESCE(engagement_audit_log.package_instance_id::text, engagement_audit_log.client_id::text) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(engagement_audit_log.validation_notes, '{}'::jsonb) || jsonb_build_object('tier', engagement_audit_log.tier, 'integrity_validation_passed', engagement_audit_log.integrity_validation_passed, 'client_id', engagement_audit_log.client_id, 'package_instance_id', engagement_audit_log.package_instance_id) AS metadata,
    engagement_audit_log.created_at
   FROM engagement_audit_log
UNION ALL
 SELECT ai_events.ai_event_id AS id,
    ai_events.tenant_id,
    ai_events.actor_user_id AS actor_id,
    ai_events.task_type AS action,
    'ai'::text AS domain,
    ai_events.feature AS entity_type,
    ai_events.request_id AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('model_name', ai_events.model_name, 'status', ai_events.status, 'latency_ms', ai_events.latency_ms, 'confidence', ai_events.confidence, 'input_hash', ai_events.input_hash, 'context_hash', ai_events.context_hash) AS metadata,
    ai_events.created_at
   FROM ai_events
UNION ALL
 SELECT eos_minutes_audit_log.id,
    eos_minutes_audit_log.tenant_id,
    eos_minutes_audit_log.user_id AS actor_id,
    eos_minutes_audit_log.action,
    'eos_minutes'::text AS domain,
    'meeting_minutes'::text AS entity_type,
    COALESCE(eos_minutes_audit_log.minutes_version_id::text, eos_minutes_audit_log.meeting_id::text) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(eos_minutes_audit_log.details, '{}'::jsonb) || jsonb_build_object('change_summary', eos_minutes_audit_log.change_summary, 'meeting_id', eos_minutes_audit_log.meeting_id) AS metadata,
    eos_minutes_audit_log.created_at
   FROM eos_minutes_audit_log
UNION ALL
 SELECT consultant_assignment_audit_log.id,
    consultant_assignment_audit_log.tenant_id,
    consultant_assignment_audit_log.created_by AS actor_id,
    consultant_assignment_audit_log.action,
    'consultant_assignment'::text AS domain,
    'consultant_assignment'::text AS entity_type,
    consultant_assignment_audit_log.selected_consultant_user_id::text AS entity_id,
    NULL::jsonb AS old_val,
    consultant_assignment_audit_log.candidate_snapshot AS new_val,
    jsonb_build_object('previous_consultant_user_id', consultant_assignment_audit_log.previous_consultant_user_id, 'over_capacity', consultant_assignment_audit_log.over_capacity, 'reason', consultant_assignment_audit_log.reason, 'new_client_weekly_required', consultant_assignment_audit_log.new_client_weekly_required, 'onboarding_multiplier', consultant_assignment_audit_log.onboarding_multiplier, 'selected_projected_remaining', consultant_assignment_audit_log.selected_projected_remaining) AS metadata,
    consultant_assignment_audit_log.created_at
   FROM consultant_assignment_audit_log
UNION ALL
 SELECT assistant_audit_log.id,
    assistant_audit_log.client_tenant_id AS tenant_id,
    assistant_audit_log.viewer_user_id AS actor_id,
    assistant_audit_log.action,
    'assistant'::text AS domain,
    assistant_audit_log.report_type AS entity_type,
    assistant_audit_log.thread_id::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('sources_used', assistant_audit_log.sources_used, 'redactions_applied', assistant_audit_log.redactions_applied, 'request_text', assistant_audit_log.request_text, 'response_summary', assistant_audit_log.response_summary) AS metadata,
    assistant_audit_log.created_at
   FROM assistant_audit_log
UNION ALL
 SELECT audit_restricted_actions.id,
    audit_restricted_actions.tenant_id,
    audit_restricted_actions.user_id AS actor_id,
    audit_restricted_actions.action_attempted AS action,
    'restricted_action'::text AS domain,
    NULL::text AS entity_type,
    NULL::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('permission_required', audit_restricted_actions.permission_required, 'user_role', audit_restricted_actions.user_role, 'page_path', audit_restricted_actions.page_path) AS metadata,
    audit_restricted_actions.created_at
   FROM audit_restricted_actions
UNION ALL
 SELECT audit_user_events.id,
    audit_user_events.tenant_id,
    audit_user_events.actor_user_uuid AS actor_id,
    audit_user_events.action,
    'user'::text AS domain,
    'user'::text AS entity_type,
    audit_user_events.target_user_uuid::text AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(audit_user_events.details, '{}'::jsonb) || jsonb_build_object('reason', audit_user_events.reason) AS metadata,
    audit_user_events.created_at
   FROM audit_user_events
UNION ALL
 SELECT process_audit_log.id,
    process_audit_log.tenant_id,
    process_audit_log.actor_user_id AS actor_id,
    process_audit_log.action,
    'process'::text AS domain,
    'process'::text AS entity_type,
    process_audit_log.process_id::text AS entity_id,
    process_audit_log.before_data AS old_val,
    process_audit_log.after_data AS new_val,
    COALESCE(process_audit_log.details, '{}'::jsonb) || jsonb_build_object('reason', process_audit_log.reason) AS metadata,
    process_audit_log.occurred_at AS created_at
   FROM process_audit_log
UNION ALL
 SELECT consultant_capacity_audit_log.id,
    consultant_capacity_audit_log.tenant_id,
    consultant_capacity_audit_log.created_by AS actor_id,
    consultant_capacity_audit_log.assignment_method AS action,
    'consultant_capacity'::text AS domain,
    'consultant_capacity'::text AS entity_type,
    consultant_capacity_audit_log.selected_consultant_user_id::text AS entity_id,
    NULL::jsonb AS old_val,
    consultant_capacity_audit_log.candidate_snapshot AS new_val,
    jsonb_build_object('weekly_assignable_hours', consultant_capacity_audit_log.weekly_assignable_hours, 'consultant_current_load', consultant_capacity_audit_log.consultant_current_load, 'projected_remaining', consultant_capacity_audit_log.projected_remaining, 'new_client_weekly_required', consultant_capacity_audit_log.new_client_weekly_required, 'over_capacity', consultant_capacity_audit_log.over_capacity, 'client_id', consultant_capacity_audit_log.client_id) AS metadata,
    consultant_capacity_audit_log.created_at
   FROM consultant_capacity_audit_log
UNION ALL
 SELECT audit_invites.id,
    audit_invites.tenant_id,
        CASE
            WHEN audit_invites.actor_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text THEN audit_invites.actor_user_id::uuid
            ELSE NULL::uuid
        END AS actor_id,
    audit_invites.outcome AS action,
    'invite'::text AS domain,
    'invite'::text AS entity_type,
    audit_invites.email AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    jsonb_build_object('role', audit_invites.role, 'code', audit_invites.code, 'detail', audit_invites.detail, 'function_version', audit_invites.function_version, 'invite_attempts', audit_invites.invite_attempts) AS metadata,
    audit_invites.created_at
   FROM audit_invites
UNION ALL
 SELECT addin_audit_log.id,
    addin_audit_log.tenant_id,
    addin_audit_log.user_uuid AS actor_id,
    addin_audit_log.action,
    'addin'::text AS domain,
    COALESCE(addin_audit_log.record_type, 'addin'::text) AS entity_type,
    addin_audit_log.record_id AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(addin_audit_log.metadata, '{}'::jsonb) || jsonb_build_object('surface', addin_audit_log.surface, 'client_info', addin_audit_log.client_info) AS metadata,
    addin_audit_log.created_at
   FROM addin_audit_log
  WHERE addin_audit_log.tenant_id IS NOT NULL;

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
