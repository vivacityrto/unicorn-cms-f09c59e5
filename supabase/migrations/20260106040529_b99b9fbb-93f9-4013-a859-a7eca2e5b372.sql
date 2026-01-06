-- =====================================================
-- First: Create the is_tenant_admin function if missing
-- =====================================================

create or replace function public.is_tenant_admin(p_tenant_id bigint)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.role = 'Admin'
      and tm.status = 'active'
  );
$$;

-- =====================================================
-- B3: Recreate write policies for tenant-scoped tables
-- =====================================================

-- 3.1 tenant_members (Admin or SuperAdmin can manage)
create policy tenant_members_write_admin_or_sa
on public.tenant_members
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(tenant_members.tenant_id)
);

create policy tenant_members_update_admin_or_sa
on public.tenant_members
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(tenant_members.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(tenant_members.tenant_id)
);

create policy tenant_members_delete_admin_or_sa
on public.tenant_members
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(tenant_members.tenant_id)
);

-- 3.2 documents (Admin or SuperAdmin can manage)
create policy documents_write_admin_or_sa
on public.documents
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(documents.tenant_id)
);

create policy documents_update_admin_or_sa
on public.documents
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(documents.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(documents.tenant_id)
);

create policy documents_delete_admin_or_sa
on public.documents
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(documents.tenant_id)
);

-- 3.3 documents_notes (Admin or SuperAdmin can manage)
create policy documents_notes_write_admin_or_sa
on public.documents_notes
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(documents_notes.tenant_id)
);

create policy documents_notes_update_admin_or_sa
on public.documents_notes
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(documents_notes.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(documents_notes.tenant_id)
);

create policy documents_notes_delete_admin_or_sa
on public.documents_notes
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(documents_notes.tenant_id)
);

-- 3.4 document_instances (Admin or SuperAdmin can manage)
create policy document_instances_write_admin_or_sa
on public.document_instances
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(document_instances.tenant_id)
);

create policy document_instances_update_admin_or_sa
on public.document_instances
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(document_instances.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(document_instances.tenant_id)
);

create policy document_instances_delete_admin_or_sa
on public.document_instances
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(document_instances.tenant_id)
);

-- 3.5 client_package_stage_state (Admin or SuperAdmin can manage)
create policy cpss_write_admin_or_sa
on public.client_package_stage_state
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(client_package_stage_state.tenant_id)
);

create policy cpss_update_admin_or_sa
on public.client_package_stage_state
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(client_package_stage_state.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(client_package_stage_state.tenant_id)
);

create policy cpss_delete_admin_or_sa
on public.client_package_stage_state
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(client_package_stage_state.tenant_id)
);

-- 3.6 calendar_entries (Admin or SuperAdmin can manage)
create policy calendar_entries_write_admin_or_sa
on public.calendar_entries
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(calendar_entries.tenant_id)
);

create policy calendar_entries_update_admin_or_sa
on public.calendar_entries
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(calendar_entries.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(calendar_entries.tenant_id)
);

create policy calendar_entries_delete_admin_or_sa
on public.calendar_entries
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(calendar_entries.tenant_id)
);

-- 3.7 conversations (Admin or SuperAdmin can manage)
create policy conversations_insert_access
on public.conversations
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(conversations.tenant_id)
);

create policy conversations_update_access
on public.conversations
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(conversations.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(conversations.tenant_id)
);

create policy conversations_delete_access
on public.conversations
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(conversations.tenant_id)
);

-- 3.7b conversation_participants (via parent conversation's tenant_id)
create policy cp_insert_access
on public.conversation_participants
for insert
to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_participants.conversation_id
      and public.is_tenant_admin(c.tenant_id)
  )
);

create policy cp_delete_access
on public.conversation_participants
for delete
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_participants.conversation_id
      and public.is_tenant_admin(c.tenant_id)
  )
);