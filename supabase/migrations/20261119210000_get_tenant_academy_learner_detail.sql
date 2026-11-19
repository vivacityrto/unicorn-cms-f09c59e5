-- One team member's Academy activity, for the drill-down on the client Academy page.
-- Read-only, tenant-scoped: creates one function, changes no table and no data.
--
-- Same rules as get_tenant_academy_learner_analytics: only enrolments the learner chose themselves
-- (source = 'self_enrol') count, the caller must be the organisation's primary or secondary contact with full
-- access (or Vivacity internal), and only rows for p_tenant_id are read, so asking about someone from another
-- organisation returns nothing. Watch time and "started" use the corrected definitions from
-- 20261119170000 (time inside a lesson, any sign of work).

create or replace function public.get_tenant_academy_learner_detail(p_tenant_id bigint, p_user_id uuid)
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
    select e.id, e.course_id, e.enrolled_at, e.completed_at, c.title as course_title
    from public.academy_enrollments e
    join public.academy_courses c on c.id = e.course_id
    where e.tenant_id = p_tenant_id
      and e.user_id = p_user_id
      and e.revoked_at is null
      and e.source = 'self_enrol'
  ),
  lessons as (
    select lp.enrollment_id, lp.lesson_id, lp.is_completed, lp.completed_at,
           case
             when coalesce(ls.segment_start_seconds, 0) > 0 then
               least(
                 greatest(coalesce(lp.watch_seconds, 0) - ls.segment_start_seconds, 0),
                 coalesce(ls.segment_end_seconds - ls.segment_start_seconds, 2147483647)
               )
             else coalesce(lp.watch_seconds, 0)
           end as watch_seconds,
           coalesce(lp.updated_at, lp.created_at) as touched_at,
           (lp.started_at is not null or coalesce(lp.watch_seconds, 0) > 0 or coalesce(lp.is_completed, false) or lp.completed_at is not null) as started
    from public.academy_lesson_progress lp
    join chosen ch on ch.id = lp.enrollment_id
    left join public.academy_lessons ls on ls.id = lp.lesson_id
  ),
  course_rows as (
    select
      ch.course_id,
      ch.course_title,
      ch.enrolled_at,
      ch.completed_at,
      exists (select 1 from lessons l where l.enrollment_id = ch.id and l.started) as started,
      exists (select 1 from public.academy_certificates cert where cert.enrollment_id = ch.id and cert.revoked_at is null) as certified,
      (select count(*) from public.academy_lessons al where al.course_id = ch.course_id and al.is_published)::integer as lessons_total,
      (select count(*) from lessons l where l.enrollment_id = ch.id and l.is_completed)::integer as lessons_completed,
      round(coalesce((select sum(l.watch_seconds) from lessons l where l.enrollment_id = ch.id), 0) / 60.0)::integer as minutes,
      greatest(ch.enrolled_at, ch.completed_at, (select max(l.touched_at) from lessons l where l.enrollment_id = ch.id)) as last_touch
    from chosen ch
  ),
  weeks as (
    select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week')::date as week_start
  ),
  trend_rows as (
    select
      w.week_start,
      (select count(*) from lessons l where l.is_completed and l.completed_at is not null and date_trunc('week', l.completed_at)::date = w.week_start)::integer as lessons,
      round(coalesce((select sum(l.watch_seconds) from lessons l where l.touched_at is not null and date_trunc('week', l.touched_at)::date = w.week_start), 0) / 60.0)::integer as minutes
    from weeks w
  ),
  learner as (
    select
      u.user_uuid as user_id,
      coalesce(nullif(trim(u.full_name), ''), nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email, 'Unnamed staff member') as name,
      u.email
    from public.users u
    where u.user_uuid = p_user_id
  ),
  totals as (
    select
      count(*)::integer as chosen,
      count(*) filter (where completed_at is not null)::integer as finished,
      count(*) filter (where certified)::integer as certificates,
      coalesce(sum(lessons_completed), 0)::integer as lessons_completed,
      coalesce(sum(lessons_total), 0)::integer as lessons_total,
      coalesce(sum(minutes), 0)::integer as minutes,
      max(last_touch) as last_active
    from course_rows
  )
  select jsonb_build_object(
    'last_updated_at', now(),
    'learner', (select to_jsonb(l) from learner l),
    'totals', (select to_jsonb(t) from totals t),
    'courses', coalesce((select jsonb_agg(to_jsonb(cr) order by cr.completed_at is null desc, cr.last_touch desc nulls last) from course_rows cr), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(to_jsonb(tr) order by tr.week_start) from trend_rows tr), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke execute on function public.get_tenant_academy_learner_detail(bigint, uuid) from public;
revoke execute on function public.get_tenant_academy_learner_detail(bigint, uuid) from anon;
grant execute on function public.get_tenant_academy_learner_detail(bigint, uuid) to authenticated;
