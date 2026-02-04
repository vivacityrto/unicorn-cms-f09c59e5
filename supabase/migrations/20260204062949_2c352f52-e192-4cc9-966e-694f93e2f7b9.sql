-- =====================================================
-- Fix search_path for all public functions missing it
-- =====================================================
-- This prevents search path injection attacks by ensuring
-- functions use a fixed, secure search_path.

-- SECURITY DEFINER functions (highest priority)
ALTER FUNCTION public.accept_invite(p_token text) SET search_path = public;
ALTER FUNCTION public.add_audit_response(p_audit_question_id bigint, p_rating text, p_notes text, p_risk_level text, p_tags text[]) SET search_path = public;
ALTER FUNCTION public.auto_generate_next_meeting() SET search_path = public;
ALTER FUNCTION public.calculate_membership_health(p_tenant_id bigint, p_package_id bigint) SET search_path = public;
ALTER FUNCTION public.create_audit(p_tenant_id bigint, p_client_id uuid, p_created_by uuid) SET search_path = public;
ALTER FUNCTION public.create_audit_action(p_finding_id bigint, p_assigned_to uuid, p_due_date date, p_description text) SET search_path = public;
ALTER FUNCTION public.create_tenant(p_name text, p_slug text, p_admin_email text) SET search_path = public;
ALTER FUNCTION public.current_tenant() SET search_path = public;
ALTER FUNCTION public.generate_findings(p_audit_id bigint) SET search_path = public;
ALTER FUNCTION public.get_audit_report(p_audit_id bigint) SET search_path = public;
ALTER FUNCTION public.invite_user(p_tenant_id uuid, p_email text, p_role text) SET search_path = public;
ALTER FUNCTION public.is_tenant_admin(p_tenant_id bigint) SET search_path = public;
ALTER FUNCTION public.is_vivacity() SET search_path = public;
ALTER FUNCTION public.log_task_completion() SET search_path = public;
ALTER FUNCTION public.set_active_tenant(p_tenant_id uuid) SET search_path = public;
ALTER FUNCTION public.trigger_automated_email_on_task_assignment() SET search_path = public;
ALTER FUNCTION public.user_in_tenant(p_tenant_id bigint) SET search_path = public;

-- NON-SECURITY DEFINER functions (lower priority but still important)
ALTER FUNCTION public.block_write_on_versions() SET search_path = public;
ALTER FUNCTION public.current_user_role() SET search_path = public;
ALTER FUNCTION public.current_user_tenant() SET search_path = public;
ALTER FUNCTION public.generate_package_slug() SET search_path = public;
ALTER FUNCTION public.generate_username(p_email text, p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.normalize_company_key(txt text) SET search_path = public;
ALTER FUNCTION public.propagate_folder_name_change() SET search_path = public;
ALTER FUNCTION public.protect_completed_meeting_data() SET search_path = public;
ALTER FUNCTION public.set_fiscal_quarter() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_training_videos_folder_name() SET search_path = public;
ALTER FUNCTION public.tenant_has_package(p_tenant_id bigint, p_package_id bigint) SET search_path = public;
ALTER FUNCTION public.trg_profiles_set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_membership_updated_at() SET search_path = public;
ALTER FUNCTION public.update_package_stages_updated_at() SET search_path = public;
ALTER FUNCTION public.update_system_reference_lists_updated_at() SET search_path = public;
ALTER FUNCTION public.update_tga_updated_at() SET search_path = public;
ALTER FUNCTION public.update_user_time_capture_settings_timestamp() SET search_path = public;