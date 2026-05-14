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
 SELECT eos_template_audit_log.id,
    eos_template_audit_log.tenant_id,
    eos_template_audit_log.user_id AS actor_id,
    eos_template_audit_log.action,
    'eos_template'::text AS domain,
    'eos_template'::text AS entity_type,
    COALESCE(eos_template_audit_log.version_id::text, eos_template_audit_log.template_id::text) AS entity_id,
    NULL::jsonb AS old_val,
    NULL::jsonb AS new_val,
    COALESCE(eos_template_audit_log.details, '{}'::jsonb) || jsonb_build_object('change_summary', eos_template_audit_log.change_summary, 'template_id', eos_template_audit_log.template_id) AS metadata,
    eos_template_audit_log.created_at
   FROM eos_template_audit_log
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
   FROM public.addin_audit_log
  WHERE addin_audit_log.tenant_id IS NOT NULL;

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_views
          WHERE schemaname='public' AND viewname='v_workspace_audit_log') = 1,
    'View v_workspace_audit_log missing after replace';
  ASSERT (SELECT pg_get_viewdef('public.v_workspace_audit_log'::regclass, true)
          ILIKE '%addin_audit_log%'),
    'addin_audit_log branch not present in view definition';
END $$;