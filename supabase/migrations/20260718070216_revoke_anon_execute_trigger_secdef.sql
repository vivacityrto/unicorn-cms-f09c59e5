-- Anon function access review (18 Jul 2026)
--
-- Step 1 (live privilege inventory) could not be run via SQL in this agent
-- environment (Supabase MCP unauthenticated; no DB password / access token).
-- Reconstructed via:
--   (1) REST probe as anon against typed SECURITY DEFINER RPCs
--   (2) migration inventory of RETURNS trigger + SECURITY DEFINER without a
--       prior REVOKE ... FROM anon
--
-- Step 2 triage:
--   (a) KEEP — genuine RPC / RLS helpers still callable by anon (do not revoke):
--       can_access_qc, can_access_tenant, can_facilitate_eos, can_manage_packages,
--       get_current_user_role, get_current_user_tenant, has_any_eos_role,
--       has_meeting_role, has_tenant_access, has_tenant_access_safe,
--       has_tenant_admin, is_conversation_participant_safe, is_eos_admin,
--       is_meeting_participant, is_qc_admin_safe, is_qc_signed, is_staff,
--       is_super_admin_safe, is_tenant_admin, is_tenant_parent_safe, is_vivacity,
--       is_vivacity_internal_safe, is_vivacity_staff, is_vivacity_team_safe,
--       is_vivacity_team_user, is_vivacity_user, rpc_search_timeline_events,
--       stage_instance_tenant_id, tenant_is_writeable,
--       user_contact_fields_change_authorized_safe, user_has_tenant_access,
--       user_in_tenant, user_in_tenant_uuid
--   (b) REVOKE — trigger-only SECURITY DEFINER helpers below (not called via
--       supabase.rpc(); fire only through table triggers).
--
-- Step 3: reviewed bucket (b) revoke statements.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.audit_accountability_chart_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_eos_alert_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_eos_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_issue_changes() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_notify_docs_ready() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_tenant_sharepoint_settings() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_generate_next_meeting() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_seed_agenda_templates() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cascade_rock_status_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cascade_seat_owner_to_rocks() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_invitation_expiry() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_membership_utilisation_alerts() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_avatar_on_delete() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_action_items_portal_column_guard() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_issue_meeting_rules() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_action_item_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_client_ai_session() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_client_audit_findings() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_client_audit_responses() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_copilot_session() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_evidence_upload() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_knowledge_edge() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_knowledge_node() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_retention_forecast() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_risk_forecast() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_strategic_signal() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_tenant_engagement_settings() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_tenant_message_send() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_tenant_users() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_tenant_users_delete() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_users() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit_workflow_signal() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_time_entry() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_event_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_check_consultant_overload_alert() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_check_membership_usage_alerts() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_client_note_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_client_task_completion_timeline() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_email_send_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_email_tickets_audit() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_email_tickets_enforce_closed_consistency() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_email_tickets_set_response_due_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_email_tickets_set_ticket_number() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_notify_conversation_participants() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_notify_csc_on_support_ticket() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_reallocate_time_entry() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_package_instance_flags() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_team_task_completion_timeline() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_time_draft_client_match_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_time_entry_audit() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_time_entry_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_update_conversation_on_message() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_validate_time_entry_package() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_eos_issue_status_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_user_login() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_risk_events_from_findings() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_auth_user_to_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_action_item_comment_timeline() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_action_item_timeline_event() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_burn_forecast() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_compliance_audit_event() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_eos_process_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_knowledge_item_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_permission_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_stage_health_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_workload_snapshot() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pdp_evidence_items_fill_academy_duration() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sch_log_booking_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_meeting_attendees() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_stage_instances_from_template() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_organisation() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_type_from_role() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suggest_items_force_client_visibility() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suggest_items_visibility_guard() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_avatar_to_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_last_sign_in() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_last_sign_in_on_user_insert() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_tenant_rto_to_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_tenant_secondary_contact_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_user_type() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_recalc_package_hours_used() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_seed_staff_onboarding_checklist() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_staff_onboarding_complete() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_auto_assign_consultant_on_create() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_derive_org_type_on_package_insert() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_ops_work_items_set_completed_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_pdp_auto_evidence_on_completion() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_tasks_tenants_set_completed_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_tenant_lifecycle_audit() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_update_event_conducted_date() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_validate_documents_lookup_fields() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_automated_email_on_task_assignment() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_evidence_request_status() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_excel_bindings_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_notification_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_tenant_documents_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_tenant_members_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_tenant_status() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_kickstart_tas() FROM anon, authenticated, PUBLIC;

COMMIT;

NOTIFY pgrst, 'reload schema';
