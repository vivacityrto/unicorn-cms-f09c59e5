-- Fix Edge Function permissions for invite-user
-- Allow service_role (Edge Function) to insert into profiles
create policy "Edge function can insert profiles"
on public.profiles
for insert
to service_role
with check (true);

-- Allow service_role to update profiles
create policy "Edge function can update profiles"
on public.profiles
for update
to service_role
using (true)
with check (true);

-- Allow service_role to insert into tenant_members
create policy "Edge function can insert tenant_members"
on public.tenant_members
for insert
to service_role
with check (true);

-- Allow service_role to update tenant_members
create policy "Edge function can update tenant_members"
on public.tenant_members
for update
to service_role
using (true)
with check (true);

-- Create audit_avatars table for compliance
create table if not exists public.audit_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  created_at timestamptz default now()
);

-- Enable RLS on audit_avatars
alter table public.audit_avatars enable row level security;

-- Allow service_role and authenticated to insert avatar logs
create policy "Edge or user can insert avatar logs"
on public.audit_avatars
for insert
to service_role, authenticated
with check (true);

-- Allow admins to view avatar audit logs
create policy "Admins can view avatar audit logs"
on public.audit_avatars
for select
to authenticated
using (
  exists (
    select 1 from public.tenant_members tm
    where tm.user_id = auth.uid() 
    and tm.role::text like 'SUPER_ADMIN%'
  )
);