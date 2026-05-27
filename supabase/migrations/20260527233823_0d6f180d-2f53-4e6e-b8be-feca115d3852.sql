CREATE OR REPLACE FUNCTION public.audit_invalid_memberships()
RETURNS TABLE(membership_id uuid, user_id uuid, tenant_id bigint, role text, status text, issue text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  with all_issues as (
    select tm.id as membership_id, tm.user_id, tm.tenant_id, tm.role, tm.status,
           'Tenant does not exist' as issue
    from public.tenant_members tm
    left join public.tenants t on t.id = tm.tenant_id
    where t.id is null and public.is_super_admin()

    union all

    select tm.id, tm.user_id, tm.tenant_id, tm.role, tm.status,
           'User not found in profiles'
    from public.tenant_members tm
    left join public.profiles p on p.user_id = tm.user_id
    where p.user_id is null and public.is_super_admin()

    union all

    select tm.id, tm.user_id, tm.tenant_id, tm.role, tm.status,
           'Invalid role value'
    from public.tenant_members tm
    where tm.role not in ('Admin', 'General User') and public.is_super_admin()

    union all

    select tm.id, tm.user_id, tm.tenant_id, tm.role, tm.status,
           'Invalid status value'
    from public.tenant_members tm
    where tm.status not in ('active', 'inactive', 'suspended') and public.is_super_admin()
  )
  select membership_id, user_id, tenant_id, role, status,
         string_agg(issue, ', ' order by issue) as issue
  from all_issues
  group by membership_id, user_id, tenant_id, role, status;
$function$;