
-- =========================================================
-- Enable RLS on all 12 new tables
-- =========================================================
alter table public.client_portal_sessions enable row level security;
alter table public.client_documents enable row level security;
alter table public.client_document_shares enable row level security;
alter table public.client_document_requests enable row level security;
alter table public.tenant_conversations enable row level security;
alter table public.tenant_messages enable row level security;
alter table public.tenant_message_attachments enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_escalations enable row level security;
alter table public.tga_rto_flags enable row level security;
alter table public.tga_rto_acknowledgements enable row level security;

-- =========================================================
-- 1) client_portal_sessions
--    Staff: full CRUD. Tenant members: read own tenant sessions.
-- =========================================================
create policy "cps_select_staff"
  on public.client_portal_sessions for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cps_select_tenant"
  on public.client_portal_sessions for select to authenticated
  using (public.has_tenant_access_safe(tenant_id, auth.uid())
         and (acting_user_uuid = auth.uid() or viewer_user_uuid = auth.uid()));

create policy "cps_insert_staff"
  on public.client_portal_sessions for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "cps_delete_staff"
  on public.client_portal_sessions for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 2) client_documents
--    Staff: full CRUD. Tenant members: read docs with visibility='tenant'.
--    Tenant members can insert direction='from_client' docs.
-- =========================================================
create policy "cd_select_staff"
  on public.client_documents for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cd_select_tenant"
  on public.client_documents for select to authenticated
  using (visibility = 'tenant'
         and public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "cd_insert_staff"
  on public.client_documents for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "cd_insert_tenant"
  on public.client_documents for insert to authenticated
  with check (direction = 'from_client'
              and uploaded_by_user_uuid = auth.uid()
              and public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "cd_update_staff"
  on public.client_documents for update to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cd_delete_staff"
  on public.client_documents for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 3) client_document_shares
--    Staff: full CRUD. Shared-with user: read own shares.
-- =========================================================
create policy "cds_select_staff"
  on public.client_document_shares for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cds_select_shared_user"
  on public.client_document_shares for select to authenticated
  using (shared_with_user_uuid = auth.uid());

create policy "cds_insert_staff"
  on public.client_document_shares for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "cds_delete_staff"
  on public.client_document_shares for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 4) client_document_requests
--    Staff: full CRUD. Tenant members: read own tenant, create own.
-- =========================================================
create policy "cdr_select_staff"
  on public.client_document_requests for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cdr_select_tenant"
  on public.client_document_requests for select to authenticated
  using (public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "cdr_insert_tenant"
  on public.client_document_requests for insert to authenticated
  with check (requested_by_user_uuid = auth.uid()
              and public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "cdr_update_staff"
  on public.client_document_requests for update to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cdr_update_requester"
  on public.client_document_requests for update to authenticated
  using (requested_by_user_uuid = auth.uid()
         and status in ('open'));

create policy "cdr_delete_staff"
  on public.client_document_requests for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 5) tenant_conversations
--    Staff: full CRUD. Tenant members: read/create own tenant.
-- =========================================================
create policy "tc_select_staff"
  on public.tenant_conversations for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "tc_select_tenant"
  on public.tenant_conversations for select to authenticated
  using (public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "tc_insert_tenant"
  on public.tenant_conversations for insert to authenticated
  with check (created_by_user_uuid = auth.uid()
              and public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "tc_insert_staff"
  on public.tenant_conversations for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "tc_update_staff"
  on public.tenant_conversations for update to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "tc_delete_staff"
  on public.tenant_conversations for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 6) tenant_messages
--    Staff: full CRUD. Tenant members: read own tenant, send own.
-- =========================================================
create policy "tm_select_staff"
  on public.tenant_messages for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "tm_select_tenant"
  on public.tenant_messages for select to authenticated
  using (public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "tm_insert_staff"
  on public.tenant_messages for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "tm_insert_tenant"
  on public.tenant_messages for insert to authenticated
  with check (sender_user_uuid = auth.uid()
              and public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "tm_delete_staff"
  on public.tenant_messages for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 7) tenant_message_attachments
--    Staff: full CRUD. Tenant members: read if they can read parent message.
-- =========================================================
create policy "tma_select_staff"
  on public.tenant_message_attachments for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "tma_select_tenant"
  on public.tenant_message_attachments for select to authenticated
  using (exists (
    select 1 from public.tenant_messages m
    where m.id = message_id
      and public.has_tenant_access_safe(m.tenant_id, auth.uid())
  ));

create policy "tma_insert_staff"
  on public.tenant_message_attachments for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "tma_insert_sender"
  on public.tenant_message_attachments for insert to authenticated
  with check (exists (
    select 1 from public.tenant_messages m
    where m.id = message_id
      and m.sender_user_uuid = auth.uid()
  ));

create policy "tma_delete_staff"
  on public.tenant_message_attachments for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 8) chat_sessions
--    Staff: read all. Users: own sessions only.
-- =========================================================
create policy "cs_select_staff"
  on public.chat_sessions for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cs_select_own"
  on public.chat_sessions for select to authenticated
  using (user_uuid = auth.uid());

create policy "cs_insert_own"
  on public.chat_sessions for insert to authenticated
  with check (user_uuid = auth.uid());

create policy "cs_delete_staff"
  on public.chat_sessions for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 9) chat_messages
--    Staff: read all. Users: read own session messages.
-- =========================================================
create policy "cm_select_staff"
  on public.chat_messages for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "cm_select_own"
  on public.chat_messages for select to authenticated
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id
      and s.user_uuid = auth.uid()
  ));

create policy "cm_insert_own"
  on public.chat_messages for insert to authenticated
  with check (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id
      and s.user_uuid = auth.uid()
  ));

create policy "cm_delete_staff"
  on public.chat_messages for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 10) chat_escalations
--     Staff: full CRUD. Users: read own session escalations.
-- =========================================================
create policy "ce_select_staff"
  on public.chat_escalations for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "ce_select_own"
  on public.chat_escalations for select to authenticated
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id
      and s.user_uuid = auth.uid()
  ));

create policy "ce_insert_staff"
  on public.chat_escalations for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "ce_insert_own"
  on public.chat_escalations for insert to authenticated
  with check (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id
      and s.user_uuid = auth.uid()
  ));

create policy "ce_delete_staff"
  on public.chat_escalations for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 11) tga_rto_flags
--     Staff: full CRUD. Tenant members: read own tenant.
-- =========================================================
create policy "trf_select_staff"
  on public.tga_rto_flags for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "trf_select_tenant"
  on public.tga_rto_flags for select to authenticated
  using (public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "trf_insert_staff"
  on public.tga_rto_flags for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "trf_update_staff"
  on public.tga_rto_flags for update to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "trf_delete_staff"
  on public.tga_rto_flags for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

-- =========================================================
-- 12) tga_rto_acknowledgements
--     Staff: full CRUD. Tenant members: read own tenant, create own.
-- =========================================================
create policy "tra_select_staff"
  on public.tga_rto_acknowledgements for select to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));

create policy "tra_select_tenant"
  on public.tga_rto_acknowledgements for select to authenticated
  using (public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "tra_insert_tenant"
  on public.tga_rto_acknowledgements for insert to authenticated
  with check (ack_by_user_uuid = auth.uid()
              and public.has_tenant_access_safe(tenant_id, auth.uid()));

create policy "tra_insert_staff"
  on public.tga_rto_acknowledgements for insert to authenticated
  with check (public.is_vivacity_team_safe(auth.uid()));

create policy "tra_delete_staff"
  on public.tga_rto_acknowledgements for delete to authenticated
  using (public.is_vivacity_team_safe(auth.uid()));
