-- Hotfix: admin_set_tenant_csc_assignment never synced tenants.assigned_consultant_user_id,
-- unlike bulk_reassign_primary_csc and auto_assign_consultant which both do. Capacity/executive
-- dashboards (v_dashboard_tenant_portfolio.assigned_csc_user_id, v_executive_client_health.owner_user_uuid,
-- vw_consultant_load.active_clients_count) all read assigned_consultant_user_id, so single-tenant
-- CSC reassignments via the quick-assign dropdown silently went stale on those surfaces.

-- 1. One-time backfill for tenants already drifted via this path.
UPDATE public.tenants t
SET assigned_consultant_user_id = tca.csc_user_id
FROM public.tenant_csc_assignments tca
WHERE tca.tenant_id = t.id
  AND tca.is_primary = true
  AND tca.ended_at IS NULL
  AND t.assigned_consultant_user_id IS DISTINCT FROM tca.csc_user_id;

-- 2. Keep the legacy column in sync going forward, mirroring the pattern already
--    used in bulk_reassign_primary_csc and auto_assign_consultant.
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

  -- Keep legacy column in sync for consumers that still read it
  -- (capacity/executive dashboards, auto-assign candidate scoring).
  IF p_is_primary THEN
    UPDATE public.tenants
       SET assigned_consultant_user_id = p_csc_user_id
     WHERE id = p_tenant_id
       AND assigned_consultant_user_id IS DISTINCT FROM p_csc_user_id;
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
