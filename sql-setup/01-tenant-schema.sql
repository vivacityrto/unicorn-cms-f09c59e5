-- Create core tenant tables for multi-tenant architecture
-- Run this SQL in your Supabase SQL editor

-- Core tenants table
create table if not exists public.tenants (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  settings jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Tenant members junction table
create table if not exists public.tenant_members (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'User' check (role in ('User', 'Admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'pending')),
  invited_at timestamp with time zone default now(),
  joined_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(tenant_id, user_id)
);

-- User invitations for tenant onboarding
create table if not exists public.user_invitations (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null default 'User' check (role in ('User', 'Admin')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references auth.users(id),
  expires_at timestamp with time zone not null default (now() + interval '7 days'),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Tenant-specific settings (key-value store)
create table if not exists public.tenant_settings (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(tenant_id, key)
);

-- Indexes for performance
create index if not exists idx_tenant_members_tenant_id on public.tenant_members(tenant_id);
create index if not exists idx_tenant_members_user_id on public.tenant_members(user_id);
create index if not exists idx_tenant_members_role on public.tenant_members(role);
create index if not exists idx_user_invitations_token on public.user_invitations(token);
create index if not exists idx_user_invitations_email on public.user_invitations(email);
create index if not exists idx_user_invitations_status on public.user_invitations(status);
create index if not exists idx_tenant_settings_tenant_key on public.tenant_settings(tenant_id, key);

-- Update triggers for updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_tenants_updated_at before update on public.tenants
  for each row execute procedure public.update_updated_at_column();

create trigger update_tenant_members_updated_at before update on public.tenant_members
  for each row execute procedure public.update_updated_at_column();

create trigger update_user_invitations_updated_at before update on public.user_invitations
  for each row execute procedure public.update_updated_at_column();

create trigger update_tenant_settings_updated_at before update on public.tenant_settings
  for each row execute procedure public.update_updated_at_column();

-- Enable RLS on all tenant tables
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.user_invitations enable row level security;
alter table public.tenant_settings enable row level security;

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on public.tenants to anon, authenticated;
grant all on public.tenant_members to anon, authenticated;
grant all on public.user_invitations to anon, authenticated;
grant all on public.tenant_settings to anon, authenticated;
