create or replace function public.get_academy_facilitator_names_safe(p_facilitator_ids uuid[])
returns table(user_uuid uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.user_uuid, u.full_name
  from users u
  where u.user_uuid = any(p_facilitator_ids)
    and exists (
      select 1 from academy_courses ac
      where ac.facilitator_id = u.user_uuid
        and ac.status = 'published'
    );
$$;

grant execute on function public.get_academy_facilitator_names_safe(uuid[]) to authenticated;
