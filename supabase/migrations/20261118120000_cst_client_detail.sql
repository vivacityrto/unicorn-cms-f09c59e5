-- CST: per-person breakdown for one client, behind the scorecard report's client drill-down.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Adds ONE new read-only function, public.get_cst_client_detail(bigint, date). Nothing existing is altered:
-- no table, column, policy, trigger or existing function changes, and there is no data write.
--
-- Who can call it: Vivacity staff only. The body rejects anyone else with 42501, exactly as
-- public.get_cst_report does, and it is SECURITY DEFINER with an empty search_path.
--
-- "Active" uses the same definition as public.cst_activity_stats: a person counts as active when they
-- viewed a portal page, signed in, sent or read a message, finished an Academy lesson, or chose to enrol
-- themselves, in the 28 days ending on the anchor date (Sydney time).

CREATE OR REPLACE FUNCTION public.get_cst_client_detail(p_tenant_id bigint, p_anchor date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tz constant text := 'Australia/Sydney';
  v_anchor date := COALESCE(p_anchor, (now() AT TIME ZONE v_tz)::date);
  v_end timestamptz := ((v_anchor + 1)::timestamp) AT TIME ZONE v_tz;
  v_start timestamptz := (((v_anchor + 1)::timestamp) AT TIME ZONE v_tz) - interval '28 days';
  v_week_start timestamptz := ((v_anchor - 6)::timestamp) AT TIME ZONE v_tz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH people AS (
      SELECT tu.user_id,
             tu.role,
             COALESCE(tu.primary_contact, false) AS primary_contact,
             tu.created_at AS added_at,
             u.first_name,
             u.last_name,
             u.job_title,
             u.email,
             u.last_sign_in_at
      FROM public.tenant_users tu
      JOIN public.users u ON u.user_uuid = tu.user_id
      WHERE tu.tenant_id = p_tenant_id
        AND COALESCE(u.is_vivacity_internal, false) = false
        AND COALESCE(u.archived, false) = false
    ),
    ev AS (
      SELECT v.user_id, v.created_at AS at, 'page'::text AS kind
      FROM public.client_portal_page_views v
      WHERE v.tenant_id = p_tenant_id AND v.created_at < v_end
      UNION ALL
      SELECT e.created_by,
             e.occurred_at,
             CASE
               WHEN e.event_type = 'client_login' THEN 'login'
               WHEN e.event_type IN ('message_sent', 'message_read') THEN 'message'
               WHEN e.event_type = 'academy_lesson_completed' THEN 'lesson'
               ELSE 'self_enrol'
             END
      FROM public.client_timeline_events e
      WHERE e.tenant_id::bigint = p_tenant_id
        AND e.created_by IS NOT NULL
        AND e.occurred_at < v_end
        AND (
          e.event_type IN ('client_login', 'message_sent', 'message_read', 'academy_lesson_completed')
          OR (e.event_type = 'academy_enrolled' AND e.metadata ->> 'source' = 'self_enrol')
        )
    ),
    activity AS (
      SELECT ev.user_id,
             max(ev.at) AS last_active_at,
             bool_or(ev.at >= v_start) AS active,
             count(*) FILTER (WHERE ev.at >= v_start AND ev.kind = 'page')::integer AS pages,
             count(*) FILTER (WHERE ev.at >= v_start AND ev.kind = 'login')::integer AS logins,
             count(*) FILTER (WHERE ev.at >= v_start AND ev.kind = 'message')::integer AS messages,
             count(*) FILTER (WHERE ev.at >= v_start AND ev.kind = 'lesson')::integer AS lessons
      FROM ev
      JOIN people p ON p.user_id = ev.user_id
      GROUP BY ev.user_id
    ),
    courses AS (
      SELECT en.user_id,
             jsonb_agg(
               jsonb_build_object(
                 'title', COALESCE(c.title, 'A course'),
                 'status', en.status,
                 'enrolled_at', en.enrolled_at,
                 'completed_at', en.completed_at,
                 'chosen_by_learner', en.source = 'self_enrol'
               )
               ORDER BY en.enrolled_at DESC NULLS LAST
             ) AS list
      FROM public.academy_enrollments en
      JOIN people p ON p.user_id = en.user_id
      LEFT JOIN public.academy_courses c ON c.id = en.course_id
      WHERE en.tenant_id = p_tenant_id AND en.revoked_at IS NULL
      GROUP BY en.user_id
    ),
    certs AS (
      SELECT ce.user_id,
             jsonb_agg(
               jsonb_build_object(
                 'course', COALESCE(c.title, 'A course'),
                 'issued_at', ce.issued_at,
                 'this_week', ce.issued_at >= v_week_start AND ce.issued_at < v_end
               )
               ORDER BY ce.issued_at DESC
             ) AS list
      FROM public.academy_certificates ce
      JOIN people p ON p.user_id = ce.user_id
      LEFT JOIN public.academy_courses c ON c.id = ce.course_id
      WHERE ce.tenant_id = p_tenant_id AND ce.revoked_at IS NULL
      GROUP BY ce.user_id
    )
    SELECT jsonb_build_object(
      'tenant_id', p_tenant_id,
      'anchor', v_anchor,
      'people', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'user_id', p.user_id,
            'name', NULLIF(btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
            'email', p.email,
            'job_title', p.job_title,
            'role', p.role,
            'primary_contact', p.primary_contact,
            'added_at', p.added_at,
            'last_sign_in_at', p.last_sign_in_at,
            'last_active_at', a.last_active_at,
            'active', COALESCE(a.active, false),
            'pages', COALESCE(a.pages, 0),
            'logins', COALESCE(a.logins, 0),
            'messages', COALESCE(a.messages, 0),
            'lessons', COALESCE(a.lessons, 0),
            'courses', COALESCE(co.list, '[]'::jsonb),
            'certificates', COALESCE(ce.list, '[]'::jsonb)
          )
          ORDER BY COALESCE(a.active, false) DESC, a.last_active_at DESC NULLS LAST, p.last_name, p.first_name
        ),
        '[]'::jsonb
      )
    )
    FROM people p
    LEFT JOIN activity a ON a.user_id = p.user_id
    LEFT JOIN courses co ON co.user_id = p.user_id
    LEFT JOIN certs ce ON ce.user_id = p.user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_cst_client_detail(bigint, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cst_client_detail(bigint, date) TO authenticated, service_role;
