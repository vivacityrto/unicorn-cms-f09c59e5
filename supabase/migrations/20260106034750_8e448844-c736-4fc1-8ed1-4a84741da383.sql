-- =====================================================
-- TENANT PORTAL RLS POLICIES - COMPLETE
-- =====================================================

-- -----------------------------------------------------
-- DROP dependent policies first, then functions
-- -----------------------------------------------------
drop policy if exists "invites_insert_admin_or_sa" on public.user_invitations;
drop policy if exists "invites_update_admin_or_sa" on public.user_invitations;
drop policy if exists "invites_delete_admin_or_sa" on public.user_invitations;
drop policy if exists "tenant_members_write_admin_or_sa" on public.tenant_members;

-- Now drop and recreate functions
drop function if exists public.is_tenant_admin(bigint);
drop function if exists public.is_tenant_member(bigint);

-- -----------------------------------------------------
-- HELPER FUNCTIONS (bigint version for most tables)
-- -----------------------------------------------------
create function public.is_tenant_member(p_tenant_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

revoke all on function public.is_tenant_member(bigint) from public;
grant execute on function public.is_tenant_member(bigint) to authenticated;

create function public.is_tenant_admin(p_tenant_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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

revoke all on function public.is_tenant_admin(bigint) from public;
grant execute on function public.is_tenant_admin(bigint) to authenticated;

-- -----------------------------------------------------
-- HELPER FUNCTIONS (UUID version for projects table)
-- -----------------------------------------------------
create or replace function public.is_tenant_member_uuid(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id::text = p_tenant_id::text
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_tenant_admin_uuid(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id::text = p_tenant_id::text
      and tm.user_id = auth.uid()
      and tm.role = 'Admin'
      and tm.status = 'active'
  );
$$;

revoke all on function public.is_tenant_member_uuid(uuid) from public;
grant execute on function public.is_tenant_member_uuid(uuid) to authenticated;
revoke all on function public.is_tenant_admin_uuid(uuid) from public;
grant execute on function public.is_tenant_admin_uuid(uuid) to authenticated;

-- -----------------------------------------------------
-- Recreate dropped policies for user_invitations and tenant_members
-- -----------------------------------------------------
create policy "invites_insert_admin_or_sa"
on public.user_invitations for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(user_invitations.tenant_id)
);

create policy "invites_update_admin_or_sa"
on public.user_invitations for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(user_invitations.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(user_invitations.tenant_id));

create policy "invites_delete_admin_or_sa"
on public.user_invitations for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(user_invitations.tenant_id));

create policy "tenant_members_write_admin_or_sa"
on public.tenant_members for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(tenant_members.tenant_id)
);

create policy "tenant_members_update_admin_or_sa"
on public.tenant_members for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(tenant_members.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(tenant_members.tenant_id));

create policy "tenant_members_delete_admin_or_sa"
on public.tenant_members for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(tenant_members.tenant_id));

-- -----------------------------------------------------
-- 1. PROJECTS - Tenant members can read, admins can manage (UUID tenant_id)
-- -----------------------------------------------------
alter table public.projects enable row level security;
alter table public.projects force row level security;

drop policy if exists "sa_all_projects" on public.projects;
drop policy if exists "projects_select_member_or_sa" on public.projects;
drop policy if exists "projects_write_admin_or_sa" on public.projects;
drop policy if exists "projects_update_admin_or_sa" on public.projects;
drop policy if exists "projects_delete_admin_or_sa" on public.projects;

create policy "projects_select_member_or_sa"
on public.projects for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member_uuid(projects.tenant_id)
);

create policy "projects_write_admin_or_sa"
on public.projects for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin_uuid(projects.tenant_id)
);

create policy "projects_update_admin_or_sa"
on public.projects for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin_uuid(projects.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin_uuid(projects.tenant_id));

create policy "projects_delete_admin_or_sa"
on public.projects for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin_uuid(projects.tenant_id));

-- -----------------------------------------------------
-- 2. DOCUMENTS - Tenant members can read, admins can manage
-- -----------------------------------------------------
alter table public.documents enable row level security;
alter table public.documents force row level security;

drop policy if exists "sa_all_documents" on public.documents;
drop policy if exists "documents_select_member_or_sa" on public.documents;
drop policy if exists "documents_write_admin_or_sa" on public.documents;
drop policy if exists "documents_update_admin_or_sa" on public.documents;
drop policy if exists "documents_delete_admin_or_sa" on public.documents;

create policy "documents_select_member_or_sa"
on public.documents for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member(documents.tenant_id)
);

create policy "documents_write_admin_or_sa"
on public.documents for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(documents.tenant_id)
);

create policy "documents_update_admin_or_sa"
on public.documents for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(documents.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(documents.tenant_id));

create policy "documents_delete_admin_or_sa"
on public.documents for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(documents.tenant_id));

-- -----------------------------------------------------
-- 3. DOCUMENTS_NOTES - Tenant members can read, admins can manage
-- -----------------------------------------------------
alter table public.documents_notes enable row level security;
alter table public.documents_notes force row level security;

drop policy if exists "sa_all_documents_notes" on public.documents_notes;
drop policy if exists "documents_notes_select_member_or_sa" on public.documents_notes;
drop policy if exists "documents_notes_write_admin_or_sa" on public.documents_notes;
drop policy if exists "documents_notes_update_admin_or_sa" on public.documents_notes;
drop policy if exists "documents_notes_delete_admin_or_sa" on public.documents_notes;

create policy "documents_notes_select_member_or_sa"
on public.documents_notes for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member(documents_notes.tenant_id)
);

create policy "documents_notes_write_admin_or_sa"
on public.documents_notes for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(documents_notes.tenant_id)
);

create policy "documents_notes_update_admin_or_sa"
on public.documents_notes for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(documents_notes.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(documents_notes.tenant_id));

create policy "documents_notes_delete_admin_or_sa"
on public.documents_notes for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(documents_notes.tenant_id));

-- -----------------------------------------------------
-- 4. DOCUMENT_INSTANCES - Tenant members can read, admins can manage
-- -----------------------------------------------------
alter table public.document_instances enable row level security;
alter table public.document_instances force row level security;

drop policy if exists "sa_all_document_instances" on public.document_instances;
drop policy if exists "document_instances_select_member_or_sa" on public.document_instances;
drop policy if exists "document_instances_write_admin_or_sa" on public.document_instances;
drop policy if exists "document_instances_update_admin_or_sa" on public.document_instances;
drop policy if exists "document_instances_delete_admin_or_sa" on public.document_instances;

create policy "document_instances_select_member_or_sa"
on public.document_instances for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member(document_instances.tenant_id)
);

create policy "document_instances_write_admin_or_sa"
on public.document_instances for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(document_instances.tenant_id)
);

create policy "document_instances_update_admin_or_sa"
on public.document_instances for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(document_instances.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(document_instances.tenant_id));

create policy "document_instances_delete_admin_or_sa"
on public.document_instances for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(document_instances.tenant_id));

-- -----------------------------------------------------
-- 5. CLIENT_PACKAGE_STAGE_STATE - Tenant members can read, admins can manage
-- -----------------------------------------------------
alter table public.client_package_stage_state enable row level security;
alter table public.client_package_stage_state force row level security;

drop policy if exists "sa_all_client_package_stage_state" on public.client_package_stage_state;
drop policy if exists "cpss_select_member_or_sa" on public.client_package_stage_state;
drop policy if exists "cpss_write_admin_or_sa" on public.client_package_stage_state;
drop policy if exists "cpss_update_admin_or_sa" on public.client_package_stage_state;
drop policy if exists "cpss_delete_admin_or_sa" on public.client_package_stage_state;

create policy "cpss_select_member_or_sa"
on public.client_package_stage_state for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member(client_package_stage_state.tenant_id)
);

create policy "cpss_write_admin_or_sa"
on public.client_package_stage_state for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(client_package_stage_state.tenant_id)
);

create policy "cpss_update_admin_or_sa"
on public.client_package_stage_state for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(client_package_stage_state.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(client_package_stage_state.tenant_id));

create policy "cpss_delete_admin_or_sa"
on public.client_package_stage_state for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(client_package_stage_state.tenant_id));

-- -----------------------------------------------------
-- 6. CALENDAR_ENTRIES - Tenant members can read, admins can manage
-- -----------------------------------------------------
alter table public.calendar_entries enable row level security;
alter table public.calendar_entries force row level security;

drop policy if exists "sa_all_calendar_entries" on public.calendar_entries;
drop policy if exists "calendar_entries_select_member_or_sa" on public.calendar_entries;
drop policy if exists "calendar_entries_write_admin_or_sa" on public.calendar_entries;
drop policy if exists "calendar_entries_update_admin_or_sa" on public.calendar_entries;
drop policy if exists "calendar_entries_delete_admin_or_sa" on public.calendar_entries;

create policy "calendar_entries_select_member_or_sa"
on public.calendar_entries for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member(calendar_entries.tenant_id)
);

create policy "calendar_entries_write_admin_or_sa"
on public.calendar_entries for insert to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(calendar_entries.tenant_id)
);

create policy "calendar_entries_update_admin_or_sa"
on public.calendar_entries for update to authenticated
using (public.is_super_admin() or public.is_tenant_admin(calendar_entries.tenant_id))
with check (public.is_super_admin() or public.is_tenant_admin(calendar_entries.tenant_id));

create policy "calendar_entries_delete_admin_or_sa"
on public.calendar_entries for delete to authenticated
using (public.is_super_admin() or public.is_tenant_admin(calendar_entries.tenant_id));