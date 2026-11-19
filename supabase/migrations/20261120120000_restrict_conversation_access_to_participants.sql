-- Conversations are visible to, and changed by, the people in them (and Vivacity staff), not by everyone in the organisation.
-- Changes row-level security policies on public.tenant_conversations and public.conversation_participants. No row is changed.
--
-- Found in the messenger redesign review (20 November 2026):
--   * tc_select let ANY member of an organisation read the subject and last-message preview of EVERY conversation of that
--     organisation, including conversations they are not in (the message bodies were already protected by tenant_messages).
--   * tc_update_auth let ANY member change ANY conversation of their organisation (subject, status, assignee).
--   * cp_insert_auth let ANY member add ANY participant to ANY conversation of their organisation, which would then
--     grant read access to its messages.
-- Clients only ever read conversations they are in, create their own, and mark their own read position, so nothing a
-- client uses is lost. Vivacity staff and super admins keep full access.
--
-- Impact measured in a read-only production count before writing this: 346 of 1,430 (client user, conversation) pairs stop
-- being visible (283 of them broadcasts); those users were never participants, so they could not open those threads.

-- Drop EVERY existing policy on both tables, whatever it was called, so an older differently named policy cannot still
-- admit members (permissive policies are OR-ed together). The full set is recreated below.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('tenant_conversations', 'conversation_participants')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- tenant_conversations
-- ---------------------------------------------------------------------------------------------------------------

-- Read: staff, or a person who started the conversation or is in it (and still has access to the organisation).
create policy tc_select on public.tenant_conversations
  for select to authenticated
  using (
    public.is_super_admin_safe((select auth.uid()))
    or public.is_vivacity_team_safe((select auth.uid()))
    or (
      public.has_tenant_access_safe(tenant_id, (select auth.uid()))
      and (
        created_by_user_uuid = (select auth.uid())
        or public.is_conversation_participant_safe(id, (select auth.uid()))
      )
    )
  );

-- Create: unchanged (staff, or a member creating their own conversation in their own organisation).
create policy tc_insert_auth on public.tenant_conversations
  for insert to authenticated
  with check (
    public.is_super_admin_safe((select auth.uid()))
    or public.is_vivacity_team_safe((select auth.uid()))
    or (
      created_by_user_uuid = (select auth.uid())
      and tenant_id in (select tu.tenant_id from public.tenant_users tu where tu.user_id = (select auth.uid()))
    )
  );

-- Change: staff only (clients never edit conversation subject, status or assignee; previews are kept by the message trigger).
create policy tc_update_auth on public.tenant_conversations
  for update to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())))
  with check (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));

-- Delete: unchanged (staff).
create policy tc_delete_staff on public.tenant_conversations
  for delete to authenticated
  using (public.is_vivacity_team_safe((select auth.uid())));

-- ---------------------------------------------------------------------------------------------------------------
-- conversation_participants
-- ---------------------------------------------------------------------------------------------------------------

-- Read: unchanged (staff, your own row, or a conversation you are in).
create policy cp_select_member on public.conversation_participants
  for select to authenticated
  using (
    public.is_super_admin()
    or public.is_vivacity_team_safe((select auth.uid()))
    or user_id = (select auth.uid())
    or public.is_conversation_participant_safe(conversation_id, (select auth.uid()))
  );

-- Add: staff, or the person who created the conversation adding someone with access to that organisation
-- (this covers adding yourself and the primary consultant when starting a conversation).
create policy cp_insert_auth on public.conversation_participants
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.is_vivacity_team_safe((select auth.uid()))
    or exists (
      select 1
      from public.tenant_conversations tc
      where tc.id = conversation_participants.conversation_id
        and tc.created_by_user_uuid = (select auth.uid())
        and public.has_tenant_access_safe(tc.tenant_id, conversation_participants.user_id)
    )
  );

-- Update: unchanged (your own row, for the read position).
create policy cp_update_own on public.conversation_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Remove: unchanged (super admin, or an administrator of the conversation's organisation).
create policy cp_delete_admin on public.conversation_participants
  for delete to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.tenant_conversations tc
      where tc.id = conversation_participants.conversation_id
        and public.is_tenant_admin(tc.tenant_id)
    )
  );
