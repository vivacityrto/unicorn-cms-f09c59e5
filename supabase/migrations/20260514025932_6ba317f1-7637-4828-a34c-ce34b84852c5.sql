CREATE OR REPLACE FUNCTION public.admin_fix_memberships(dry_run boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  memberships_created int := 0;
  flagged_invalid int := 0;
  sample_rows json;
  result json;
begin
  if not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized', 'dry_run', dry_run);
  end if;

  create temp table _fix_membership_results (
    action text, invitation_id uuid, user_id uuid, tenant_id bigint, email text, role text
  ) on commit drop;

  insert into _fix_membership_results (action, invitation_id, user_id, tenant_id, email, role)
  select
    'create_membership',
    ui.id,
    p.user_id,
    ui.tenant_id,
    ui.email,
    case
      when ui.unicorn_role in ('Admin', 'Super Admin', 'Team Leader', 'Team Member') then 'Admin'
      else 'General User'
    end
  from public.user_invitations ui
  join public.profiles p on lower(p.email) = lower(ui.email)
  left join public.tenant_members tm on tm.user_id = p.user_id and tm.tenant_id = ui.tenant_id
  where ui.status = 'accepted' and tm.id is null and p.user_id is not null;

  select count(*) into memberships_created from _fix_membership_results where action = 'create_membership';
  select count(*) into flagged_invalid from public.audit_invalid_memberships();
  select json_agg(r) into sample_rows from (select * from _fix_membership_results limit 10) r;

  if not dry_run then
    insert into public.tenant_members (user_id, tenant_id, role, status, created_at)
    select r.user_id, r.tenant_id, r.role, 'active', now()
    from _fix_membership_results r where r.action = 'create_membership'
    on conflict do nothing;
  end if;

  result := json_build_object(
    'action', 'fix_memberships', 'dry_run', dry_run,
    'counts', json_build_object('memberships_to_create', memberships_created, 'invalid_memberships_flagged', flagged_invalid),
    'rows_affected_sample', coalesce(sample_rows, '[]'::json), 'errors', null
  );
  return result;
end;
$function$;