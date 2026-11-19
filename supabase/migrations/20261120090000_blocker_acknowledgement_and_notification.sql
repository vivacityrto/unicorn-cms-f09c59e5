-- Blocker acknowledgement and notification for client check-ins.
-- Adds columns to public.package_checkins, one staff function, and replaces four existing check-in functions.
-- No existing row is changed (new columns start empty).
--
--   * A blocker a client flags now notifies the package manager in-app (one user_notifications row, type
--     'client_blocker', link to the client page). The notification names the client, the person and the category; it
--     does NOT repeat the client's own words. At most 3 blockers a day per person per package already bounds volume,
--     and the notification has a dedupe key so it can never be created twice for the same blocker.
--   * Vivacity staff can mark a blocker seen, resolved, or reopen it, with an optional short note (280 characters).
--     The note is written by staff FOR the client and is shown to the client on their own blocker, so it must never
--     hold anything internal. Only staff (app.is_vivacity_team / super admin) can call the function; clients cannot.
--   * The client's own state now includes their blockers from the last 30 days with their status and the staff note.
--   * Staff overview and the attention list count only UNRESOLVED blockers as needing attention; resolved ones stay on
--     the client's card for context. The attention list also reports how many are new (not yet seen).
--   * Answers still feed no health score and are never sent to AI.

alter table public.package_checkins add column if not exists acknowledged_at timestamptz;
alter table public.package_checkins add column if not exists acknowledged_by uuid references auth.users(id) on delete set null;
alter table public.package_checkins add column if not exists resolved_at timestamptz;
alter table public.package_checkins add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.package_checkins add column if not exists staff_note text;

alter table public.package_checkins drop constraint if exists package_checkins_staff_note_len;
alter table public.package_checkins add constraint package_checkins_staff_note_len check (staff_note is null or char_length(staff_note) <= 280);
alter table public.package_checkins drop constraint if exists package_checkins_status_only_blocker;
alter table public.package_checkins add constraint package_checkins_status_only_blocker
  check (kind = 'blocker' or (acknowledged_at is null and resolved_at is null and staff_note is null));

-- Staff: mark a blocker seen, resolved or reopened.
create or replace function public.set_package_blocker_status(p_checkin_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.package_checkins;
begin
  if v_uid is null or not (app.is_vivacity_team() or app.is_super_admin()) then
    raise exception 'Not authorized';
  end if;
  if p_action not in ('acknowledge', 'resolve', 'reopen') then
    raise exception 'Unknown action';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'Note is too long';
  end if;

  select * into v_row from public.package_checkins where id = p_checkin_id and kind = 'blocker' for update;
  if not found then
    raise exception 'Blocker not found';
  end if;

  if p_action = 'acknowledge' then
    update public.package_checkins
       set acknowledged_at = coalesce(acknowledged_at, now()),
           acknowledged_by = coalesce(acknowledged_by, v_uid),
           staff_note = coalesce(v_note, staff_note)
     where id = p_checkin_id;
  elsif p_action = 'resolve' then
    update public.package_checkins
       set acknowledged_at = coalesce(acknowledged_at, now()),
           acknowledged_by = coalesce(acknowledged_by, v_uid),
           resolved_at = coalesce(resolved_at, now()),
           resolved_by = coalesce(resolved_by, v_uid),
           staff_note = coalesce(v_note, staff_note)
     where id = p_checkin_id;
  else
    update public.package_checkins
       set resolved_at = null, resolved_by = null,
           staff_note = coalesce(v_note, staff_note)
     where id = p_checkin_id;
  end if;

  select * into v_row from public.package_checkins where id = p_checkin_id;
  return jsonb_build_object(
    'id', v_row.id,
    'status', case when v_row.resolved_at is not null then 'resolved' when v_row.acknowledged_at is not null then 'seen' else 'flagged' end
  );
end;
$function$;

revoke execute on function public.set_package_blocker_status(uuid, text, text) from public;
revoke execute on function public.set_package_blocker_status(uuid, text, text) from anon;
grant execute on function public.set_package_blocker_status(uuid, text, text) to authenticated;

-- Client: submit a check-in. Same rules as before, plus an in-app notification to the package manager for a blocker.
create or replace function public.submit_package_checkin(
  p_tenant_id bigint,
  p_package_instance_id bigint,
  p_kind text,
  p_score smallint default null,
  p_category text default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row public.package_checkins;
  v_manager uuid;
  v_tenant_name text;
  v_person text;
  v_package text;
begin
  if v_uid is null then
    raise exception 'Not authorized';
  end if;
  if not public.package_checkin_caller_ok(p_tenant_id, p_package_instance_id) then
    raise exception 'Not authorized for this package';
  end if;
  if p_kind not in ('pulse', 'confidence', 'blocker') then
    raise exception 'Unknown check-in kind';
  end if;
  if p_kind in ('pulse', 'confidence') and (p_score is null or p_score < 1 or p_score > 5) then
    raise exception 'Score must be between 1 and 5';
  end if;
  if p_kind = 'blocker' and (p_category is null or p_category not in ('people', 'evidence', 'time', 'system', 'other')) then
    raise exception 'Choose what is blocking you';
  end if;
  if p_kind <> 'blocker' and p_category is not null then
    raise exception 'Category only applies to a blocker';
  end if;
  if v_comment is not null and char_length(v_comment) > 280 then
    raise exception 'Comment is too long';
  end if;
  if p_kind = 'blocker' and v_comment is null then
    raise exception 'Tell us a little about what is blocking you';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_package_instance_id::text, 0));

  if p_kind = 'pulse' and exists (
    select 1 from public.package_checkins c
    where c.user_id = v_uid and c.package_instance_id = p_package_instance_id and c.kind = 'pulse' and c.created_at > now() - interval '13 days'
  ) then
    raise exception 'RATE_LIMITED: you have already answered the pulse recently';
  end if;
  if p_kind = 'confidence' and exists (
    select 1 from public.package_checkins c
    where c.user_id = v_uid and c.package_instance_id = p_package_instance_id and c.kind = 'confidence' and c.created_at > now() - interval '6 days'
  ) then
    raise exception 'RATE_LIMITED: you have already rated your confidence this week';
  end if;
  if p_kind = 'blocker' and (
    select count(*) from public.package_checkins c
    where c.user_id = v_uid and c.package_instance_id = p_package_instance_id and c.kind = 'blocker' and c.created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'RATE_LIMITED: you have flagged several things today; your consultant will follow up';
  end if;

  insert into public.package_checkins (tenant_id, package_instance_id, user_id, kind, score, category, comment)
  values (p_tenant_id, p_package_instance_id, v_uid, p_kind,
          case when p_kind = 'blocker' then null else p_score end,
          case when p_kind = 'blocker' then p_category else null end,
          v_comment)
  returning * into v_row;

  -- Tell the package manager, in the portal, that a blocker has been flagged. The client's own words are not repeated.
  if p_kind = 'blocker' then
    select pi.manager_id, coalesce(nullif(trim(p.full_text), ''), p.name)
      into v_manager, v_package
    from public.package_instances pi
    join public.packages p on p.id = pi.package_id
    where pi.id = p_package_instance_id;

    if v_manager is not null and exists (
      select 1 from public.users u where u.user_uuid = v_manager and not coalesce(u.disabled, false) and not coalesce(u.archived, false)
    ) then
      select t.name into v_tenant_name from public.tenants t where t.id = p_tenant_id;
      select coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'A team member') into v_person
        from public.users u where u.user_uuid = v_uid;

      insert into public.user_notifications (user_id, tenant_id, type, title, message, link, dedupe_key, source_id, metadata)
      values (
        v_manager,
        p_tenant_id,
        'client_blocker',
        'Client flagged a blocker: ' || coalesce(v_tenant_name, 'a client'),
        coalesce(v_person, 'A team member') || ' flagged a blocker (' ||
          case p_category when 'people' then 'people' when 'evidence' then 'evidence' when 'time' then 'time' when 'system' then 'system' else 'something else' end ||
          ') on ' || coalesce(v_package, 'a package') || '. Open the client to follow up.',
        '/tenant/' || p_tenant_id::text,
        'client_blocker:' || v_row.id::text,
        v_row.id::text,
        jsonb_build_object('package_instance_id', p_package_instance_id, 'category', p_category)
      )
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'created_at', v_row.created_at);
end;
$function$;

-- Client: their own state, now including their blockers from the last 30 days with status and the staff note.
create or replace function public.get_package_checkin_state(p_tenant_id bigint, p_package_instance_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_last_pulse timestamptz;
  v_last_conf timestamptz;
begin
  if v_uid is null or not public.package_checkin_caller_ok(p_tenant_id, p_package_instance_id) then
    return jsonb_build_object('eligible', false);
  end if;

  select max(created_at) into v_last_pulse from public.package_checkins
    where user_id = v_uid and package_instance_id = p_package_instance_id and kind = 'pulse';
  select max(created_at) into v_last_conf from public.package_checkins
    where user_id = v_uid and package_instance_id = p_package_instance_id and kind = 'confidence';

  return jsonb_build_object(
    'eligible', true,
    'pulse_due', v_last_pulse is null or v_last_pulse <= now() - interval '13 days',
    'next_pulse_on', case when v_last_pulse is null then null else ((v_last_pulse + interval '14 days') at time zone 'Australia/Sydney')::date end,
    'confidence_due', v_last_conf is null or v_last_conf <= now() - interval '6 days',
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('kind', h.kind, 'score', h.score, 'created_at', h.created_at) order by h.created_at)
      from (
        select kind, score, created_at from public.package_checkins
        where user_id = v_uid and package_instance_id = p_package_instance_id and kind in ('pulse', 'confidence')
        order by created_at desc limit 16
      ) h
    ), '[]'::jsonb),
    'blockers_last_30_days', (
      select count(*)::integer from public.package_checkins
      where user_id = v_uid and package_instance_id = p_package_instance_id and kind = 'blocker' and created_at > now() - interval '30 days'
    ),
    'my_blockers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', b.category,
        'created_at', b.created_at,
        'status', case when b.resolved_at is not null then 'resolved' when b.acknowledged_at is not null then 'seen' else 'flagged' end,
        'staff_note', b.staff_note) order by b.created_at desc)
      from public.package_checkins b
      where b.user_id = v_uid and b.package_instance_id = p_package_instance_id and b.kind = 'blocker' and b.created_at > now() - interval '30 days'
    ), '[]'::jsonb)
  );
end;
$function$;

-- Staff: one organisation's check-ins. Blockers now carry an id (to act on), their status, who saw them, and the note.
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
      where u.user_uuid in (select user_id from c union select acknowledged_by from c where acknowledged_by is not null)
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
      select c.id, c.package_instance_id, c.category, c.comment, c.created_at, n.name,
             case when c.resolved_at is not null then 'resolved' when c.acknowledged_at is not null then 'seen' else 'flagged' end as status,
             a.name as seen_by, c.acknowledged_at, c.resolved_at, c.staff_note
      from c
      join names n on n.user_uuid = c.user_id
      left join names a on a.user_uuid = c.acknowledged_by
      where c.kind = 'blocker' and c.created_at > now() - interval '30 days'
    )
    select jsonb_build_object(
      'packages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'package_instance_id', pk.package_instance_id,
          'package_name', pk.package_name,
          'people', coalesce((select jsonb_agg(to_jsonb(pe) - 'package_instance_id' order by pe.name) from people pe where pe.package_instance_id = pk.package_instance_id), '[]'::jsonb),
          'blockers', coalesce((select jsonb_agg(jsonb_build_object(
              'id', b.id, 'category', b.category, 'comment', b.comment, 'created_at', b.created_at, 'name', b.name,
              'status', b.status, 'seen_by', b.seen_by, 'acknowledged_at', b.acknowledged_at, 'resolved_at', b.resolved_at, 'staff_note', b.staff_note)
              order by b.created_at desc) from blockers b where b.package_instance_id = pk.package_instance_id), '[]'::jsonb)
        ) order by pk.package_name)
        from pkgs pk
      ), '[]'::jsonb)
    )
  );
end;
$function$;

-- Staff: the attention list. Only UNRESOLVED blockers need attention; new_blocker_count is how many are not yet seen.
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
             count(*) filter (where c.acknowledged_at is null)::integer as new_blocker_count,
             (array_agg(jsonb_build_object(
                'category', c.category,
                'comment', left(c.comment, 160),
                'name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Team member'),
                'created_at', c.created_at,
                'status', case when c.acknowledged_at is not null then 'seen' else 'flagged' end) order by c.created_at desc))[1] as latest
      from public.package_checkins c
      left join public.users u on u.user_uuid = c.user_id
      where c.kind = 'blocker' and c.resolved_at is null and c.created_at > now() - interval '30 days'
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
             coalesce(b.new_blocker_count, 0) as new_blocker_count,
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
          (r.new_blocker_count > 0) desc,
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

revoke execute on function public.submit_package_checkin(bigint, bigint, text, smallint, text, text) from public;
revoke execute on function public.submit_package_checkin(bigint, bigint, text, smallint, text, text) from anon;
grant execute on function public.submit_package_checkin(bigint, bigint, text, smallint, text, text) to authenticated;
revoke execute on function public.get_package_checkin_state(bigint, bigint) from public;
revoke execute on function public.get_package_checkin_state(bigint, bigint) from anon;
grant execute on function public.get_package_checkin_state(bigint, bigint) to authenticated;
revoke execute on function public.get_tenant_checkins_overview(bigint) from public;
revoke execute on function public.get_tenant_checkins_overview(bigint) from anon;
grant execute on function public.get_tenant_checkins_overview(bigint) to authenticated;
revoke execute on function public.get_checkins_attention() from public;
revoke execute on function public.get_checkins_attention() from anon;
grant execute on function public.get_checkins_attention() to authenticated;
