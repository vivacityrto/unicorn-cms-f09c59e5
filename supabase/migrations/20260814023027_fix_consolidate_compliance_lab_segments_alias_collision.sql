-- fn_consolidate_compliance_lab_segments never had its p_dry_run=false path
-- actually exercised before now (only ever dry-run tested). First real apply
-- attempt failed: "record \"r\" has no field \"package_id\"" — the lesson-loop
-- variable `r` (declared `record`) stays in scope after its FOR loop ends, and
-- the later `academy_package_course_rules r` table alias in the same group
-- iteration collided with it, so plpgsql resolved `r.package_id` against the
-- stale lesson record instead of the table. Renamed that alias to `pcr`.
-- No other logic changed. Nothing was partially committed by the failed
-- attempt — the whole call is one statement/transaction, verified via
-- execute_sql before this fix.

create or replace function public.fn_consolidate_compliance_lab_segments(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_report jsonb := jsonb_build_object(
    'dry_run', p_dry_run,
    'applied', false,
    'generated_at', now()
  );
  v_groups jsonb := '[]'::jsonb;
  v_group jsonb;
  v_os jsonb;
  r record;
  g record;
  v_parent_id bigint;
  v_module_id bigint;
  v_assessment_id bigint;
  v_slug text;
  v_base_slug text;
  v_slug_i integer;
  v_title text;
  v_short text;
  v_desc text;
  v_thumb text;
  v_facilitator uuid;
  v_created_by uuid;
  v_delivery date;
  v_available boolean;
  v_difficulty text;
  v_tags text[];
  v_audience text[];
  v_would_publish boolean;
  v_old_ids bigint[];
  v_new_lesson_id bigint;
  v_enroll_source integer;
  v_enroll_users integer;
  v_progress_n integer;
  v_pdp_n integer;
  v_certs integer;
  v_parent_enrols integer;
begin
  -- Outcome Standards (efe1f1a2): report only, never write.
  select jsonb_build_object(
    'skipped', true,
    'reason', 'Segmented twice — Angela must confirm which of the 12 courses to keep before lessons are created.',
    'source_video_id', 'efe1f1a2-7e41-4fd2-8a66-ea16af3bb2f2',
    'proposed_title', 'The Compliance Lab — Implementing the Outcome Standards (15 Jan 2026)',
    'suggested_keep', jsonb_build_array(89, 90, 91, 92, 93, 88),
    'suggested_drop', jsonb_build_array(83, 84, 85, 86, 87, 94),
    'suggested_keep_rationale', 'Keep Run B (89–93) plus course 88 (the long gap-analysis segment). Drop Run A 83–87 (near-duplicates of 89–93) and 94 (a slice of 88). Not encoded — confirmation required.',
    'segments', coalesce((
      select jsonb_agg(seg order by (seg->>'segment_start_seconds')::int, (seg->>'id')::bigint)
      from (
        select jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'slug', c.slug,
          'status', c.status,
          'segment_start_seconds', c.segment_start_seconds,
          'segment_end_seconds', c.segment_end_seconds,
          'enrollments', (select count(*) from public.academy_enrollments e where e.course_id = c.id)
        ) as seg
        from public.academy_courses c
        where c.source_video_id = 'efe1f1a2-7e41-4fd2-8a66-ea16af3bb2f2'
          and c.ai_generated = true
          and c.webinar_series = 'The Compliance Lab'
      ) s
    ), '[]'::jsonb),
    'overlaps', coalesce((
      select jsonb_agg(o)
      from (
        select jsonb_build_object(
          'a_id', a.id,
          'a_title', a.title,
          'a_range', jsonb_build_array(a.segment_start_seconds, a.segment_end_seconds),
          'b_id', b.id,
          'b_title', b.title,
          'b_range', jsonb_build_array(b.segment_start_seconds, b.segment_end_seconds),
          'overlap_seconds', least(a.segment_end_seconds, b.segment_end_seconds)
                            - greatest(a.segment_start_seconds, b.segment_start_seconds)
        ) as o
        from public.academy_courses a
        join public.academy_courses b
          on b.source_video_id = a.source_video_id
         and b.id > a.id
        where a.source_video_id = 'efe1f1a2-7e41-4fd2-8a66-ea16af3bb2f2'
          and a.ai_generated = true
          and b.ai_generated = true
          and a.webinar_series = 'The Compliance Lab'
          and b.webinar_series = 'The Compliance Lab'
          and a.segment_start_seconds is not null
          and b.segment_start_seconds is not null
          and a.segment_start_seconds < b.segment_end_seconds
          and b.segment_start_seconds < a.segment_end_seconds
        order by a.segment_start_seconds, a.id, b.id
      ) x
    ), '[]'::jsonb)
  ) into v_os;

  v_report := v_report || jsonb_build_object('outcome_standards', v_os);

  drop table if exists _cl_lesson_map;
  create temp table _cl_lesson_map (
    old_course_id bigint not null,
    old_lesson_id bigint,
    new_lesson_id bigint,
    sort_order integer not null,
    title text,
    description text,
    segment_start integer,
    segment_end integer
  ) on commit drop;

  for g in
    select * from (values
      (
        '0ebb50c0-f2d3-4712-985b-0596948b4a6b'::uuid,
        'The Compliance Lab — Credential Policy Implementation (18 Jun 2026)',
        array[55,56,57,58,59,60]::bigint[]
      ),
      (
        '7b33bee1-bc41-44a2-bef0-aad2a134c296'::uuid,
        'The Compliance Lab — Inclusive Practice and Reasonable Adjustment Plans (16 Jul 2026)',
        array[61,62,63,64,65,66]::bigint[]
      ),
      (
        '1b0f7b63-0a0e-4eb2-ac42-9b5c9c1837c4'::uuid,
        'The Compliance Lab — Self-Assurance and Continuous Improvement Systems (21 May 2026)',
        array[69,70,71,72,73]::bigint[]
      ),
      (
        '96ef1444-6dec-471a-8ca6-70bac6d092b0'::uuid,
        'The Compliance Lab — Assessment Validation and Pre-Use Testing (18 Mar 2026)',
        array[78,79,80,81,82]::bigint[]
      ),
      (
        'ac7d7f8a-4d1a-44b3-b9bb-21744d0bcd0a'::uuid,
        'The Compliance Lab — Managing RTO Resources (18 Sep 2025)',
        array[113,114,115,116,117,118]::bigint[]
      )
    ) as t(source_video_id, parent_title, course_ids)
  loop
    delete from _cl_lesson_map;
    v_old_ids := g.course_ids;
    v_title := g.parent_title;
    v_parent_id := null;
    v_module_id := null;
    v_assessment_id := null;
    v_parent_enrols := null;

    -- Guard: only the expected segment-courses, still not archived.
    if exists (
      select 1 from public.academy_courses c
      where c.id = any(v_old_ids)
        and (
          c.source_video_id is distinct from g.source_video_id
          or coalesce(c.ai_generated, false) is not true
          or c.webinar_series is distinct from 'The Compliance Lab'
          or c.status = 'archived'
        )
    ) then
      raise exception 'Guard failed for source_video_id %: a listed course is missing, archived, or not a Compliance Lab segment', g.source_video_id;
    end if;

    if (select count(*) from public.academy_courses c where c.id = any(v_old_ids)) <> cardinality(v_old_ids) then
      raise exception 'Guard failed for source_video_id %: expected % courses, found %',
        g.source_video_id, cardinality(v_old_ids),
        (select count(*) from public.academy_courses c where c.id = any(v_old_ids));
    end if;

    select count(*) into v_certs
    from public.academy_certificates cert
    where cert.course_id = any(v_old_ids);
    if v_certs > 0 then
      raise exception 'Refusing to consolidate source_video_id %: % certificate row(s) exist', g.source_video_id, v_certs;
    end if;

    select
      (array_agg(c.short_description order by c.segment_start_seconds nulls last, c.id))[1],
      (array_agg(c.description order by c.segment_start_seconds nulls last, c.id))[1],
      (array_agg(c.thumbnail_url order by c.segment_start_seconds nulls last, c.id) filter (where c.thumbnail_url is not null))[1],
      (array_agg(c.facilitator_id order by c.segment_start_seconds nulls last, c.id) filter (where c.facilitator_id is not null))[1],
      (array_agg(c.created_by order by c.segment_start_seconds nulls last, c.id) filter (where c.created_by is not null))[1],
      min(c.delivery_date),
      bool_or(c.available_to_all_clients),
      (array_agg(c.difficulty_level order by c.segment_start_seconds nulls last, c.id))[1],
      bool_or(c.status = 'published')
    into v_short, v_desc, v_thumb, v_facilitator, v_created_by, v_delivery, v_available, v_difficulty, v_would_publish
    from public.academy_courses c
    where c.id = any(v_old_ids);

    select array(
      select distinct t
      from public.academy_courses c, unnest(coalesce(c.tags, array[]::text[])) as t
      where c.id = any(v_old_ids)
      order by t
    ) into v_tags;

    select array(
      select distinct t
      from public.academy_courses c, unnest(coalesce(c.target_audience, array[]::text[])) as t
      where c.id = any(v_old_ids)
      order by t
    ) into v_audience;

    v_base_slug := left(
      trim(both '-' from regexp_replace(
        regexp_replace(lower(v_title), '[^a-z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      )),
      80
    );
    if v_base_slug is null or v_base_slug = '' then
      v_base_slug := 'compliance-lab-workshop';
    end if;
    v_slug := v_base_slug;
    v_slug_i := 2;
    while exists (select 1 from public.academy_courses c where c.slug = v_slug) loop
      v_slug := left(v_base_slug, 70) || '-' || v_slug_i::text;
      v_slug_i := v_slug_i + 1;
    end loop;

    insert into _cl_lesson_map (old_course_id, old_lesson_id, sort_order, title, description, segment_start, segment_end)
    select
      c.id,
      l.id,
      row_number() over (order by c.segment_start_seconds nulls last, c.id)::int,
      c.title,
      coalesce(c.short_description, l.description),
      c.segment_start_seconds,
      c.segment_end_seconds
    from public.academy_courses c
    left join public.academy_lessons l on l.course_id = c.id
    where c.id = any(v_old_ids);

    select count(*) into v_enroll_source
    from public.academy_enrollments e where e.course_id = any(v_old_ids);

    select count(distinct e.user_id) into v_enroll_users
    from public.academy_enrollments e where e.course_id = any(v_old_ids);

    select count(*) into v_progress_n
    from public.academy_lesson_progress p where p.course_id = any(v_old_ids);

    select count(*) into v_pdp_n
    from public.pdp_evidence_items p
    join public.academy_enrollments e on e.id = p.source_enrollment_id
    where e.course_id = any(v_old_ids);

    if not p_dry_run then
      insert into public.academy_courses (
        title, slug, description, short_description, thumbnail_url,
        target_audience, difficulty_level, tags, status,
        session_type, webinar_series, source_video_id,
        segment_start_seconds, segment_end_seconds,
        available_to_all_clients, ai_generated,
        created_by, facilitator_id, delivery_date,
        certificate_enabled
      ) values (
        v_title, v_slug, v_desc, v_short, v_thumb,
        nullif(v_audience, array[]::text[]), coalesce(v_difficulty, 'beginner'),
        nullif(v_tags, array[]::text[]), 'draft',
        'workshop', 'The Compliance Lab', g.source_video_id,
        null, null,
        coalesce(v_available, true), true,
        v_created_by, v_facilitator, v_delivery,
        true
      ) returning id into v_parent_id;

      insert into public.academy_modules (course_id, title, sort_order, is_published)
      values (v_parent_id, 'Workshop', 1, true)
      returning id into v_module_id;

      for r in
        select * from _cl_lesson_map order by sort_order
      loop
        insert into public.academy_lessons (
          course_id, module_id, title, description,
          lesson_type, video_id, sort_order, is_published,
          segment_start_seconds, segment_end_seconds
        ) values (
          v_parent_id, v_module_id, r.title, r.description,
          'video', g.source_video_id, r.sort_order, true,
          r.segment_start, r.segment_end
        ) returning id into v_new_lesson_id;

        update _cl_lesson_map
        set new_lesson_id = v_new_lesson_id
        where old_course_id = r.old_course_id;
      end loop;

      insert into public.academy_assessments (
        course_id, title, pass_score,
        is_required_for_certificate, is_published, created_by
      ) values (
        v_parent_id,
        v_title || ' — Completion Quiz',
        80, false, false, v_created_by
      ) returning id into v_assessment_id;

      insert into public.academy_assessment_questions (
        assessment_id, question_text, question_type, options, explanation, points, sort_order
      )
      select
        v_assessment_id,
        q.question_text,
        q.question_type,
        q.options,
        q.explanation,
        coalesce(q.points, 1),
        (row_number() over (order by m.sort_order, q.sort_order, q.id))::int
      from _cl_lesson_map m
      join public.academy_assessments a on a.course_id = m.old_course_id
      join public.academy_assessment_questions q on q.assessment_id = a.id;

      insert into public.academy_package_course_rules (package_id, course_id, is_active, created_by)
      select distinct pcr.package_id, v_parent_id, true, pcr.created_by
      from public.academy_package_course_rules pcr
      where pcr.course_id = any(v_old_ids)
        and coalesce(pcr.is_active, true)
      on conflict (package_id, course_id) do nothing;

      insert into public.academy_enrollments (
        course_id, user_id, tenant_id, status, source,
        enrolled_at, enrolled_by, notes, expires_at
      )
      select
        v_parent_id,
        s.user_id,
        s.tenant_id,
        'active',
        s.source,
        s.enrolled_at,
        s.enrolled_by,
        s.notes,
        s.expires_at
      from (
        select distinct on (e.user_id)
          e.user_id, e.tenant_id, e.source, e.enrolled_at, e.enrolled_by, e.notes, e.expires_at
        from public.academy_enrollments e
        where e.course_id = any(v_old_ids)
        order by e.user_id, e.enrolled_at asc, e.id asc
      ) s
      on conflict (course_id, user_id) do update
        set enrolled_at = least(public.academy_enrollments.enrolled_at, excluded.enrolled_at);

      insert into public.academy_lesson_progress (
        enrollment_id, lesson_id, user_id, course_id,
        watch_seconds, last_position_seconds, completion_percentage,
        is_completed, started_at, completed_at
      )
      select
        pe.id,
        m.new_lesson_id,
        lp.user_id,
        v_parent_id,
        lp.watch_seconds,
        lp.last_position_seconds,
        lp.completion_percentage,
        lp.is_completed,
        lp.started_at,
        lp.completed_at
      from public.academy_lesson_progress lp
      join _cl_lesson_map m on m.old_lesson_id = lp.lesson_id
      join public.academy_enrollments pe
        on pe.course_id = v_parent_id and pe.user_id = lp.user_id
      where lp.course_id = any(v_old_ids)
        and m.new_lesson_id is not null
      on conflict (enrollment_id, lesson_id) do nothing;

      update public.pdp_evidence_items p
      set source_enrollment_id = pe.id
      from public.academy_enrollments old_e
      join public.academy_enrollments pe
        on pe.course_id = v_parent_id and pe.user_id = old_e.user_id
      where p.source_enrollment_id = old_e.id
        and old_e.course_id = any(v_old_ids);

      delete from public.academy_enrollments e
      where e.course_id = any(v_old_ids);

      update public.academy_lessons
      set is_published = false
      where course_id = any(v_old_ids);

      update public.academy_modules
      set is_published = false
      where course_id = any(v_old_ids);

      update public.academy_courses
      set status = 'archived', archived_at = now()
      where id = any(v_old_ids);

      if v_would_publish then
        update public.academy_courses
        set status = 'published', published_at = coalesce(published_at, now())
        where id = v_parent_id;
      end if;

      select count(*) into v_parent_enrols
      from public.academy_enrollments e where e.course_id = v_parent_id;
    end if;

    v_group := jsonb_build_object(
      'source_video_id', g.source_video_id,
      'proposed_title', v_title,
      'proposed_slug', v_slug,
      'would_publish', v_would_publish,
      'parent_course_id', v_parent_id,
      'parent_enrollments_after', v_parent_enrols,
      'lessons', coalesce((
        select jsonb_agg(jsonb_build_object(
          'old_course_id', m.old_course_id,
          'old_lesson_id', m.old_lesson_id,
          'new_lesson_id', m.new_lesson_id,
          'sort_order', m.sort_order,
          'title', m.title,
          'segment_start_seconds', m.segment_start,
          'segment_end_seconds', m.segment_end
        ) order by m.sort_order)
        from _cl_lesson_map m
      ), '[]'::jsonb),
      'enrollments', jsonb_build_object(
        'source_rows', v_enroll_source,
        'unique_users', v_enroll_users,
        'would_keep', v_enroll_users,
        'would_drop', v_enroll_source - v_enroll_users
      ),
      'progress_rows', v_progress_n,
      'pdp_evidence_rows', v_pdp_n,
      'certificates', v_certs,
      'courses_to_archive', to_jsonb(v_old_ids)
    );
    v_groups := v_groups || jsonb_build_array(v_group);
  end loop;

  v_report := v_report || jsonb_build_object(
    'groups', v_groups,
    'applied', (not p_dry_run),
    'totals', jsonb_build_object(
      'parent_courses', jsonb_array_length(v_groups),
      'source_courses_archived', (
        select coalesce(sum(jsonb_array_length(g2->'courses_to_archive')), 0)
        from jsonb_array_elements(v_groups) g2
      ),
      'enrollment_source_rows', (
        select coalesce(sum((g2->'enrollments'->>'source_rows')::int), 0)
        from jsonb_array_elements(v_groups) g2
      ),
      'enrollment_unique_users_kept', (
        select coalesce(sum((g2->'enrollments'->>'would_keep')::int), 0)
        from jsonb_array_elements(v_groups) g2
      )
    )
  );

  return v_report;
end;
$function$;

revoke all on function public.fn_consolidate_compliance_lab_segments(boolean) from public;
revoke all on function public.fn_consolidate_compliance_lab_segments(boolean) from anon;
revoke all on function public.fn_consolidate_compliance_lab_segments(boolean) from authenticated;
grant execute on function public.fn_consolidate_compliance_lab_segments(boolean) to service_role;

comment on function public.fn_consolidate_compliance_lab_segments(boolean) is
  'Consolidate The Compliance Lab AI segment-courses into one parent course per recording. Default dry-run. Do not call with false until Angela confirms titles and the Outcome Standards keep-list. Fixed 2026-08-14: alias collision on loop variable r vs academy_package_course_rules r.';
