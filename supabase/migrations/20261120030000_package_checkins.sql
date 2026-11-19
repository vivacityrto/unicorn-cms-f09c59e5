-- Client check-ins on a package: a short pulse, a confidence rating and a "something is blocking me" flag.
-- Adds one table and two functions. No existing table, policy or data is changed.
--
-- Design rules (from the client-health review):
--   * Collected only from client users (full-access members of the organisation), never from staff previewing.
--   * Written ONLY through submit_package_checkin, which takes the organisation from the package and the person from
--     the sign-in, validates every value, and enforces how often a person can answer. There is no insert, update or
--     delete policy on the table, so a direct write is refused.
--   * A client reads only their own answers. Vivacity staff can read all answers (app.is_vivacity_team).
--   * Answers are a separate qualitative input. Nothing here feeds a health score or any AI.
--   * Free text (comment) is untrusted client input, kept short (280 characters) and never sent to a model.

create table if not exists public.package_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  package_instance_id bigint not null references public.package_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pulse', 'confidence', 'blocker')),
  score smallint check (score between 1 and 5),
  category text check (category in ('people', 'evidence', 'time', 'system', 'other')),
  comment text check (comment is null or char_length(comment) <= 280),
  created_at timestamptz not null default now(),
  constraint package_checkins_score_needed check (kind = 'blocker' or score is not null),
  constraint package_checkins_blocker_category check (kind <> 'blocker' or category is not null),
  constraint package_checkins_category_only_blocker check (kind = 'blocker' or category is null)
);

create index if not exists package_checkins_package_idx on public.package_checkins (tenant_id, package_instance_id, created_at desc);
create index if not exists package_checkins_user_idx on public.package_checkins (user_id, package_instance_id, kind, created_at desc);

alter table public.package_checkins enable row level security;

drop policy if exists package_checkins_select_own on public.package_checkins;
create policy package_checkins_select_own on public.package_checkins
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists package_checkins_select_staff on public.package_checkins;
create policy package_checkins_select_staff on public.package_checkins
  for select to authenticated
  using (app.is_vivacity_team());

revoke all on public.package_checkins from anon;
revoke all on public.package_checkins from authenticated;
grant select on public.package_checkins to authenticated;

-- Shared check: a client user (not staff) with full access to this organisation, and a live package that belongs to it.
create or replace function public.package_checkin_caller_ok(p_tenant_id bigint, p_package_instance_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = p_tenant_id and tu.access_scope = 'full'
    )
    and app.user_can_access_tenant(p_tenant_id)
    and exists (
      select 1 from public.package_instances pi
      where pi.id = p_package_instance_id and pi.tenant_id = p_tenant_id and coalesce(pi.is_complete, false) = false
    );
$function$;

revoke execute on function public.package_checkin_caller_ok(bigint, bigint) from public;
revoke execute on function public.package_checkin_caller_ok(bigint, bigint) from anon;
revoke execute on function public.package_checkin_caller_ok(bigint, bigint) from authenticated;

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

  -- How often one person can answer, per package.
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

  return jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'created_at', v_row.created_at);
end;
$function$;

-- What this person has already answered, and what is due, for one package. Their own answers only.
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
