-- RLS policies for tenant tables
-- Run this SQL in your Supabase SQL editor AFTER running 02-tenant-functions.sql

-- Tenants table policies
create policy "tenants_read" on public.tenants
for select using (
  public.is_vivacity()
  or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = tenants.id
    and tm.user_id = auth.uid()
    and tm.status = 'active'
  )
);

create policy "tenants_write" on public.tenants
for all using (public.is_superadmin());

-- Tenant members policies
create policy "tenant_members_read" on public.tenant_members
for select using (
  public.is_vivacity()
  or (
    tenant_id = public.current_tenant()
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = tenant_members.tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
    )
  )
);

create policy "tenant_members_write" on public.tenant_members
for all using (
  public.is_vivacity()
  or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = tenant_members.tenant_id
    and tm.user_id = auth.uid()
    and tm.role = 'Admin'
    and tm.status = 'active'
  )
);

-- User invitations policies
create policy "user_invitations_read" on public.user_invitations
for select using (
  public.is_vivacity()
  or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = user_invitations.tenant_id
    and tm.user_id = auth.uid()
    and tm.role = 'Admin'
    and tm.status = 'active'
  )
  or (
    -- Users can read their own invitations
    auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.user_uuid = auth.uid()
      and lower(u.email) = lower(user_invitations.email)
    )
  )
  or (
    -- Allow unauthenticated access to pending invitations for acceptance flow
    -- This is necessary for the AcceptInvitation page to validate tokens
    -- Security: Only pending, non-expired invitations are accessible
    status = 'pending' and expires_at > now()
  )
);

create policy "user_invitations_write" on public.user_invitations
for all using (
  public.is_vivacity()
  or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = user_invitations.tenant_id
    and tm.user_id = auth.uid()
    and tm.role = 'Admin'
    and tm.status = 'active'
  )
);

-- Tenant settings policies
create policy "tenant_settings_read" on public.tenant_settings
for select using (
  public.is_vivacity()
  or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = tenant_settings.tenant_id
    and tm.user_id = auth.uid()
    and tm.status = 'active'
  )
);

create policy "tenant_settings_write" on public.tenant_settings
for all using (
  public.is_vivacity()
  or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = tenant_settings.tenant_id
    and tm.user_id = auth.uid()
    and tm.role = 'Admin'
    and tm.status = 'active'
  )
);
