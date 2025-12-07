-- Seed initial tenant data for testing
-- Run this SQL in your Supabase SQL editor AFTER running 03-tenant-policies.sql

-- Insert default tenant for existing data migration
insert into public.tenants (id, name, slug, status, created_at)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default Organization',
  'default-org',
  'active',
  now()
) on conflict (id) do nothing;

-- Create sample tenants for testing (only if no tenants exist beyond default)
do $$
begin
  if (select count(*) from public.tenants) <= 1 then
    insert into public.tenants (name, slug, status, risk_level) values
    ('ACME Training College', 'acme-training', 'active', 'low'),
    ('Excellence Education Group', 'excellence-edu', 'active', 'medium'),
    ('Future Skills Institute', 'future-skills', 'active', 'low');
  end if;
end $$;

-- Add existing SuperAdmin users as members of all tenants for migration
-- This ensures they maintain access during the transition
insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
select 
  t.id as tenant_id,
  u.id as user_id,
  case 
    when u.role = 'SuperAdmin' then 'Admin'
    else 'User'
  end as role,
  'active' as status,
  now() as joined_at
from public.tenants t
cross join public.users u
where u.role in ('SuperAdmin', 'VivacityTeam')
on conflict (tenant_id, user_id) do nothing;

-- Create some default tenant settings
insert into public.tenant_settings (tenant_id, key, value)
select 
  t.id,
  'branding',
  jsonb_build_object(
    'logo_url', '',
    'primary_color', '#3B82F6',
    'secondary_color', '#1F2937'
  )
from public.tenants t
on conflict (tenant_id, key) do nothing;

insert into public.tenant_settings (tenant_id, key, value)
select 
  t.id,
  'email_from',
  jsonb_build_object(
    'name', t.name,
    'email', 'noreply@' || t.slug || '.unicorn.com'
  )
from public.tenants t
on conflict (tenant_id, key) do nothing;
