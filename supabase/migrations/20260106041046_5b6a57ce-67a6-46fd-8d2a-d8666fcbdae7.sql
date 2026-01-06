-- =====================================================
-- User Audit System: Diagnostic Views and Repair RPCs
-- =====================================================

-- A1: Find auth.users without matching profiles
create or replace function public.audit_orphan_auth_users()
returns table (
  auth_user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  issue text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    au.id as auth_user_id,
    au.email::text,
    au.created_at,
    au.last_sign_in_at,
    'No matching profile found' as issue
  from auth.users au
  left join public.profiles p on p.user_id = au.id
  where p.user_id is null
    and public.is_super_admin();
$$;

-- A2: Find profiles with broken user_id links
create or replace function public.audit_orphan_profiles()
returns table (
  profile_id bigint,
  profile_email text,
  user_id uuid,
  created_at timestamptz,
  issue text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id as profile_id,
    p.email as profile_email,
    p.user_id,
    p.created_at,
    case
      when p.user_id is null then 'user_id is NULL'
      else 'user_id not found in auth.users'
    end as issue
  from public.profiles p
  left join auth.users au on au.id = p.user_id
  where (p.user_id is null or au.id is null)
    and public.is_super_admin();
$$;

-- A3: Find email mismatches between auth.users and profiles
create or replace function public.audit_email_mismatches()
returns table (
  user_id uuid,
  auth_email text,
  profile_email text,
  profile_id bigint,
  issue text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    au.id as user_id,
    au.email::text as auth_email,
    p.email as profile_email,
    p.id as profile_id,
    case
      when p.email is null then 'Profile email is NULL'
      when lower(au.email) != lower(p.email) then 'Email mismatch (case-insensitive)'
      else 'Unknown'
    end as issue
  from auth.users au
  join public.profiles p on p.user_id = au.id
  where (p.email is null or lower(au.email) != lower(p.email))
    and public.is_super_admin();
$$;

-- A4: Find duplicate emails
create or replace function public.audit_duplicate_emails()
returns table (
  email_lower text,
  count_profiles bigint,
  count_auth bigint,
  profile_ids bigint[],
  auth_ids uuid[]
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with profile_emails as (
    select lower(email) as email_lower, array_agg(id) as profile_ids, count(*) as cnt
    from public.profiles
    where email is not null
    group by lower(email)
    having count(*) > 1
  ),
  auth_emails as (
    select lower(email) as email_lower, array_agg(id) as auth_ids, count(*) as cnt
    from auth.users
    group by lower(email)
    having count(*) > 1
  )
  select 
    coalesce(pe.email_lower, ae.email_lower) as email_lower,
    coalesce(pe.cnt, 0) as count_profiles,
    coalesce(ae.cnt, 0) as count_auth,
    pe.profile_ids,
    ae.auth_ids
  from profile_emails pe
  full outer join auth_emails ae on pe.email_lower = ae.email_lower
  where public.is_super_admin();
$$;

-- A5: Find users without active tenant membership (excluding SuperAdmins)
create or replace function public.audit_users_without_membership()
returns table (
  user_id uuid,
  email text,
  profile_id bigint,
  global_role text,
  created_at timestamptz,
  issue text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.user_id,
    p.email,
    p.id as profile_id,
    p.global_role,
    p.created_at,
    'No active tenant membership' as issue
  from public.profiles p
  left join public.tenant_members tm on tm.user_id = p.user_id and tm.status = 'active'
  where p.user_id is not null
    and tm.id is null
    and coalesce(p.global_role, '') != 'SuperAdmin'
    and public.is_super_admin();
$$;

-- A6: Find invalid tenant memberships
create or replace function public.audit_invalid_memberships()
returns table (
  membership_id uuid,
  user_id uuid,
  tenant_id bigint,
  role text,
  status text,
  issue text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  -- Memberships with missing tenants
  select
    tm.id as membership_id,
    tm.user_id,
    tm.tenant_id,
    tm.role,
    tm.status,
    'Tenant does not exist' as issue
  from public.tenant_members tm
  left join public.tenants t on t.id = tm.tenant_id
  where t.id is null
    and public.is_super_admin()
  
  union all
  
  -- Memberships with missing profiles/auth
  select
    tm.id as membership_id,
    tm.user_id,
    tm.tenant_id,
    tm.role,
    tm.status,
    'User not found in profiles' as issue
  from public.tenant_members tm
  left join public.profiles p on p.user_id = tm.user_id
  where p.user_id is null
    and public.is_super_admin()
  
  union all
  
  -- Invalid roles
  select
    tm.id as membership_id,
    tm.user_id,
    tm.tenant_id,
    tm.role,
    tm.status,
    'Invalid role value' as issue
  from public.tenant_members tm
  where tm.role not in ('Admin', 'General User')
    and public.is_super_admin()
  
  union all
  
  -- Invalid status
  select
    tm.id as membership_id,
    tm.user_id,
    tm.tenant_id,
    tm.role,
    tm.status,
    'Invalid status value' as issue
  from public.tenant_members tm
  where tm.status not in ('active', 'inactive', 'suspended')
    and public.is_super_admin();
$$;

-- A7: Find invitation inconsistencies (using unicorn_role instead of role)
create or replace function public.audit_invitation_issues()
returns table (
  invitation_id uuid,
  email text,
  tenant_id bigint,
  status text,
  unicorn_role text,
  created_at timestamptz,
  expires_at timestamptz,
  issue text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  -- Accepted invitations without membership
  select
    ui.id as invitation_id,
    ui.email,
    ui.tenant_id,
    ui.status,
    ui.unicorn_role,
    ui.created_at,
    ui.expires_at,
    'Accepted but no tenant membership found' as issue
  from public.user_invitations ui
  left join public.profiles p on lower(p.email) = lower(ui.email)
  left join public.tenant_members tm on tm.user_id = p.user_id and tm.tenant_id = ui.tenant_id
  where ui.status = 'accepted'
    and tm.id is null
    and public.is_super_admin()
  
  union all
  
  -- Pending/sent invitations where user already has membership
  select
    ui.id as invitation_id,
    ui.email,
    ui.tenant_id,
    ui.status,
    ui.unicorn_role,
    ui.created_at,
    ui.expires_at,
    'Pending/sent but user already has membership' as issue
  from public.user_invitations ui
  join public.profiles p on lower(p.email) = lower(ui.email)
  join public.tenant_members tm on tm.user_id = p.user_id and tm.tenant_id = ui.tenant_id
  where ui.status in ('pending', 'sent')
    and public.is_super_admin()
  
  union all
  
  -- Expired invitations still marked pending/sent
  select
    ui.id as invitation_id,
    ui.email,
    ui.tenant_id,
    ui.status,
    ui.unicorn_role,
    ui.created_at,
    ui.expires_at,
    'Should be marked expired' as issue
  from public.user_invitations ui
  where ui.status in ('pending', 'sent')
    and ui.expires_at < now()
    and public.is_super_admin();
$$;

-- A8: Get comprehensive audit summary
create or replace function public.audit_summary()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  result json;
begin
  if not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized');
  end if;
  
  select json_build_object(
    'orphan_auth_users', (select count(*) from public.audit_orphan_auth_users()),
    'orphan_profiles', (select count(*) from public.audit_orphan_profiles()),
    'email_mismatches', (select count(*) from public.audit_email_mismatches()),
    'duplicate_emails', (select count(*) from public.audit_duplicate_emails()),
    'users_without_membership', (select count(*) from public.audit_users_without_membership()),
    'invalid_memberships', (select count(*) from public.audit_invalid_memberships()),
    'invitation_issues', (select count(*) from public.audit_invitation_issues()),
    'generated_at', now()
  ) into result;
  
  return result;
end;
$$;

-- B1: Fix profile linkage issues
create or replace function public.admin_fix_profile_linkage(dry_run boolean default true)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_count int := 0;
  email_filled_count int := 0;
  sample_rows json;
  result json;
begin
  if not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized', 'dry_run', dry_run);
  end if;
  
  create temp table _fix_linkage_results (
    action text,
    profile_id bigint,
    user_id uuid,
    email text
  ) on commit drop;
  
  insert into _fix_linkage_results (action, profile_id, user_id, email)
  select 'link_user_id', p.id, au.id, au.email::text
  from public.profiles p
  join auth.users au on lower(au.email) = lower(p.email)
  where p.user_id is null and p.email is not null;
  
  insert into _fix_linkage_results (action, profile_id, user_id, email)
  select 'fill_email', p.id, p.user_id, au.email::text
  from public.profiles p
  join auth.users au on au.id = p.user_id
  where p.email is null and p.user_id is not null;
  
  select count(*) into linked_count from _fix_linkage_results where action = 'link_user_id';
  select count(*) into email_filled_count from _fix_linkage_results where action = 'fill_email';
  select json_agg(r) into sample_rows from (select * from _fix_linkage_results limit 10) r;
  
  if not dry_run then
    update public.profiles p set user_id = r.user_id
    from _fix_linkage_results r where r.profile_id = p.id and r.action = 'link_user_id';
    
    update public.profiles p set email = r.email
    from _fix_linkage_results r where r.profile_id = p.id and r.action = 'fill_email';
  end if;
  
  result := json_build_object(
    'action', 'fix_profile_linkage', 'dry_run', dry_run,
    'counts', json_build_object('profiles_linked', linked_count, 'emails_filled', email_filled_count),
    'rows_affected_sample', coalesce(sample_rows, '[]'::json), 'errors', null
  );
  return result;
end;
$$;

-- B2: Fix membership issues
create or replace function public.admin_fix_memberships(dry_run boolean default true)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  select 'create_membership', ui.id, p.user_id, ui.tenant_id, ui.email, ui.unicorn_role
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
$$;

-- B3: Fix invitation issues
create or replace function public.admin_fix_invitations(dry_run boolean default true)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired_count int := 0;
  duplicate_marked int := 0;
  sample_rows json;
  result json;
begin
  if not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized', 'dry_run', dry_run);
  end if;
  
  create temp table _fix_invitation_results (
    action text, invitation_id uuid, email text, tenant_id bigint, old_status text, new_status text
  ) on commit drop;
  
  insert into _fix_invitation_results (action, invitation_id, email, tenant_id, old_status, new_status)
  select 'mark_expired', ui.id, ui.email, ui.tenant_id, ui.status, 'expired'
  from public.user_invitations ui
  where ui.status in ('pending', 'sent') and ui.expires_at < now();
  
  insert into _fix_invitation_results (action, invitation_id, email, tenant_id, old_status, new_status)
  select 'mark_redundant', ui.id, ui.email, ui.tenant_id, ui.status, 'accepted'
  from public.user_invitations ui
  join public.profiles p on lower(p.email) = lower(ui.email)
  join public.tenant_members tm on tm.user_id = p.user_id and tm.tenant_id = ui.tenant_id
  where ui.status in ('pending', 'sent');
  
  select count(*) into expired_count from _fix_invitation_results where action = 'mark_expired';
  select count(*) into duplicate_marked from _fix_invitation_results where action = 'mark_redundant';
  select json_agg(r) into sample_rows from (select * from _fix_invitation_results limit 10) r;
  
  if not dry_run then
    update public.user_invitations ui set status = r.new_status
    from _fix_invitation_results r where r.invitation_id = ui.id;
  end if;
  
  result := json_build_object(
    'action', 'fix_invitations', 'dry_run', dry_run,
    'counts', json_build_object('marked_expired', expired_count, 'marked_redundant', duplicate_marked),
    'rows_affected_sample', coalesce(sample_rows, '[]'::json), 'errors', null
  );
  return result;
end;
$$;

-- Grant execute permissions
grant execute on function public.audit_orphan_auth_users() to authenticated;
grant execute on function public.audit_orphan_profiles() to authenticated;
grant execute on function public.audit_email_mismatches() to authenticated;
grant execute on function public.audit_duplicate_emails() to authenticated;
grant execute on function public.audit_users_without_membership() to authenticated;
grant execute on function public.audit_invalid_memberships() to authenticated;
grant execute on function public.audit_invitation_issues() to authenticated;
grant execute on function public.audit_summary() to authenticated;
grant execute on function public.admin_fix_profile_linkage(boolean) to authenticated;
grant execute on function public.admin_fix_memberships(boolean) to authenticated;
grant execute on function public.admin_fix_invitations(boolean) to authenticated;