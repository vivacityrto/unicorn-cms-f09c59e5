-- Reconcile M3: revoke anon EXECUTE on 15 admin/bulk functions.
-- Re-derived from live truth (not the historical "92" figure).
-- Excluded (deliberately): delete_document_cascade and bulk_reassign_primary_csc
-- already committed in PR #4 and 20260630023343/20260702031811 respectively.
-- set_user_organisation is a separate standalone follow-up.
BEGIN;
REVOKE ALL ON FUNCTION public.admin_fix_invitations(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fix_invitations(boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_fix_memberships(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fix_memberships(boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_fix_profile_linkage(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fix_profile_linkage(boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_fix_user_linkage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fix_user_linkage(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_remove_tenant_csc_assignment(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_remove_tenant_csc_assignment(bigint, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_search_clients(text, text, text[], integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_clients(text, text, text[], integer, integer, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_role_type(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_role_type(uuid, text, bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_tenant_csc_assignment(bigint, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_csc_assignment(bigint, uuid, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_csc_profile(uuid, boolean, text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_csc_profile(uuid, boolean, text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bulk_create_documents_with_versions(jsonb, text, text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_create_documents_with_versions(jsonb, text, text, text[], boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_active_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_tenant(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_cohort_job_status(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_cohort_job_status(uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_issue_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_issue_status(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_relationship_role(bigint, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_relationship_role(bigint, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_user_notification_prefs(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_notification_prefs(jsonb) TO authenticated, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
-- sync-nudge 2026-07-22: file present in working tree; awaiting Lovable→GitHub flush
