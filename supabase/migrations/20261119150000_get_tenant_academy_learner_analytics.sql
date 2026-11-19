-- Client Academy analytics that count only what learners chose themselves.
-- Read-only tenant-scoped aggregate: creates one function, changes no table and no data.
--
-- Only enrolments with source = 'self_enrol' count (an allowlist, so any new or unknown source is excluded).
-- Enrolments added another way (old package auto-enrolment, "mandatory for all clients", staff impersonation)
-- are reported only as a "not counted" figure so the screen can say so.
-- academy_lesson_progress is not readable by a client admin, which is why this is a SECURITY DEFINER function
-- with the same access check as get_tenant_academy_analytics.

create or replace function public.get_tenant_academy_learner_analytics(p_tenant_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  result jsonb;
begin
  if not (
    exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = p_tenant_id
        and tu.access_scope = 'full'
        and tu.relationship_role in ('primary_contact', 'secondary_contact')
    )
    or exists (
      select 1
      from public.users u
      where u.user_uuid = auth.uid()
        and (lower(u.global_role) in ('superadmin', 'admin') or u.is_vivacity_internal = true)
    )
  ) then
    raise exception 'Not authorized for this tenant';
  end if;

  with chosen as (
    select e.id, e.user_id, e.course_id, e.enrolled_at, e.completed_at, c.title as course_title
    from public.academy_enrollments e
    join public.academy_courses c on c.id = e.course_id
    where e.tenant_id = p_tenant_id
      and e.revoked_at is null
      and e.source = 'self_enrol'
  ),
  other as (
    select
      count(*)::integer as enrolments,
      count(*) filter (where e.completed_at is not null)::integer as finished
    from public.academy_enrollments e
    where e.tenant_id = p_tenant_id
      and e.revoked_at is null
      and e.source is distinct from 'self_enrol'
  ),
  lessons as (
    select lp.enrollment_id, lp.user_id, lp.is_completed, lp.completed_at,
           coalesce(lp.watch_seconds, 0) as watch_seconds,
           coalesce(lp.updated_at, lp.created_at) as touched_at,
           (lp.started_at is not null or coalesce(lp.watch_seconds, 0) > 0) as started
    from public.academy_lesson_progress lp
    join chosen ch on ch.id = lp.enrollment_id
  ),
  enrolment_rows as (
    select
      ch.*,
      exists (select 1 from lessons l where l.enrollment_id = ch.id and l.started) as started,
      exists (select 1 from public.academy_certificates cert where cert.enrollment_id = ch.id and cert.revoked_at is null) as certified,
      greatest(
        ch.enrolled_at,
        ch.completed_at,
        (select max(l.touched_at) from lessons l where l.enrollment_id = ch.id)
      ) as last_touch
    from chosen ch
  ),
  course_rows as (
    select
      er.course_id,
      er.course_title,
      count(*)::integer as chosen,
      count(*) filter (where er.started)::integer as started,
      count(*) filter (where er.completed_at is not null)::integer as finished,
      count(*) filter (where er.certified)::integer as certified,
      count(*) filter (where er.completed_at is null and er.last_touch < now() - interval '30 days')::integer as stalled,
      round((
        percentile_cont(0.5) within group (
          order by extract(epoch from (er.completed_at - er.enrolled_at)) / 86400.0
        ) filter (where er.completed_at is not null and er.enrolled_at is not null)
      )::numeric, 1) as median_days
    from enrolment_rows er
    group by er.course_id, er.course_title
  ),
  learner_rows as (
    select
      er.user_id,
      coalesce(nullif(trim(u.full_name), ''), nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email, 'Unnamed staff member') as name,
      u.email,
      count(*)::integer as chosen,
      count(*) filter (where er.completed_at is not null)::integer as finished,
      coalesce((select count(*) from lessons l where l.user_id = er.user_id and l.is_completed), 0)::integer as lessons_completed,
      round(coalesce((select sum(l.watch_seconds) from lessons l where l.user_id = er.user_id), 0) / 60.0)::integer as minutes,
      max(er.last_touch) as last_active,
      bool_or(er.started) as any_started
    from enrolment_rows er
    left join public.users u on u.user_uuid = er.user_id
    group by er.user_id, u.full_name, u.first_name, u.last_name, u.email
  ),
  stalled_rows as (
    select
      coalesce(nullif(trim(u.full_name), ''), nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email, 'Unnamed staff member') as name,
      er.course_title,
      floor(extract(epoch from (now() - er.last_touch)) / 86400)::integer as days_quiet
    from enrolment_rows er
    left join public.users u on u.user_uuid = er.user_id
    where er.completed_at is null
      and er.last_touch < now() - interval '30 days'
    order by er.last_touch asc
    limit 20
  ),
  weeks as (
    select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week')::date as week_start
  ),
  trend_rows as (
    select
      w.week_start,
      (select count(distinct x.user_id) from (
         select er.user_id from enrolment_rows er where date_trunc('week', er.enrolled_at)::date = w.week_start
         union
         select er.user_id from enrolment_rows er where er.completed_at is not null and date_trunc('week', er.completed_at)::date = w.week_start
         union
         select l.user_id from lessons l where l.touched_at is not null and date_trunc('week', l.touched_at)::date = w.week_start
       ) x)::integer as active_learners,
      (select count(*) from enrolment_rows er where date_trunc('week', er.enrolled_at)::date = w.week_start)::integer as chosen,
      (select count(*) from enrolment_rows er where er.completed_at is not null and date_trunc('week', er.completed_at)::date = w.week_start)::integer as finished,
      (select count(*) from lessons l where l.is_completed and l.completed_at is not null and date_trunc('week', l.completed_at)::date = w.week_start)::integer as lessons
    from weeks w
  ),
  totals as (
    select
      (select count(distinct user_id) from enrolment_rows)::integer as learners,
      (select count(*) from enrolment_rows)::integer as chosen,
      (select count(*) from enrolment_rows where completed_at is not null)::integer as finished,
      (select count(*) from enrolment_rows where certified)::integer as certificates,
      (select count(*) from lessons where is_completed)::integer as lessons_completed,
      round(coalesce((select sum(watch_seconds) from lessons), 0) / 60.0)::integer as minutes,
      (select count(*) from learner_rows where last_active >= now() - interval '30 days')::integer as active_30d
  )
  select jsonb_build_object(
    'last_updated_at', now(),
    'counted_source', 'self_enrol',
    'totals', (select to_jsonb(t) from totals t) || jsonb_build_object('not_counted', (select to_jsonb(o) from other o)),
    'trend', coalesce((select jsonb_agg(to_jsonb(tr) order by tr.week_start) from trend_rows tr), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(to_jsonb(cr) order by cr.chosen desc, cr.course_title) from course_rows cr), '[]'::jsonb),
    'learners', coalesce((select jsonb_agg(to_jsonb(lr) order by lr.last_active desc nulls last) from learner_rows lr), '[]'::jsonb),
    'stalled', coalesce((select jsonb_agg(to_jsonb(sr)) from stalled_rows sr), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke execute on function public.get_tenant_academy_learner_analytics(bigint) from public;
revoke execute on function public.get_tenant_academy_learner_analytics(bigint) from anon;
grant execute on function public.get_tenant_academy_learner_analytics(bigint) to authenticated;
