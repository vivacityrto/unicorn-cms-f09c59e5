-- Staff view of client check-ins for ONE organisation: who answered what on each of its live packages.
-- Read-only: creates one function, changes no table and no data.
--
-- Only Vivacity staff (app.is_vivacity_team) and super admins may call it; anyone else is refused, so a client can
-- never read another person's answers through it. The caller's tenant is not trusted for anything here: the function
-- reads only rows for p_tenant_id.
--
-- Returns, per live package: each person's last six pulse scores and latest confidence rating (by display name, no
-- email), and the blockers flagged in the last 30 days (category, the short description the client wrote, who, when).
-- The description is client-written free text meant for their consultant; the portal renders it as plain text and it
-- is never sent to any AI. Answers are not scored here and feed no health score.

create or replace function public.get_tenant_checkins_overview(p_tenant_id bigint)
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
    with pkgs as (
      select pi.id as package_instance_id,
             coalesce(nullif(trim(p.full_text), ''), p.name) as package_name
      from public.package_instances pi
      join public.packages p on p.id = pi.package_id
      where pi.tenant_id = p_tenant_id
        and coalesce(pi.is_complete, false) = false
    ),
    c as (
      select * from public.package_checkins
      where tenant_id = p_tenant_id and created_at > now() - interval '180 days'
    ),
    names as (
      select u.user_uuid,
             coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Team member') as name
      from public.users u
      where u.user_uuid in (select user_id from c)
    ),
    people as (
      select d.package_instance_id, n.name,
        (select jsonb_agg(jsonb_build_object('score', x.score, 'created_at', x.created_at) order by x.created_at)
           from (select score, created_at from c c2
                  where c2.package_instance_id = d.package_instance_id and c2.user_id = d.user_id and c2.kind = 'pulse'
                  order by created_at desc limit 6) x) as pulses,
        (select jsonb_build_object('score', x.score, 'created_at', x.created_at)
           from (select score, created_at from c c3
                  where c3.package_instance_id = d.package_instance_id and c3.user_id = d.user_id and c3.kind = 'confidence'
                  order by created_at desc limit 1) x) as confidence
      from (select distinct package_instance_id, user_id from c where kind in ('pulse', 'confidence')) d
      join names n on n.user_uuid = d.user_id
    ),
    blockers as (
      select c.package_instance_id, c.category, c.comment, c.created_at, n.name
      from c
      join names n on n.user_uuid = c.user_id
      where c.kind = 'blocker' and c.created_at > now() - interval '30 days'
    )
    select jsonb_build_object(
      'packages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'package_instance_id', pk.package_instance_id,
          'package_name', pk.package_name,
          'people', coalesce((select jsonb_agg(to_jsonb(pe) - 'package_instance_id' order by pe.name) from people pe where pe.package_instance_id = pk.package_instance_id), '[]'::jsonb),
          'blockers', coalesce((select jsonb_agg(jsonb_build_object('category', b.category, 'comment', b.comment, 'created_at', b.created_at, 'name', b.name) order by b.created_at desc) from blockers b where b.package_instance_id = pk.package_instance_id), '[]'::jsonb)
        ) order by pk.package_name)
        from pkgs pk
      ), '[]'::jsonb)
    )
  );
end;
$function$;

revoke execute on function public.get_tenant_checkins_overview(bigint) from public;
revoke execute on function public.get_tenant_checkins_overview(bigint) from anon;
grant execute on function public.get_tenant_checkins_overview(bigint) to authenticated;
