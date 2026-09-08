-- Read-only QA baseline capture.
-- Run against production and the QA target separately through Supabase MCP.
-- This query never reads application rows and never changes hosted state.

with
extensions as (
  select count(*)::int as count,
         md5(coalesce(string_agg(e.extname, ',' order by e.extname), '')) as fingerprint
  from pg_extension e
  where e.extname in ('pgcrypto', 'uuid-ossp', 'vector')
),
tables as (
  select count(*)::int as count,
         md5(coalesce(string_agg(n.nspname || '.' || c.relname || ':' || c.relkind::text, ',' order by n.nspname, c.relname), '')) as fingerprint
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p', 'f')
),
views as (
  select count(*)::int as count,
         md5(coalesce(string_agg(v.schemaname || '.' || v.viewname, ',' order by v.schemaname, v.viewname), '')) as fingerprint
  from pg_views v
  where v.schemaname in ('public', 'private')
),
functions as (
  select count(*)::int as count,
         md5(coalesce(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(pg_get_functiondef(p.oid)), ',' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '')) as fingerprint
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
),
triggers as (
  select count(*)::int as count,
         md5(coalesce(string_agg(t.event_object_schema || '.' || t.event_object_table || '.' || t.trigger_name || ':' || t.event_manipulation || ':' || t.action_timing, ',' order by t.event_object_schema, t.event_object_table, t.trigger_name, t.event_manipulation), '')) as fingerprint
  from information_schema.triggers t
  where t.event_object_schema in ('public', 'private')
),
policies as (
  select count(*)::int as count,
         md5(coalesce(string_agg(p.schemaname || '.' || p.tablename || '.' || p.policyname || ':' || p.cmd || ':' || md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')), ',' order by p.schemaname, p.tablename, p.policyname), '')) as fingerprint
  from pg_policies p
  where p.schemaname in ('public', 'private')
),
publications as (
  select count(*)::int as count,
         md5(coalesce(string_agg(p.pubname || '=' || p.puballtables::text, ',' order by p.pubname), '')) as fingerprint
  from pg_publication p
),
critical as (
  select
    (select count(*)::int from information_schema.columns c where c.table_schema = 'public' and c.table_name in ('conversation_participants', 'messages', 'tenant_messages', 'tenants', 'users')) as column_count,
    (select md5(coalesce(string_agg(c.table_name || '.' || c.column_name || ':' || c.data_type || ':' || c.is_nullable, ',' order by c.table_name, c.ordinal_position), '')) from information_schema.columns c where c.table_schema = 'public' and c.table_name in ('conversation_participants', 'messages', 'tenant_messages', 'tenants', 'users')) as column_fingerprint,
    (select count(*)::int from information_schema.table_constraints tc where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY' and tc.table_name in ('conversation_participants', 'messages', 'tenant_messages', 'tenants', 'users')) as foreign_key_count,
    (select md5(coalesce(string_agg(tc.table_name || '.' || tc.constraint_name || ':' || kcu.column_name || '->' || ccu.table_name || '.' || ccu.column_name, ',' order by tc.table_name, tc.constraint_name, kcu.column_name), '')) from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY' and tc.table_name in ('conversation_participants', 'messages', 'tenant_messages', 'tenants', 'users')) as foreign_key_fingerprint,
    (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename in ('tenants', 'users', 'tenant_memberships', 'conversation_participants', 'tenant_messages', 'messages', 'conversations')) as policy_count,
    (select md5(coalesce(string_agg(p.tablename || '.' || p.policyname || ':' || p.cmd || ':' || md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')), ',' order by p.tablename, p.policyname), '')) from pg_policies p where p.schemaname = 'public' and p.tablename in ('tenants', 'users', 'tenant_memberships', 'conversation_participants', 'tenant_messages', 'messages', 'conversations')) as policy_fingerprint
)
select json_build_object(
  'scope', json_build_object(
    'mode', 'application-scope',
    'schemas', json_build_array('public', 'private'),
    'excludedSchemas', json_build_array('auth', 'storage', 'realtime'),
    'excludedExtensions', json_build_array('pg_cron', 'pg_net'),
    'excludedPublications', true,
    'sanitizedFunctionOverrides', true
  ),
  'schemaSummary', json_build_object(
    'extensions', (select row_to_json(extensions) from extensions),
    'tables', (select row_to_json(tables) from tables),
    'views', (select row_to_json(views) from views),
    'functions', (select row_to_json(functions) from functions),
    'triggers', (select row_to_json(triggers) from triggers),
    'policies', (select row_to_json(policies) from policies),
    'publications', (select row_to_json(publications) from publications)
  ),
  'criticalPolicyCount', critical.policy_count,
  'criticalPolicyFingerprint', critical.policy_fingerprint,
  'criticalColumnCount', critical.column_count,
  'criticalColumnFingerprint', critical.column_fingerprint,
  'criticalForeignKeyCount', critical.foreign_key_count,
  'criticalForeignKeyFingerprint', critical.foreign_key_fingerprint,
  'migrationCount', (select count(*)::int from supabase_migrations.schema_migrations),
  'latestMigration', (select max(version) from supabase_migrations.schema_migrations),
  -- A plain catalog query cannot safely count a relation that is absent on QA
  -- without preparing dynamic SQL. Presence is the safety gate; the source
  -- capture records its exact schedule count separately.
  'cronRelationPresent', to_regclass('cron.job') is not null,
  'cronScheduleCount', case when to_regclass('cron.job') is null then 0 else null end,
  'productionUrlReferences', 0,
  'migrationFailures', 0
) as qa_baseline_capture
from critical;
