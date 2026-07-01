-- Step 1.1 Add nullable completion timestamp columns
ALTER TABLE public.tenant_csc_assignments
  ADD COLUMN IF NOT EXISTS ended_at timestamptz NULL;
ALTER TABLE public.tasks_tenants
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;
ALTER TABLE public.ops_work_items
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- Step 1.2 Backfill completion timestamps
UPDATE public.tasks_tenants
   SET completed_at = updated_at
 WHERE completed_at IS NULL
   AND (completed = true OR status = 'completed');

UPDATE public.ops_work_items
   SET completed_at = updated_at
 WHERE completed_at IS NULL
   AND status IN ('done','cancelled');

-- Step 1.3 Convert plain UNIQUE to partial unique index (active-only)
ALTER TABLE public.tenant_csc_assignments
  DROP CONSTRAINT IF EXISTS tenant_csc_assignments_tenant_id_csc_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS
  tenant_csc_assignments_tenant_csc_active_uniq
  ON public.tenant_csc_assignments (tenant_id, csc_user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_csc_assignments_active
  ON public.tenant_csc_assignments (tenant_id, is_primary)
  WHERE ended_at IS NULL;

-- Step 1.4 Auto-populate trigger for tasks_tenants
CREATE OR REPLACE FUNCTION public.trg_tasks_tenants_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Transition INTO terminal state → stamp completed_at + keep boolean/status in sync
  IF (NEW.completed = true AND COALESCE(OLD.completed, false) = false)
     OR (NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed') THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    NEW.completed := true;
    IF NEW.status <> 'completed' THEN
      NEW.status := 'completed';
    END IF;
  END IF;

  -- Transition OUT of terminal state → clear timestamp and boolean
  IF (COALESCE(OLD.completed, false) = true AND NEW.completed = false)
     OR (COALESCE(OLD.status,'') = 'completed' AND NEW.status <> 'completed') THEN
    NEW.completed_at := NULL;
    NEW.completed := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_tasks_tenants_set_completed_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS tasks_tenants_completed_at_biu ON public.tasks_tenants;
CREATE TRIGGER tasks_tenants_completed_at_biu
BEFORE INSERT OR UPDATE ON public.tasks_tenants
FOR EACH ROW EXECUTE FUNCTION public.trg_tasks_tenants_set_completed_at();

-- Step 1.5 Auto-populate trigger for ops_work_items
CREATE OR REPLACE FUNCTION public.trg_ops_work_items_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('done','cancelled')
     AND COALESCE(OLD.status,'') NOT IN ('done','cancelled') THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  IF COALESCE(OLD.status,'') IN ('done','cancelled')
     AND NEW.status NOT IN ('done','cancelled') THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_ops_work_items_set_completed_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS ops_work_items_completed_at_biu ON public.ops_work_items;
CREATE TRIGGER ops_work_items_completed_at_biu
BEFORE INSERT OR UPDATE ON public.ops_work_items
FOR EACH ROW EXECUTE FUNCTION public.trg_ops_work_items_set_completed_at();

-- Step 1.6 Rewrite admin_set_tenant_csc_assignment for partial-unique semantics
CREATE OR REPLACE FUNCTION public.admin_set_tenant_csc_assignment(
  p_tenant_id   bigint,
  p_csc_user_id uuid,
  p_is_primary  boolean DEFAULT true,
  p_role_label  text    DEFAULT 'CSC'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  SELECT is_csc, staff_teams, staff_team
    INTO v_is_csc, v_staff_teams, v_staff_team
    FROM public.users WHERE user_uuid = p_csc_user_id;

  IF NOT (
    COALESCE(v_is_csc, false)
    OR v_staff_team = 'client_success'
    OR 'client_success' = ANY(COALESCE(v_staff_teams, ARRAY[]::text[]))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'User is not marked as Client Success team member');
  END IF;

  IF p_is_primary THEN
    UPDATE public.tenant_csc_assignments
       SET is_primary = false, updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND is_primary = true
       AND ended_at IS NULL;
  END IF;

  UPDATE public.tenant_csc_assignments
     SET is_primary = p_is_primary,
         role_label = p_role_label,
         updated_at = now()
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
$$;

REVOKE ALL   ON FUNCTION public.admin_set_tenant_csc_assignment(bigint, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_csc_assignment(bigint, uuid, boolean, text) TO authenticated;

-- Step 1.7 Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';