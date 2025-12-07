-- View for recent failed invites (last 20, truncated detail)
create or replace view public.vw_invite_failures_20 as
select
  ai.created_at,
  ai.email,
  ai.tenant_id,
  t.name as tenant_name,
  ai.role,
  ai.code,
  left(coalesce(ai.detail, ''), 250) as detail_excerpt
from public.audit_invites ai
left join public.tenants t on t.id = ai.tenant_id
where ai.outcome = 'FAIL'
order by ai.created_at desc
limit 20;

-- Grant select on the view to authenticated users
grant select on public.vw_invite_failures_20 to authenticated;