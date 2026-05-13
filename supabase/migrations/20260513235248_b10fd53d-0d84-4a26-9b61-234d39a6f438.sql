CREATE VIEW public.v_workspace_audit_log WITH (security_invoker = true) AS

-- 1. audit_eos_events
SELECT id::uuid, tenant_id::bigint, user_id::uuid AS actor_id,
       action::text, 'eos_event'::text AS domain,
       entity::text AS entity_type, entity_id::text,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       details::jsonb AS metadata, created_at::timestamptz
FROM public.audit_eos_events

UNION ALL

-- 2. client_audit_log
SELECT id::uuid, tenant_id::bigint, actor_user_id::uuid AS actor_id,
       action::text, 'client'::text AS domain,
       entity_type::text, entity_id::text,
       before_data::jsonb AS old_val, after_data::jsonb AS new_val,
       details::jsonb AS metadata, created_at::timestamptz
FROM public.client_audit_log

UNION ALL

-- 3. time_entry_audit_log
SELECT id::uuid, tenant_id::bigint AS tenant_id, actor_user_id::uuid AS actor_id,
       action::text, 'time_entry'::text AS domain,
       'time_entry'::text AS entity_type, time_entry_id::text AS entity_id,
       old_row::jsonb AS old_val, new_row::jsonb AS new_val,
       NULL::jsonb AS metadata, created_at::timestamptz
FROM public.time_entry_audit_log

UNION ALL

-- 4. audit_client_impersonation
SELECT id::uuid, tenant_id::bigint AS tenant_id, actor_user_id::uuid AS actor_id,
       'impersonation_started'::text AS action, 'impersonation'::text AS domain,
       'tenant'::text AS entity_type, tenant_id::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object('reason', reason, 'started_at', started_at, 'ended_at', ended_at) AS metadata,
       started_at::timestamptz AS created_at
FROM public.audit_client_impersonation

UNION ALL

-- 5. tga_import_audit
SELECT id::uuid, tenant_id::bigint, triggered_by::uuid AS actor_id,
       action::text, 'tga_import'::text AS domain,
       'tga_import'::text AS entity_type, coalesce(run_id::text, rto_code::text) AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'rto_code', rto_code, 'stage', stage, 'status', status,
         'rows_affected', rows_affected, 'error_message', error_message
       ) AS metadata,
       created_at::timestamptz
FROM public.tga_import_audit

UNION ALL

-- 6. sharepoint_access_log
SELECT id::uuid, tenant_id::bigint, user_id::uuid AS actor_id,
       action::text, 'sharepoint'::text AS domain,
       'sharepoint_item'::text AS entity_type, item_id::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object('drive_id', drive_id, 'file_name', file_name) AS metadata,
       created_at::timestamptz
FROM public.sharepoint_access_log

UNION ALL

-- 7. document_activity_log
SELECT id::uuid, tenant_id::bigint, actor_user_id::uuid AS actor_id,
       activity_type::text AS action, 'document'::text AS domain,
       'document'::text AS entity_type, document_id::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'client_id', client_id, 'package_id', package_id, 'stage_id', stage_id,
         'actor_role', actor_role, 'file_name', file_name
       ) AS metadata,
       occurred_at::timestamptz AS created_at
FROM public.document_activity_log

UNION ALL

-- 8. portal_document_audit
SELECT id::uuid, tenant_id::bigint, actor_user_id::uuid AS actor_id,
       action::text, 'portal_document'::text AS domain,
       document_type::text AS entity_type, document_id::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'actor_role', actor_role, 'reason', reason
       ) AS metadata,
       occurred_at::timestamptz AS created_at
FROM public.portal_document_audit

UNION ALL

-- 9. meeting_sync_audit
SELECT id::uuid, tenant_id::bigint, user_id::uuid AS actor_id,
       action::text, 'meeting_sync'::text AS domain,
       'meeting_sync'::text AS entity_type, NULL::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object(
         'meetings_created', meetings_created, 'meetings_updated', meetings_updated,
         'meetings_skipped', meetings_skipped, 'error_message', error_message
       ) AS metadata,
       created_at::timestamptz
FROM public.meeting_sync_audit

UNION ALL

-- 10. engagement_audit_log
SELECT id::uuid, tenant_id::bigint, actor_user_uuid::uuid AS actor_id,
       event_type::text AS action, 'engagement'::text AS domain,
       'engagement'::text AS entity_type,
       coalesce(package_instance_id::text, client_id::text) AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(validation_notes, '{}'::jsonb) || jsonb_build_object(
         'tier', tier, 'integrity_validation_passed', integrity_validation_passed,
         'client_id', client_id, 'package_instance_id', package_instance_id
       ) AS metadata,
       created_at::timestamptz
FROM public.engagement_audit_log

UNION ALL

-- 11. ai_events
SELECT ai_event_id::uuid AS id, tenant_id::bigint, actor_user_id::uuid AS actor_id,
       task_type::text AS action, 'ai'::text AS domain,
       feature::text AS entity_type, request_id::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object(
         'model_name', model_name, 'status', status, 'latency_ms', latency_ms,
         'confidence', confidence, 'input_hash', input_hash, 'context_hash', context_hash
       ) AS metadata,
       created_at::timestamptz
FROM public.ai_events

UNION ALL

-- 12. eos_minutes_audit_log
SELECT id::uuid, tenant_id::bigint, user_id::uuid AS actor_id,
       action::text, 'eos_minutes'::text AS domain,
       'meeting_minutes'::text AS entity_type,
       coalesce(minutes_version_id::text, meeting_id::text) AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(details, '{}'::jsonb) || jsonb_build_object(
         'change_summary', change_summary, 'meeting_id', meeting_id
       ) AS metadata,
       created_at::timestamptz
FROM public.eos_minutes_audit_log

UNION ALL

-- 13. eos_template_audit_log
SELECT id::uuid, tenant_id::bigint, user_id::uuid AS actor_id,
       action::text, 'eos_template'::text AS domain,
       'eos_template'::text AS entity_type,
       coalesce(version_id::text, template_id::text) AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(details, '{}'::jsonb) || jsonb_build_object(
         'change_summary', change_summary, 'template_id', template_id
       ) AS metadata,
       created_at::timestamptz
FROM public.eos_template_audit_log

UNION ALL

-- 14. consultant_assignment_audit_log
SELECT id::uuid, tenant_id::bigint, created_by::uuid AS actor_id,
       action::text, 'consultant_assignment'::text AS domain,
       'consultant_assignment'::text AS entity_type,
       selected_consultant_user_id::text AS entity_id,
       NULL::jsonb AS old_val, candidate_snapshot::jsonb AS new_val,
       jsonb_build_object(
         'previous_consultant_user_id', previous_consultant_user_id,
         'over_capacity', over_capacity, 'reason', reason,
         'new_client_weekly_required', new_client_weekly_required,
         'onboarding_multiplier', onboarding_multiplier,
         'selected_projected_remaining', selected_projected_remaining
       ) AS metadata,
       created_at::timestamptz
FROM public.consultant_assignment_audit_log

UNION ALL

-- 15. assistant_audit_log
SELECT id::uuid, client_tenant_id::bigint AS tenant_id, viewer_user_id::uuid AS actor_id,
       action::text, 'assistant'::text AS domain,
       report_type::text AS entity_type, thread_id::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object(
         'sources_used', sources_used, 'redactions_applied', redactions_applied,
         'request_text', request_text, 'response_summary', response_summary
       ) AS metadata,
       created_at::timestamptz
FROM public.assistant_audit_log

UNION ALL

-- 16. audit_restricted_actions
SELECT id::uuid, tenant_id::bigint, user_id::uuid AS actor_id,
       action_attempted::text AS action, 'restricted_action'::text AS domain,
       NULL::text AS entity_type, NULL::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object(
         'permission_required', permission_required,
         'user_role', user_role, 'page_path', page_path
       ) AS metadata,
       created_at::timestamptz
FROM public.audit_restricted_actions

UNION ALL

-- 17. audit_user_events
SELECT id::uuid, tenant_id::bigint, actor_user_uuid::uuid AS actor_id,
       action::text, 'user'::text AS domain,
       'user'::text AS entity_type, target_user_uuid::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       coalesce(details, '{}'::jsonb) || jsonb_build_object('reason', reason) AS metadata,
       created_at::timestamptz
FROM public.audit_user_events

UNION ALL

-- 18. process_audit_log
SELECT id::uuid, tenant_id::bigint, actor_user_id::uuid AS actor_id,
       action::text, 'process'::text AS domain,
       'process'::text AS entity_type, process_id::text AS entity_id,
       before_data::jsonb AS old_val, after_data::jsonb AS new_val,
       coalesce(details, '{}'::jsonb) || jsonb_build_object('reason', reason) AS metadata,
       occurred_at::timestamptz AS created_at
FROM public.process_audit_log

UNION ALL

-- 19. consultant_capacity_audit_log
SELECT id::uuid, tenant_id::bigint, created_by::uuid AS actor_id,
       assignment_method::text AS action, 'consultant_capacity'::text AS domain,
       'consultant_capacity'::text AS entity_type,
       selected_consultant_user_id::text AS entity_id,
       NULL::jsonb AS old_val, candidate_snapshot::jsonb AS new_val,
       jsonb_build_object(
         'weekly_assignable_hours', weekly_assignable_hours,
         'consultant_current_load', consultant_current_load,
         'projected_remaining', projected_remaining,
         'new_client_weekly_required', new_client_weekly_required,
         'over_capacity', over_capacity,
         'client_id', client_id
       ) AS metadata,
       created_at::timestamptz
FROM public.consultant_capacity_audit_log

UNION ALL

-- 20. audit_invites
SELECT id::uuid, tenant_id::bigint,
       CASE WHEN actor_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN actor_user_id::uuid ELSE NULL END AS actor_id,
       outcome::text AS action, 'invite'::text AS domain,
       'invite'::text AS entity_type, email::text AS entity_id,
       NULL::jsonb AS old_val, NULL::jsonb AS new_val,
       jsonb_build_object(
         'role', role, 'code', code, 'detail', detail,
         'function_version', function_version, 'invite_attempts', invite_attempts
       ) AS metadata,
       created_at::timestamptz
FROM public.audit_invites;

REVOKE ALL ON public.v_workspace_audit_log FROM PUBLIC;
GRANT SELECT ON public.v_workspace_audit_log TO authenticated;