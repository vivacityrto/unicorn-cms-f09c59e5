-- Staff PDP / Academy Activity analytics foundation.
-- Read-only tenant-scoped aggregate; no new tables or backfill required.

create or replace function public.get_tenant_academy_analytics(p_tenant_id bigint)
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

  with tenant_enrolments as (
    select
      e.id,
      e.course_id,
      e.user_id,
      e.enrolled_at,
      e.completed_at,
      c.title as course_title,
      c.slug as course_slug
    from public.academy_enrollments e
    join public.academy_courses c on c.id = e.course_id
    where e.tenant_id = p_tenant_id
      and e.revoked_at is null
  ),
  course_rows as (
    select
      te.course_id,
      te.course_title,
      te.course_slug,
      count(*)::integer as enrolled,
      count(*) filter (where te.completed_at is not null)::integer as completed,
      count(*) filter (where exists (
        select 1 from public.academy_lesson_progress lp
        where lp.enrollment_id = te.id
          and (lp.started_at is not null or coalesce(lp.watch_seconds, 0) > 0)
      ))::integer as started,
      count(*) filter (where te.completed_at is null and exists (
        select 1 from public.academy_lesson_progress lp
        where lp.enrollment_id = te.id
          and (lp.started_at is not null or coalesce(lp.watch_seconds, 0) > 0)
      ))::integer as in_progress,
      count(*) filter (where te.completed_at is null and not exists (
        select 1 from public.academy_lesson_progress lp
        where lp.enrollment_id = te.id
          and (lp.started_at is not null or coalesce(lp.watch_seconds, 0) > 0)
      ))::integer as not_started,
      count(*) filter (where exists (
        select 1 from public.academy_certificates cert
        where cert.enrollment_id = te.id
          and cert.revoked_at is null
      ))::integer as certified,
      round((
        percentile_cont(0.5) within group (
          order by extract(epoch from (te.completed_at - te.enrolled_at)) / 86400.0
        ) filter (where te.completed_at is not null and te.enrolled_at is not null)
      )::numeric, 1) as median_completion_days
    from tenant_enrolments te
    group by te.course_id, te.course_title, te.course_slug
  ),
  activity_events as (
    select te.id as enrollment_id, te.user_id, 'enrolled'::text as event_type, te.enrolled_at as event_at
    from tenant_enrolments te
    where te.enrolled_at is not null
    union all
    select te.id, te.user_id, 'completed'::text, te.completed_at
    from tenant_enrolments te
    where te.completed_at is not null
    union all
    select lp.enrollment_id, lp.user_id, 'activity'::text, coalesce(lp.updated_at, lp.created_at)
    from public.academy_lesson_progress lp
    join tenant_enrolments te on te.id = lp.enrollment_id
    where coalesce(lp.updated_at, lp.created_at) is not null
  ),
  trend_rows as (
    select
      date_trunc('week', ae.event_at)::date as week_start,
      count(distinct ae.user_id)::integer as active_learners,
      count(*) filter (where ae.event_type = 'enrolled')::integer as enrollments,
      count(*) filter (where ae.event_type = 'completed')::integer as completions
    from activity_events ae
    where ae.event_at >= now() - interval '12 weeks'
    group by date_trunc('week', ae.event_at)::date
  )
  select jsonb_build_object(
    'last_updated_at', now(),
    'definitions', jsonb_build_object(
      'started', 'An enrolment with lesson progress started or watch time greater than zero.',
      'active_learner', 'A distinct staff member with Academy enrolment or lesson activity in the week.',
      'median_completion_days', 'Median calendar days from enrolment to completion for completed enrolments.'
    ),
    'courses', coalesce((select jsonb_agg(to_jsonb(cr) order by cr.enrolled desc, cr.course_title) from course_rows cr), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(to_jsonb(tr) order by tr.week_start) from trend_rows tr), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke execute on function public.get_tenant_academy_analytics(bigint) from public;
revoke execute on function public.get_tenant_academy_analytics(bigint) from anon;
grant execute on function public.get_tenant_academy_analytics(bigint) to authenticated;
