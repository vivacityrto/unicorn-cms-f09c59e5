-- Archive legacy audit_log table + orphan log_user_change() trigger function.
-- Context:
--   * audit_log: 0 rows since inception; superseded by v_workspace_audit_log
--     federation (20-source UNION) + audit_user_events for the user-domain
--     equivalent. Flagged P0 ("wrong shape") by 8 May 2026 Deployment
--     Readiness Audit.
--   * log_user_change(): SECURITY DEFINER trigger function NOT bound to any
--     table (verified live). Body INSERTs to audit_log using non-existent
--     column `changed_by` (actual column: `editor_uuid`) — would error on
--     every fire even if attached. Archived alongside its target table to
--     preserve the broken-writer + dead-target pair for forensics.
--
-- Precedent: archive schema already holds users_tenant_role_legacy
-- (enum-to-dd Phase 1B-C) plus 5 backup_* tables. Same pattern applied here.
--
-- Verification (pre-apply, all confirmed live):
--   * 0 incoming FKs targeting public.audit_log
--   * 0 triggers bound to public.log_user_change
--   * 0 other public.* functions reference public.audit_log
--   * 0 edge function references to bare audit_log
--   * src/ references = types.ts only (auto-regens)
--   * RLS policies + indexes + owned sequence travel with ALTER TABLE SET SCHEMA
--
-- ROLLBACK (one-statement reverse):
--   ALTER TABLE archive.audit_log SET SCHEMA public;
--   ALTER FUNCTION archive.log_user_change() SET SCHEMA public;

-- 1. Move the orphan trigger function first.
ALTER FUNCTION public.log_user_change() SET SCHEMA archive;

-- 2. Move the empty table. Policies, indexes, owned sequence (audit_log_id_seq),
--    and outgoing FK to public.users(user_uuid) all travel with it.
ALTER TABLE public.audit_log SET SCHEMA archive;