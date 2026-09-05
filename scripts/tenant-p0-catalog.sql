-- Tenant P0.1 catalog snapshot. Read-only; execute through Supabase MCP.
-- Point-in-time estimates are not transactional truth and must be refreshed.
with target_tables(name) as (
  values ('tenants'),('package_instances'),('packages'),('tenant_users'),('users'),
    ('dd_states'),('dd_lifecycle_status'),('dd_access_status'),('dd_status'),
    ('tenant_csc_assignments'),('notes'),('client_notes'),('tga_rto_summary'),('connected_tenants')
), pk as (
  select c.relname, string_agg(a.attname, ', ' order by k.ord) columns
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_index i on i.indrelid = c.oid and i.indisprimary
  cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  group by c.relname
)
select c.relname table_name, greatest(c.reltuples, 0)::bigint estimated_rows,
  c.relrowsecurity rls_enabled, coalesce(pk.columns, '') primary_key_columns,
  (select count(*) from pg_policy p where p.polrelid = c.oid)::int policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join target_tables t on t.name = c.relname left join pk on pk.relname = c.relname
order by c.relname;

-- Exact counts for the tables whose reltuples estimate is -1 or otherwise
-- needs confirmation. This is read-only but may scan the listed tables.
select 'client_notes' table_name, count(*) exact_rows from public.client_notes
union all select 'dd_lifecycle_status', count(*) from public.dd_lifecycle_status
union all select 'dd_access_status', count(*) from public.dd_access_status;
