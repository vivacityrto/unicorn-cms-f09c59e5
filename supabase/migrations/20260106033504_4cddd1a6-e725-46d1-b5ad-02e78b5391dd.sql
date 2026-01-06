
-- =====================================================
-- RLS POLICIES FOR REMAINING TABLES (USING EXISTING FUNCTIONS)
-- =====================================================

-- =====================================================
-- CATEGORY 1: LOOKUP/REFERENCE TABLES (Read-only for authenticated, write for SuperAdmin)
-- =====================================================

-- app_settings
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_write_sa" ON public.app_settings;
CREATE POLICY "app_settings_select" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_write_sa" ON public.app_settings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ctstates (lookup)
ALTER TABLE public.ctstates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctstates_select" ON public.ctstates;
DROP POLICY IF EXISTS "ctstates_write_sa" ON public.ctstates;
CREATE POLICY "ctstates_select" ON public.ctstates FOR SELECT TO authenticated USING (true);
CREATE POLICY "ctstates_write_sa" ON public.ctstates FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ctstatus (lookup)
ALTER TABLE public.ctstatus FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctstatus_select" ON public.ctstatus;
DROP POLICY IF EXISTS "ctstatus_write_sa" ON public.ctstatus;
CREATE POLICY "ctstatus_select" ON public.ctstatus FOR SELECT TO authenticated USING (true);
CREATE POLICY "ctstatus_write_sa" ON public.ctstatus FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- dd_address_type (lookup)
ALTER TABLE public.dd_address_type FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dd_address_type_select" ON public.dd_address_type;
DROP POLICY IF EXISTS "dd_address_type_write_sa" ON public.dd_address_type;
CREATE POLICY "dd_address_type_select" ON public.dd_address_type FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_address_type_write_sa" ON public.dd_address_type FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- labels (lookup)
ALTER TABLE public.labels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "labels_select" ON public.labels;
DROP POLICY IF EXISTS "labels_write_sa" ON public.labels;
CREATE POLICY "labels_select" ON public.labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "labels_write_sa" ON public.labels FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- task_statuses (lookup)
ALTER TABLE public.task_statuses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_statuses_select" ON public.task_statuses;
DROP POLICY IF EXISTS "task_statuses_write_sa" ON public.task_statuses;
CREATE POLICY "task_statuses_select" ON public.task_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "task_statuses_write_sa" ON public.task_statuses FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- place_holders (lookup)
ALTER TABLE public.place_holders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "place_holders_select" ON public.place_holders;
DROP POLICY IF EXISTS "place_holders_write_sa" ON public.place_holders;
CREATE POLICY "place_holders_select" ON public.place_holders FOR SELECT TO authenticated USING (true);
CREATE POLICY "place_holders_write_sa" ON public.place_holders FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 2: STAFF-ONLY TABLES (SuperAdmin only)
-- =====================================================

-- audit_log
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_sa_all" ON public.audit_log;
CREATE POLICY "audit_log_sa_all" ON public.audit_log FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- audit_events
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_events_sa_all" ON public.audit_events;
CREATE POLICY "audit_events_sa_all" ON public.audit_events FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- auth_tokens (internal security)
ALTER TABLE public.auth_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_tokens_sa_all" ON public.auth_tokens;
CREATE POLICY "auth_tokens_sa_all" ON public.auth_tokens FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- email_templates (master templates)
ALTER TABLE public.email_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_templates_sa_all" ON public.email_templates;
CREATE POLICY "email_templates_sa_all" ON public.email_templates FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- system_emails
ALTER TABLE public.system_emails FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_emails_sa_all" ON public.system_emails;
CREATE POLICY "system_emails_sa_all" ON public.system_emails FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- unicorn_import_logs
ALTER TABLE public.unicorn_import_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unicorn_import_logs_sa_all" ON public.unicorn_import_logs;
CREATE POLICY "unicorn_import_logs_sa_all" ON public.unicorn_import_logs FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- legacy_client_map
ALTER TABLE public.legacy_client_map FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legacy_client_map_sa_all" ON public.legacy_client_map;
CREATE POLICY "legacy_client_map_sa_all" ON public.legacy_client_map FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- client_liaisons (staff assignments)
ALTER TABLE public.client_liaisons FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_liaisons_sa_all" ON public.client_liaisons;
CREATE POLICY "client_liaisons_sa_all" ON public.client_liaisons FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- clientfields (legacy)
ALTER TABLE public.clientfields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clientfields_sa_all" ON public.clientfields;
CREATE POLICY "clientfields_sa_all" ON public.clientfields FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- documentfields (legacy)
ALTER TABLE public.documentfields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documentfields_sa_all" ON public.documentfields;
CREATE POLICY "documentfields_sa_all" ON public.documentfields FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- risk_flags (internal)
ALTER TABLE public.risk_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "risk_flags_sa_all" ON public.risk_flags;
CREATE POLICY "risk_flags_sa_all" ON public.risk_flags FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 3: CACHE TABLES (Read all authenticated, write SuperAdmin)
-- =====================================================

-- course_cache
ALTER TABLE public.course_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "course_cache_select" ON public.course_cache;
DROP POLICY IF EXISTS "course_cache_write_sa" ON public.course_cache;
CREATE POLICY "course_cache_select" ON public.course_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "course_cache_write_sa" ON public.course_cache FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- qualification_cache
ALTER TABLE public.qualification_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qualification_cache_select" ON public.qualification_cache;
DROP POLICY IF EXISTS "qualification_cache_write_sa" ON public.qualification_cache;
CREATE POLICY "qualification_cache_select" ON public.qualification_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "qualification_cache_write_sa" ON public.qualification_cache FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- rto_cache
ALTER TABLE public.rto_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rto_cache_select" ON public.rto_cache;
DROP POLICY IF EXISTS "rto_cache_write_sa" ON public.rto_cache;
CREATE POLICY "rto_cache_select" ON public.rto_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "rto_cache_write_sa" ON public.rto_cache FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- skillset_cache
ALTER TABLE public.skillset_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "skillset_cache_select" ON public.skillset_cache;
DROP POLICY IF EXISTS "skillset_cache_write_sa" ON public.skillset_cache;
CREATE POLICY "skillset_cache_select" ON public.skillset_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "skillset_cache_write_sa" ON public.skillset_cache FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- unit_cache
ALTER TABLE public.unit_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unit_cache_select" ON public.unit_cache;
DROP POLICY IF EXISTS "unit_cache_write_sa" ON public.unit_cache;
CREATE POLICY "unit_cache_select" ON public.unit_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "unit_cache_write_sa" ON public.unit_cache FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 4: INTEGRATION TABLES (SuperAdmin only)
-- =====================================================

-- clickup_integration
ALTER TABLE public.clickup_integration FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clickup_integration_sa_all" ON public.clickup_integration;
CREATE POLICY "clickup_integration_sa_all" ON public.clickup_integration FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- clickup_lists
ALTER TABLE public.clickup_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clickup_lists_sa_all" ON public.clickup_lists;
CREATE POLICY "clickup_lists_sa_all" ON public.clickup_lists FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- clickup_sync_logs
ALTER TABLE public.clickup_sync_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clickup_sync_logs_sa_all" ON public.clickup_sync_logs;
CREATE POLICY "clickup_sync_logs_sa_all" ON public.clickup_sync_logs FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 5: EMAIL/COMMUNICATION TABLES (SuperAdmin only)
-- =====================================================

-- email_logs
ALTER TABLE public.email_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_logs_sa_all" ON public.email_logs;
CREATE POLICY "email_logs_sa_all" ON public.email_logs FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- email_sends
ALTER TABLE public.email_sends FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_sends_sa_all" ON public.email_sends;
CREATE POLICY "email_sends_sa_all" ON public.email_sends FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- email_events
ALTER TABLE public.email_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_events_sa_all" ON public.email_events;
CREATE POLICY "email_events_sa_all" ON public.email_events FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- email_delivery_issues
ALTER TABLE public.email_delivery_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_delivery_issues_sa_all" ON public.email_delivery_issues;
CREATE POLICY "email_delivery_issues_sa_all" ON public.email_delivery_issues FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- emailinstances
ALTER TABLE public.emailinstances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "emailinstances_sa_all" ON public.emailinstances;
CREATE POLICY "emailinstances_sa_all" ON public.emailinstances FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 6: MESSAGING (User's own messages - UUID types)
-- =====================================================

-- conversations (participants can access)
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_write" ON public.conversations;
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT TO authenticated USING (
  public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  )
);
CREATE POLICY "conversations_write" ON public.conversations FOR ALL TO authenticated USING (
  public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  )
) WITH CHECK (
  public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  )
);

-- conversation_participants
ALTER TABLE public.conversation_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_write" ON public.conversation_participants;
CREATE POLICY "conversation_participants_select" ON public.conversation_participants FOR SELECT TO authenticated USING (
  public.is_super_admin() OR user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id AND cp2.user_id = auth.uid()
  )
);
CREATE POLICY "conversation_participants_write" ON public.conversation_participants FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- messages
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated USING (
  public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  )
);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin() OR (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    )
  )
);

-- =====================================================
-- CATEGORY 7: CONSULT/TIME TRACKING (SuperAdmin only - Staff features)
-- =====================================================

-- consults
ALTER TABLE public.consults FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consults_sa_all" ON public.consults;
CREATE POLICY "consults_sa_all" ON public.consults FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- consult_entries
ALTER TABLE public.consult_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consult_entries_sa_all" ON public.consult_entries;
CREATE POLICY "consult_entries_sa_all" ON public.consult_entries FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- consult_logs
ALTER TABLE public.consult_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consult_logs_sa_all" ON public.consult_logs;
CREATE POLICY "consult_logs_sa_all" ON public.consult_logs FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- time_tracking
ALTER TABLE public.time_tracking FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_tracking_sa_all" ON public.time_tracking;
CREATE POLICY "time_tracking_sa_all" ON public.time_tracking FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- projects
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_sa_all" ON public.projects;
CREATE POLICY "projects_sa_all" ON public.projects FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 8: PACKAGE MANAGEMENT (SuperAdmin only)
-- =====================================================

-- package_hours
ALTER TABLE public.package_hours FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "package_hours_sa_all" ON public.package_hours;
CREATE POLICY "package_hours_sa_all" ON public.package_hours FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- package_instances
ALTER TABLE public.package_instances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "package_instances_sa_all" ON public.package_instances;
CREATE POLICY "package_instances_sa_all" ON public.package_instances FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- package_notes
ALTER TABLE public.package_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "package_notes_sa_all" ON public.package_notes;
CREATE POLICY "package_notes_sa_all" ON public.package_notes FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- stage_instances
ALTER TABLE public.stage_instances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stage_instances_sa_all" ON public.stage_instances;
CREATE POLICY "stage_instances_sa_all" ON public.stage_instances FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 9: SCHEDULER TABLES (SuperAdmin only)
-- =====================================================

-- sch_audit_log
ALTER TABLE public.sch_audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_audit_log_sa_all" ON public.sch_audit_log;
CREATE POLICY "sch_audit_log_sa_all" ON public.sch_audit_log FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- sch_away_blocks
ALTER TABLE public.sch_away_blocks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_away_blocks_sa_all" ON public.sch_away_blocks;
CREATE POLICY "sch_away_blocks_sa_all" ON public.sch_away_blocks FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- sch_bookings
ALTER TABLE public.sch_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_bookings_sa_all" ON public.sch_bookings;
CREATE POLICY "sch_bookings_sa_all" ON public.sch_bookings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- sch_calendar_credentials
ALTER TABLE public.sch_calendar_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_calendar_credentials_sa_all" ON public.sch_calendar_credentials;
CREATE POLICY "sch_calendar_credentials_sa_all" ON public.sch_calendar_credentials FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- sch_champion
ALTER TABLE public.sch_champion FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_champion_sa_all" ON public.sch_champion;
CREATE POLICY "sch_champion_sa_all" ON public.sch_champion FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- sch_meeting_types
ALTER TABLE public.sch_meeting_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_meeting_types_sa_all" ON public.sch_meeting_types;
CREATE POLICY "sch_meeting_types_sa_all" ON public.sch_meeting_types FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- sch_working_hours
ALTER TABLE public.sch_working_hours FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sch_working_hours_sa_all" ON public.sch_working_hours;
CREATE POLICY "sch_working_hours_sa_all" ON public.sch_working_hours FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 10: TRAINER/TRAINING TABLES (SuperAdmin)
-- =====================================================

-- trainers
ALTER TABLE public.trainers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainers_sa_all" ON public.trainers;
CREATE POLICY "trainers_sa_all" ON public.trainers FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- training_products
ALTER TABLE public.training_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_products_sa_all" ON public.training_products;
CREATE POLICY "training_products_sa_all" ON public.training_products FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- trainer_training_products
ALTER TABLE public.trainer_training_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainer_training_products_sa_all" ON public.trainer_training_products;
CREATE POLICY "trainer_training_products_sa_all" ON public.trainer_training_products FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- =====================================================
-- CATEGORY 11: USER ACTIVITY (Own records only)
-- =====================================================

-- user_activity
ALTER TABLE public.user_activity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_activity_select" ON public.user_activity;
DROP POLICY IF EXISTS "user_activity_insert" ON public.user_activity;
CREATE POLICY "user_activity_select" ON public.user_activity FOR SELECT TO authenticated USING (
  public.is_super_admin() OR user_id = auth.uid()
);
CREATE POLICY "user_activity_insert" ON public.user_activity FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);

-- =====================================================
-- CATEGORY 12: CONNECTED TENANTS (User's own connections)
-- Uses existing user_in_tenant function
-- =====================================================

-- connected_tenants
ALTER TABLE public.connected_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "connected_tenants_select" ON public.connected_tenants;
DROP POLICY IF EXISTS "connected_tenants_write" ON public.connected_tenants;
CREATE POLICY "connected_tenants_select" ON public.connected_tenants FOR SELECT TO authenticated USING (
  public.is_super_admin() OR user_uuid = auth.uid() OR public.user_in_tenant(tenant_id)
);
CREATE POLICY "connected_tenants_write" ON public.connected_tenants FOR ALL TO authenticated USING (
  public.is_super_admin() OR user_uuid = auth.uid()
) WITH CHECK (
  public.is_super_admin() OR user_uuid = auth.uid()
);

-- =====================================================
-- CATEGORY 13: TENANT ADDRESSES (UUID tenant_id - SuperAdmin only for now)
-- Will need special handling for UUID tenant scoping later
-- =====================================================

-- tenant_addresses (SuperAdmin only for now due to UUID mismatch)
ALTER TABLE public.tenant_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_addresses_sa_all" ON public.tenant_addresses;
CREATE POLICY "tenant_addresses_sa_all" ON public.tenant_addresses FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
