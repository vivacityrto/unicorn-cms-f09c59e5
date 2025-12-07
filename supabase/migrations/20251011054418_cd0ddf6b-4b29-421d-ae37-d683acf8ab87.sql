-- Create view for 7-day invite audit summary
create or replace view public.vw_invite_audit_7d as
select
  t.name as tenant_name,
  ai.role as role,
  count(*) as attempts,
  count(*) filter (where ai.outcome='SUCCESS') as successes,
  count(*) filter (where ai.outcome='FAIL') as failures,
  max(ai.created_at) as last_seen
from public.audit_invites ai
left join public.tenants t on t.id = ai.tenant_id
where ai.created_at >= now() - interval '7 days'
group by t.name, ai.role
order by max(ai.created_at) desc;

-- Grant read access to authenticated users (Super Admins only via RLS on audit_invites)
grant select on public.vw_invite_audit_7d to authenticated;