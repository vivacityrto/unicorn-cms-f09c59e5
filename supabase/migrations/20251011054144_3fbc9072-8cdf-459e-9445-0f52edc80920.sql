-- Create invite audit table (non-EOS)
create table if not exists public.audit_invites (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  actor_user_id     text,
  email             text not null,
  tenant_id         bigint not null,
  role              text not null,
  outcome           text not null check (outcome in ('SUCCESS','FAIL')),
  code              text,
  detail            text,
  function_version  text default 'v1'
);

-- Helpful indexes
create index if not exists ix_audit_invites_created_at on public.audit_invites (created_at desc);
create index if not exists ix_audit_invites_email on public.audit_invites (email);
create index if not exists ix_audit_invites_tenant on public.audit_invites (tenant_id);
create index if not exists ix_audit_invites_outcome on public.audit_invites (outcome);

-- Enable RLS
alter table public.audit_invites enable row level security;

-- Write-only by service role (service role bypass RLS anyway, but explicit for clarity)
create policy audit_invites_insert_service
on public.audit_invites
for insert
with check (true);

-- Read for Super Admins (using existing is_super_admin function)
create policy audit_invites_select_admin
on public.audit_invites
for select
using (is_super_admin());

-- Summary view for UI consumption
create or replace view public.vw_audit_invites_summary as
select
  created_at, email, tenant_id, role, outcome, coalesce(code, 'N/A') as code
from public.audit_invites;

grant select on public.vw_audit_invites_summary to authenticated;