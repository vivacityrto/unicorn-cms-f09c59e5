# Migration: Vivacity Team Directory RPCs

Single Supabase migration. No frontend changes. No RLS changes.

## SQL

```sql
-- Public variant: minimum-disclosure team directory.
create or replace function public.get_vivacity_team_directory()
returns table (
  user_uuid uuid,
  first_name text,
  last_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_uuid, u.first_name, u.last_name, u.avatar_url
  from public.users u
  where u.unicorn_role in ('Super Admin', 'Team Leader', 'Team Member')
    and coalesce(u.archived, false) = false
    and coalesce(u.disabled, false) = false
  order by u.first_name nulls last, u.last_name nulls last;
$$;

revoke all on function public.get_vivacity_team_directory() from public;
grant execute on function public.get_vivacity_team_directory() to authenticated;

comment on function public.get_vivacity_team_directory() is
  'Public Vivacity team directory. Returns only safe display fields (no email, no job_title). Callable by any authenticated user.';

-- Staff variant: full directory including PII; gated to Vivacity team.
create or replace function public.get_vivacity_team_directory_staff()
returns table (
  user_uuid uuid,
  first_name text,
  last_name text,
  avatar_url text,
  email text,
  job_title text,
  unicorn_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_uuid, u.first_name, u.last_name, u.avatar_url,
         u.email, u.job_title, u.unicorn_role
  from public.users u
  where public.is_vivacity_team_safe(auth.uid())
    and u.unicorn_role in ('Super Admin', 'Team Leader', 'Team Member')
    and coalesce(u.archived, false) = false
    and coalesce(u.disabled, false) = false
  order by u.first_name nulls last, u.last_name nulls last;
$$;

revoke all on function public.get_vivacity_team_directory_staff() from public;
grant execute on function public.get_vivacity_team_directory_staff() to authenticated;

comment on function public.get_vivacity_team_directory_staff() is
  'Staff-only Vivacity team directory. Includes email/job_title. Returns 0 rows when caller is not Vivacity staff.';
```

## Scope

- Creates two new functions; nothing else.
- No table, RLS, FK, or frontend changes in this step.
- Lock impact: negligible (`pg_proc` row only); safe in production.

## Rollback

```sql
drop function if exists public.get_vivacity_team_directory_staff();
drop function if exists public.get_vivacity_team_directory();
```

## Verification

As a Vivacity staff session:
```sql
select count(*), bool_and(email is not null) from get_vivacity_team_directory_staff();
select count(*) from get_vivacity_team_directory();
```
Expect: staff RPC > 0 rows with all emails present; public RPC same count without PII columns.

As a client (Admin/User) session:
```sql
select count(*) from get_vivacity_team_directory_staff();  -- expect 0
select count(*) from get_vivacity_team_directory();        -- expect full count
```

Pre-flight already confirmed: `is_vivacity_team_safe(uuid)` exists, `STABLE SECURITY DEFINER`, `search_path = public`, and matches `unicorn_role IN ('Super Admin','Team Leader','Team Member')`.
