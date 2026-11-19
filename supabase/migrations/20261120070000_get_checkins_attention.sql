-- Consultant attention list: which clients have something in their check-ins that a consultant should look at now.
-- Read-only: creates one function, changes no table and no data.
--
-- Only Vivacity staff (app.is_vivacity_team) and super admins can call it; anyone else is refused.
--
-- A package is listed when it has either of two plain flags (the same two the per-client card uses, no score):
--   * a blocker flagged in the last 30 days, or
--   * a person whose last two pulses are both 2 or lower, the latest of them within the last 45 days
--     (an old streak is history, not something to chase today).
--
-- Returns one row per flagged live package: client and package names, the package manager's display name and id (so the
-- portal can offer "my clients"), blocker count, the latest blocker (category, a clipped copy of the client's short
-- description, who wrote it, when), and how many people are on a low streak. The description is client-written text
-- meant for their consultant, clipped to 160 characters, rendered as plain text by the portal and never sent to an AI.
-- Names only: no email, no person ids.

create or replace function public.get_checkins_attention()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (app.is_vivacity_team() or app.is_super_admin()) then
    raise exception 'Not authorized';
  end if;

  return (
    with live as (
      select pi.id as package_instance_id, pi.tenant_id, pi.manager_id,
             coalesce(nullif(trim(p.full_text), ''), p.name) as package_name
      from public.package_instances pi
      join public.packages p on p.id = pi.package_id
      where coalesce(pi.is_complete, false) = false
    ),
    blockers as (
      select c.package_instance_id,
             count(*)::integer as blocker_count,
             (array_agg(jsonb_build_object(
                'category', c.category,
                'comment', left(c.comment, 160),
                'name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Team member'),
                'created_at', c.created_at) order by c.created_at desc))[1] as latest
      from public.package_checkins c
      left join public.users u on u.user_uuid = c.user_id
      where c.kind = 'blocker' and c.created_at > now() - interval '30 days'
      group by c.package_instance_id
    ),
    ranked as (
      select package_instance_id, user_id, score, created_at,
             row_number() over (partition by package_instance_id, user_id order by created_at desc) as rn
      from public.package_checkins
      where kind = 'pulse' and created_at > now() - interval '180 days'
    ),
    low as (
      select package_instance_id, count(*)::integer as low_streak_people
      from (
        select package_instance_id, user_id
        from ranked
        where rn <= 2
        group by package_instance_id, user_id
        having count(*) = 2 and max(score) <= 2 and max(created_at) > now() - interval '45 days'
      ) s
      group by package_instance_id
    ),
    rows as (
      select l.package_instance_id, l.tenant_id, t.name as tenant_name, l.package_name,
             l.manager_id,
             nullif(trim(concat_ws(' ', m.first_name, m.last_name)), '') as manager_name,
             coalesce(b.blocker_count, 0) as blocker_count,
             b.latest as latest_blocker,
             coalesce(lo.low_streak_people, 0) as low_streak_people
      from live l
      join public.tenants t on t.id = l.tenant_id
      left join blockers b on b.package_instance_id = l.package_instance_id
      left join low lo on lo.package_instance_id = l.package_instance_id
      left join public.users m on m.user_uuid = l.manager_id
      where coalesce(b.blocker_count, 0) > 0 or coalesce(lo.low_streak_people, 0) > 0
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(r) order by
          (r.blocker_count > 0) desc,
          (r.latest_blocker->>'created_at') desc nulls last,
          r.low_streak_people desc,
          r.tenant_name)
        from rows r
      ), '[]'::jsonb)
    )
  );
end;
$function$;

revoke execute on function public.get_checkins_attention() from public;
revoke execute on function public.get_checkins_attention() from anon;
grant execute on function public.get_checkins_attention() to authenticated;
