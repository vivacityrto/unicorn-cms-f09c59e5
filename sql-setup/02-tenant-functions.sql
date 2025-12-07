-- Helper functions for multi-tenant architecture
-- Run this SQL in your Supabase SQL editor AFTER running 01-tenant-schema.sql

-- Check if current user is a Vivacity staff member (SuperAdmin or VivacityTeam)
create or replace function public.is_vivacity()
returns boolean as $$
begin
  return exists (
    select 1 from public.users 
    where id = auth.uid() 
    and role in ('SuperAdmin', 'VivacityTeam')
  );
end;
$$ language plpgsql security definer;

-- Check if current user is a SuperAdmin specifically
create or replace function public.is_superadmin()
returns boolean as $$
begin
  return exists (
    select 1 from public.users 
    where id = auth.uid() 
    and role = 'SuperAdmin'
  );
end;
$$ language plpgsql security definer;

-- Get current user's active tenant context
create or replace function public.current_tenant()
returns uuid as $$
declare
  tenant_id uuid;
begin
  -- Check if user is Vivacity (can switch tenants)
  if public.is_vivacity() then
    -- Try to get from session variable first (for tenant switching)
    select nullif(current_setting('app.current_tenant_id', true), '')::uuid into tenant_id;
    
    -- If no session variable, return null (Vivacity can access all)
    return tenant_id;
  else
    -- For regular users, return their primary tenant
    select tm.tenant_id into tenant_id
    from public.tenant_members tm
    where tm.user_id = auth.uid()
    and tm.status = 'active'
    limit 1;
    
    return tenant_id;
  end if;
end;
$$ language plpgsql security definer;

-- Create a new tenant with optional admin user
create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_admin_email text default null
)
returns uuid as $$
declare
  new_tenant_id uuid;
  admin_user_id uuid;
begin
  -- Only SuperAdmin can create tenants
  if not public.is_superadmin() then
    raise exception 'Insufficient permissions to create tenant';
  end if;

  -- Validate slug format (lowercase, alphanumeric + hyphens)
  if p_slug !~ '^[a-z0-9-]+$' then
    raise exception 'Tenant slug must contain only lowercase letters, numbers, and hyphens';
  end if;

  -- Create the tenant
  insert into public.tenants (name, slug)
  values (p_name, p_slug)
  returning id into new_tenant_id;

  -- If admin email provided, look up user and add as tenant admin
  if p_admin_email is not null then
    select id into admin_user_id
    from public.users
    where email = p_admin_email;

    if admin_user_id is not null then
      insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
      values (new_tenant_id, admin_user_id, 'Admin', 'active', now());
    end if;
  end if;

  return new_tenant_id;
end;
$$ language plpgsql security definer;

-- Invite a user to a tenant
create or replace function public.invite_user(
  p_tenant_id uuid,
  p_email text,
  p_role text default 'User'
)
returns text as $$
declare
  invite_token text;
  existing_user_id uuid;
begin
  -- Check if user has permission to invite (Admin of tenant or Vivacity)
  if not (
    public.is_vivacity() or
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.role = 'Admin'
      and tm.status = 'active'
    )
  ) then
    raise exception 'Insufficient permissions to invite users to this tenant';
  end if;

  -- Validate role
  if p_role not in ('User', 'Admin') then
    raise exception 'Invalid role. Must be User or Admin';
  end if;

  -- Generate unique token
  invite_token := encode(gen_random_bytes(32), 'base64url');

  -- Check if user already exists
  select id into existing_user_id
  from public.users
  where email = p_email;

  -- If user exists and is already a member, update their role
  if existing_user_id is not null then
    insert into public.tenant_members (tenant_id, user_id, role, status)
    values (p_tenant_id, existing_user_id, p_role, 'active')
    on conflict (tenant_id, user_id)
    do update set
      role = excluded.role,
      status = 'active',
      joined_at = now(),
      updated_at = now();
  end if;

  -- Always create invitation record for tracking
  insert into public.user_invitations (
    email, tenant_id, role, token, invited_by
  ) values (
    p_email, p_tenant_id, p_role, invite_token, auth.uid()
  );

  return invite_token;
end;
$$ language plpgsql security definer;

-- Accept a tenant invitation
create or replace function public.accept_invite(p_token text)
returns jsonb as $$
declare
  invitation record;
  user_id uuid;
begin
  -- Get current user
  user_id := auth.uid();
  if user_id is null then
    raise exception 'User must be authenticated to accept invitation';
  end if;

  -- Find and validate invitation
  select * into invitation
  from public.user_invitations
  where token = p_token
  and status = 'pending'
  and expires_at > now();

  if invitation is null then
    raise exception 'Invalid or expired invitation token';
  end if;

  -- Verify email matches (case insensitive)
  if not exists (
    select 1 from public.users
    where id = user_id
    and lower(email) = lower(invitation.email)
  ) then
    raise exception 'Invitation email does not match user account';
  end if;

  -- Add user to tenant
  insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
  values (invitation.tenant_id, user_id, invitation.role, 'active', now())
  on conflict (tenant_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    joined_at = now(),
    updated_at = now();

  -- Mark invitation as accepted
  update public.user_invitations
  set status = 'accepted', updated_at = now()
  where id = invitation.id;

  -- Set as active tenant for the user
  perform set_config('app.current_tenant_id', invitation.tenant_id::text, false);

  return jsonb_build_object(
    'success', true,
    'tenant_id', invitation.tenant_id,
    'role', invitation.role
  );
end;
$$ language plpgsql security definer;

-- Set active tenant (for Vivacity users who can switch contexts)
create or replace function public.set_active_tenant(p_tenant_id uuid)
returns boolean as $$
begin
  -- Only Vivacity users can switch tenant contexts
  if not public.is_vivacity() then
    raise exception 'Only Vivacity staff can switch tenant contexts';
  end if;

  -- Validate tenant exists
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'Tenant does not exist';
  end if;

  -- Set session variable
  perform set_config('app.current_tenant_id', p_tenant_id::text, false);

  return true;
end;
$$ language plpgsql security definer;
