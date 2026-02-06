-- Retry with bigint tenant_id compatibility

create or replace function public.is_tenant_parent_safe(p_tenant_id bigint, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = p_user_id
      and tu.role = 'parent'
  );
$$;

create or replace function public.tenant_has_any_users_safe(p_tenant_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = p_tenant_id
  );
$$;

create or replace function public.user_has_tenant_access_safe(p_tenant_id bigint, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = p_user_id
  );
$$;

alter table public.tenant_users enable row level security;

drop policy if exists "tenant_users_select_own" on public.tenant_users;
drop policy if exists "tenant_users_insert_parent" on public.tenant_users;
drop policy if exists "tenant_users_delete_parent" on public.tenant_users;
drop policy if exists "tenant_users_select" on public.tenant_users;
drop policy if exists "tenant_users_insert" on public.tenant_users;
drop policy if exists "tenant_users_update" on public.tenant_users;
drop policy if exists "tenant_users_delete" on public.tenant_users;

create policy "tenant_users_select"
on public.tenant_users
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_tenant_parent_safe(tenant_id, auth.uid())
);

create policy "tenant_users_insert"
on public.tenant_users
for insert
to authenticated
with check (
  public.is_tenant_parent_safe(tenant_id, auth.uid())
  or not public.tenant_has_any_users_safe(tenant_id)
);

create policy "tenant_users_update"
on public.tenant_users
for update
to authenticated
using (
  public.is_tenant_parent_safe(tenant_id, auth.uid())
)
with check (
  public.is_tenant_parent_safe(tenant_id, auth.uid())
);

create policy "tenant_users_delete"
on public.tenant_users
for delete
to authenticated
using (
  public.is_tenant_parent_safe(tenant_id, auth.uid())
);

-- Storage policies

drop policy if exists "Tenant users can upload to their tenant" on storage.objects;
drop policy if exists "Tenant users can view their tenant files" on storage.objects;
drop policy if exists "Tenant users can upload to portal-documents" on storage.objects;
drop policy if exists "Tenant users can view portal-documents" on storage.objects;

create policy "Tenant users can upload to portal-documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portal-documents'
  and not is_staff()
  and public.user_has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
);

create policy "Tenant users can view portal-documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portal-documents'
  and not is_staff()
  and public.user_has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
);

-- FK for PostgREST relationship discovery
alter table public.portal_documents
  drop constraint if exists portal_documents_linked_package_id_fkey;

alter table public.portal_documents
  add constraint portal_documents_linked_package_id_fkey
  foreign key (linked_package_id)
  references public.packages(id)
  on delete set null;