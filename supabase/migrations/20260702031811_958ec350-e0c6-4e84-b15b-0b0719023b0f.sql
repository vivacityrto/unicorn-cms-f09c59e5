
-- =====================================================================
-- 1. Column + backfill + supporting index
-- =====================================================================

ALTER TABLE public.tenant_csc_assignments
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL;

COMMENT ON COLUMN public.tenant_csc_assignments.superseded_at IS
  'Timestamp at which this row lost primary status because a different csc_user_id became primary for this tenant. Distinct from ended_at (which is reserved for tenant churn).';

-- One-time backfill: for existing demoted rows, use updated_at
-- (validated: all 34 demoted rows have updated_at within 5s of a
-- csc_assignment_set / bulk_csc_reassignment audit entry).
UPDATE public.tenant_csc_assignments
   SET superseded_at = updated_at
 WHERE is_primary = false
   AND superseded_at IS NULL
   AND ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tcsc_history
  ON public.tenant_csc_assignments (tenant_id, assigned_since, superseded_at);

-- =====================================================================
-- 2. admin_set_tenant_csc_assignment — stamp superseded_at on demote
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_set_tenant_csc_assignment(
  p_tenant_id  bigint,
  p_csc_user_id uuid,
  p_is_primary boolean DEFAULT true,
  p_role_label text    DEFAULT 'CSC'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id     uuid := auth.uid();
  v_is_admin     boolean;
  v_is_csc       boolean;
  v_staff_teams  text[];
  v_staff_team   text;
BEGIN
  SELECT public.is_super_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only SuperAdmin can manage CSC assignments');
  END IF;

  SELECT u.is_csc, u.staff_teams, u.staff_team
    INTO v_is_csc, v_staff_teams, v_staff_team
    FROM public.users u WHERE u.user_uuid = p_csc_user_id;

  IF NOT (
    COALESCE(v_is_csc, false)
    OR v_staff_team = 'client_success'
    OR 'client_success' = ANY(COALESCE(v_staff_teams, ARRAY[]::text[]))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'User is not marked as Client Success team member');
  END IF;

  IF p_is_primary THEN
    -- Demote the current primary, stamping superseded_at so KPIs can
    -- attribute historical activity to the outgoing CSC.
    UPDATE public.tenant_csc_assignments
       SET is_primary    = false,
           superseded_at = now(),
           updated_at    = now()
     WHERE tenant_id  = p_tenant_id
       AND is_primary = true
       AND ended_at IS NULL
       AND csc_user_id <> p_csc_user_id;
  END IF;

  UPDATE public.tenant_csc_assignments
     SET is_primary    = p_is_primary,
         role_label    = p_role_label,
         superseded_at = CASE WHEN p_is_primary THEN NULL ELSE superseded_at END,
         updated_at    = now()
   WHERE tenant_id   = p_tenant_id
     AND csc_user_id = p_csc_user_id
     AND ended_at IS NULL;
  IF NOT FOUND THEN
    INSERT INTO public.tenant_csc_assignments
      (tenant_id, csc_user_id, is_primary, role_label, updated_at)
    VALUES (p_tenant_id, p_csc_user_id, p_is_primary, p_role_label, now());
  END IF;

  INSERT INTO public.client_audit_log
    (tenant_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (p_tenant_id, v_actor_id, 'csc_assignment_set',
    'tenant_csc_assignments', p_csc_user_id::text,
    jsonb_build_object(
      'csc_user_id', p_csc_user_id,
      'is_primary', p_is_primary,
      'role_label', p_role_label));

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_tenant_csc_assignment(bigint, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_csc_assignment(bigint, uuid, boolean, text) TO authenticated, service_role;

-- =====================================================================
-- 3. bulk_reassign_primary_csc — two-row pattern (demote + insert)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bulk_reassign_primary_csc(
  p_from_user_id uuid,
  p_to_user_id   uuid,
  p_tenant_ids   bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_from_valid boolean;
  v_to_valid boolean;
  v_from_name text;
  v_to_name text;
  v_reassigned bigint[] := ARRAY[]::bigint[];
  v_skipped jsonb := '[]'::jsonb;
  v_tid bigint;
  v_current_primary uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.unicorn_role INTO v_caller_role
    FROM public.users u WHERE u.user_uuid = v_caller;
  IF v_caller_role NOT IN ('Super Admin', 'Team Leader') THEN
    RAISE EXCEPTION 'Forbidden: caller role % is not permitted to perform bulk CSC reassignment', COALESCE(v_caller_role, '<none>');
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'from_user_id and to_user_id must differ';
  END IF;

  SELECT (u.is_csc AND NOT COALESCE(u.archived,false) AND NOT COALESCE(u.disabled,false)),
         COALESCE(NULLIF(trim(concat(u.first_name,' ',u.last_name)),''), u.email)
    INTO v_from_valid, v_from_name
    FROM public.users u WHERE u.user_uuid = p_from_user_id;
  IF NOT COALESCE(v_from_valid, false) THEN
    RAISE EXCEPTION 'from_user_id is not an active CSC';
  END IF;

  SELECT (u.is_csc AND NOT COALESCE(u.archived,false) AND NOT COALESCE(u.disabled,false)),
         COALESCE(NULLIF(trim(concat(u.first_name,' ',u.last_name)),''), u.email)
    INTO v_to_valid, v_to_name
    FROM public.users u WHERE u.user_uuid = p_to_user_id;
  IF NOT COALESCE(v_to_valid, false) THEN
    RAISE EXCEPTION 'to_user_id is not an active CSC';
  END IF;

  IF p_tenant_ids IS NULL OR array_length(p_tenant_ids,1) IS NULL THEN
    RAISE EXCEPTION 'tenant_ids must be a non-empty array';
  END IF;

  FOREACH v_tid IN ARRAY p_tenant_ids LOOP
    SELECT a.csc_user_id INTO v_current_primary
    FROM public.tenant_csc_assignments a
    WHERE a.tenant_id = v_tid AND a.is_primary = true
    LIMIT 1;

    IF v_current_primary IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('tenant_id', v_tid, 'reason', 'No primary CSC row found');
      CONTINUE;
    ELSIF v_current_primary <> p_from_user_id THEN
      v_skipped := v_skipped || jsonb_build_object('tenant_id', v_tid, 'reason', 'Primary CSC is no longer the from user');
      CONTINUE;
    END IF;

    -- Demote the outgoing CSC's row (preserves history).
    UPDATE public.tenant_csc_assignments
       SET is_primary    = false,
           superseded_at = now(),
           updated_at    = now()
     WHERE tenant_id  = v_tid
       AND csc_user_id = p_from_user_id
       AND is_primary  = true
       AND ended_at IS NULL;

    -- Upsert the incoming CSC's row as the new primary.
    UPDATE public.tenant_csc_assignments
       SET is_primary     = true,
           assigned_since = now(),
           superseded_at  = NULL,
           updated_at     = now()
     WHERE tenant_id   = v_tid
       AND csc_user_id = p_to_user_id
       AND ended_at IS NULL;
    IF NOT FOUND THEN
      INSERT INTO public.tenant_csc_assignments
        (tenant_id, csc_user_id, is_primary, role_label, assigned_since, updated_at)
      VALUES (v_tid, p_to_user_id, true, 'CSC', now(), now());
    END IF;

    -- Keep legacy column in sync for consumers that still read it.
    UPDATE public.tenants
       SET assigned_consultant_user_id = p_to_user_id
     WHERE id = v_tid
       AND assigned_consultant_user_id = p_from_user_id;

    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, details)
    VALUES (
      v_tid, v_caller, 'bulk_csc_reassignment',
      'tenant_csc_assignments', v_tid::text,
      jsonb_build_object('csc_user_id', p_from_user_id, 'csc_name', v_from_name),
      jsonb_build_object('csc_user_id', p_to_user_id,   'csc_name', v_to_name),
      jsonb_build_object('role_scope','primary_csc')
    );

    v_reassigned := v_reassigned || v_tid;
  END LOOP;

  RETURN jsonb_build_object(
    'reassigned', to_jsonb(v_reassigned),
    'skipped', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_reassign_primary_csc(uuid, uuid, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_reassign_primary_csc(uuid, uuid, bigint[]) TO authenticated, service_role;

-- =====================================================================
-- 4. kpi_csc_retention_rows — clients on my books during [start, end)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kpi_csc_retention_rows(
  p_csc_user_id uuid,
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE(
  tenant_id      bigint,
  tenant_name    text,
  assigned_since timestamptz,
  superseded_at  timestamptz,
  churned_at     timestamptz,
  churned_in_period boolean
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $function$
  -- One row per tenant this CSC was primary for at any point during the
  -- half-open window [p_start, p_end). If they had multiple stints for the
  -- same tenant, take the latest overlapping one.
  WITH stints AS (
    SELECT DISTINCT ON (a.tenant_id)
      a.tenant_id,
      a.assigned_since,
      a.superseded_at
    FROM public.tenant_csc_assignments a
    WHERE a.csc_user_id = p_csc_user_id
      AND a.assigned_since < p_end
      AND (a.superseded_at IS NULL OR a.superseded_at > p_start)
      AND (a.ended_at IS NULL OR a.ended_at > p_start)
    ORDER BY a.tenant_id, a.assigned_since DESC
  )
  SELECT
    s.tenant_id,
    t.name AS tenant_name,
    s.assigned_since,
    s.superseded_at,
    t.churned_at,
    (t.churned_at IS NOT NULL
      AND t.churned_at >= p_start
      AND t.churned_at <  p_end
      AND t.churned_at >= s.assigned_since
      AND (s.superseded_at IS NULL OR t.churned_at <= s.superseded_at)
    ) AS churned_in_period
  FROM stints s
  LEFT JOIN public.tenants t ON t.id = s.tenant_id;
$function$;

REVOKE ALL ON FUNCTION public.kpi_csc_retention_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_csc_retention_rows(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- =====================================================================
-- 5. kpi_csc_communication_rows — client-initiated messages attributed
--    to whoever was primary at the message's created_at.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kpi_csc_communication_rows(
  p_csc_user_id uuid,
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE(
  message_id      uuid,
  conversation_id uuid,
  tenant_id       bigint,
  tenant_name     text,
  subject         text,
  received_at     timestamptz,
  responded_at    timestamptz,
  response_seconds double precision,
  sla_status      text     -- 'met' | 'missed' | 'pending'
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $function$
  WITH client_msgs_in_window AS (
    -- All client messages in the period for tenants this CSC ever handled.
    -- The point-in-time attribution filter is applied via the join below.
    SELECT m.id, m.conversation_id, m.tenant_id, m.created_at, m.body
    FROM public.tenant_messages m
    WHERE m.sender_type = 'client'
      AND m.created_at >= p_start
      AND m.created_at <  p_end
  ),
  attributed AS (
    -- Keep only messages where this CSC was primary at message time.
    SELECT cm.*
    FROM client_msgs_in_window cm
    WHERE EXISTS (
      SELECT 1
      FROM public.tenant_csc_assignments a
      WHERE a.tenant_id   = cm.tenant_id
        AND a.csc_user_id = p_csc_user_id
        AND a.assigned_since <= cm.created_at
        AND (a.superseded_at IS NULL OR a.superseded_at > cm.created_at)
        AND (a.ended_at      IS NULL OR a.ended_at      > cm.created_at)
    )
  ),
  first_by_conv AS (
    -- First-ever message per touched conversation, to filter to
    -- client-initiated threads only.
    SELECT DISTINCT ON (tm.conversation_id)
      tm.conversation_id, tm.sender_type
    FROM public.tenant_messages tm
    WHERE tm.conversation_id IN (SELECT DISTINCT conversation_id FROM attributed WHERE conversation_id IS NOT NULL)
    ORDER BY tm.conversation_id, tm.created_at ASC
  ),
  client_initiated AS (
    SELECT a.*
    FROM attributed a
    JOIN first_by_conv f
      ON f.conversation_id = a.conversation_id
     AND f.sender_type = 'client'
  ),
  next_staff AS (
    -- Earliest staff reply strictly after each client message.
    SELECT
      ci.id AS client_msg_id,
      (
        SELECT MIN(sm.created_at)
        FROM public.tenant_messages sm
        WHERE sm.conversation_id = ci.conversation_id
          AND sm.sender_type = 'staff'
          AND sm.created_at > ci.created_at
      ) AS staff_ts
    FROM client_initiated ci
  )
  SELECT
    ci.id                AS message_id,
    ci.conversation_id,
    ci.tenant_id,
    t.name               AS tenant_name,
    COALESCE(NULLIF(conv.subject,''), NULLIF(conv.topic,''), NULLIF(LEFT(ci.body, 60),''), '(no subject)') AS subject,
    ci.created_at        AS received_at,
    ns.staff_ts          AS responded_at,
    CASE WHEN ns.staff_ts IS NOT NULL
         THEN EXTRACT(EPOCH FROM (ns.staff_ts - ci.created_at))
         ELSE NULL END   AS response_seconds,
    CASE
      WHEN ns.staff_ts IS NOT NULL AND (ns.staff_ts - ci.created_at) <= interval '12 hours' THEN 'met'
      WHEN ns.staff_ts IS NOT NULL THEN 'missed'
      WHEN (now() - ci.created_at) > interval '12 hours' THEN 'missed'
      ELSE 'pending'
    END                  AS sla_status
  FROM client_initiated ci
  LEFT JOIN next_staff ns ON ns.client_msg_id = ci.id
  LEFT JOIN public.tenants t ON t.id = ci.tenant_id
  LEFT JOIN public.tenant_conversations conv ON conv.id = ci.conversation_id
  ORDER BY ci.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_csc_communication_rows(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- =====================================================================
-- 6. kpi_csc_tasks_rows — package tasks attributed by created_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kpi_csc_tasks_rows(
  p_csc_user_id uuid,
  p_start       timestamptz,
  p_end         timestamptz
)
RETURNS TABLE(
  task_id      uuid,
  task_name    text,
  status       text,
  created_at   timestamptz,
  completed_at timestamptz,
  tenant_id    bigint,
  tenant_name  text,
  package_name text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $function$
  SELECT
    ctt.id           AS task_id,
    ctt.name         AS task_name,
    ctt.status,
    ctt.created_at,
    ctt.completed_at,
    cp.tenant_id,
    t.name           AS tenant_name,
    p.name           AS package_name
  FROM public.client_team_tasks ctt
  JOIN public.client_package_stages cps ON cps.id = ctt.client_package_stage_id
  JOIN public.client_packages       cp  ON cp.id  = cps.client_package_id
  LEFT JOIN public.tenants  t ON t.id = cp.tenant_id
  LEFT JOIN public.packages p ON p.id = cp.package_id
  WHERE ctt.created_at >= p_start
    AND ctt.created_at <  p_end
    AND EXISTS (
      SELECT 1
      FROM public.tenant_csc_assignments a
      WHERE a.tenant_id   = cp.tenant_id
        AND a.csc_user_id = p_csc_user_id
        AND a.assigned_since <= ctt.created_at
        AND (a.superseded_at IS NULL OR a.superseded_at > ctt.created_at)
        AND (a.ended_at      IS NULL OR a.ended_at      > ctt.created_at)
    )
  ORDER BY ctt.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.kpi_csc_tasks_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_csc_tasks_rows(uuid, timestamptz, timestamptz) TO authenticated, service_role;
