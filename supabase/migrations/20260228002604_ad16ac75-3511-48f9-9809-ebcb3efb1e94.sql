
-- ============================================================
-- Step 2A: Checkpoint Phases — tables, views, RPCs, RLS, flag
-- ============================================================

-- 1. Lookup table: dd_phase_status
CREATE TABLE public.dd_phase_status (
  code   bigint  PRIMARY KEY,
  value  text    NOT NULL UNIQUE,
  description text NOT NULL,
  seq    integer NOT NULL
);

INSERT INTO public.dd_phase_status (code, value, description, seq) VALUES
  (0, 'open',                       'Open',                        0),
  (1, 'in_progress',                'In Progress',                 1),
  (2, 'completed',                  'Completed',                   2),
  (3, 'on_hold',                    'On Hold',                     3),
  (4, 'completed_with_exceptions',  'Completed with Exceptions',   4);

ALTER TABLE public.dd_phase_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_phase_status_select_authenticated"
  ON public.dd_phase_status FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "dd_phase_status_modify_vivacity"
  ON public.dd_phase_status FOR ALL
  TO authenticated USING (is_vivacity_team_safe(auth.uid()))
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- 2. Phases (templates)
CREATE TABLE public.phases (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_key          text        NOT NULL UNIQUE,
  title              text        NOT NULL,
  description        text,
  gate_type          text        NOT NULL DEFAULT 'none'
                                 CHECK (gate_type IN ('hard','soft','none')),
  is_archived        boolean     DEFAULT false,
  allow_parallel     boolean     DEFAULT false,
  sort_order_default integer     DEFAULT 0,
  created_by         uuid,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phases_select_authenticated"
  ON public.phases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "phases_modify_vivacity"
  ON public.phases FOR ALL
  TO authenticated USING (is_vivacity_team_safe(auth.uid()))
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- 3. Phase-Stages mapping (template level)
CREATE TABLE public.phase_stages (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id    uuid    NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  package_id  bigint  NOT NULL,
  stage_id    integer NOT NULL,
  sort_order  integer DEFAULT 0,
  is_required boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (phase_id, package_id, stage_id)
);

ALTER TABLE public.phase_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase_stages_select_authenticated"
  ON public.phase_stages FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "phase_stages_modify_vivacity"
  ON public.phase_stages FOR ALL
  TO authenticated USING (is_vivacity_team_safe(auth.uid()))
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- 4. Phase Instances (runtime)
CREATE TABLE public.phase_instances (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id             uuid        NOT NULL REFERENCES public.phases(id),
  package_instance_id  bigint      NOT NULL,
  status               text        NOT NULL DEFAULT 'open',
  gate_type            text        NOT NULL CHECK (gate_type IN ('hard','soft','none')),
  sort_order           integer     DEFAULT 0,
  notes                text,
  exception_reason     text,
  proceed_reason       text,
  started_at           timestamptz,
  completed_at         timestamptz,
  closed_by            uuid,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (phase_id, package_instance_id)
);

ALTER TABLE public.phase_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase_instances_select"
  ON public.phase_instances FOR SELECT
  TO authenticated USING (
    is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.package_instances pi
      JOIN public.tenant_users tu ON tu.tenant_id = pi.tenant_id
      WHERE pi.id = phase_instances.package_instance_id
        AND tu.user_id = auth.uid()
    )
  );

CREATE POLICY "phase_instances_modify_vivacity"
  ON public.phase_instances FOR ALL
  TO authenticated USING (is_vivacity_team_safe(auth.uid()))
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- 5. Feature flag on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN enable_checkpoint_phases boolean NOT NULL DEFAULT false;

-- 6. Views
CREATE OR REPLACE VIEW public.v_package_has_phases
WITH (security_invoker = true) AS
SELECT
  ps.package_id,
  true AS has_phases,
  COUNT(DISTINCT ps.phase_id)::integer AS phase_count
FROM public.phase_stages ps
GROUP BY ps.package_id;

CREATE OR REPLACE VIEW public.v_phase_progress_summary
WITH (security_invoker = true) AS
SELECT
  pi.package_instance_id,
  pi.id AS phase_instance_id,
  pi.phase_id,
  p.title AS phase_title,
  pi.sort_order,
  pi.gate_type,
  pi.status,
  COUNT(ps.id)::integer AS total_stages,
  COUNT(ps.id) FILTER (WHERE ps.is_required)::integer AS required_stages,
  COUNT(si.id) FILTER (WHERE si.status_id IN (2,3))::integer AS completed_stages,
  COUNT(si.id) FILTER (WHERE ps.is_required AND si.status_id IN (2,3))::integer AS completed_required,
  CASE
    WHEN COUNT(ps.id) FILTER (WHERE ps.is_required) = 0 THEN true
    WHEN COUNT(si.id) FILTER (WHERE ps.is_required AND si.status_id IN (2,3))
         >= COUNT(ps.id) FILTER (WHERE ps.is_required) THEN true
    ELSE false
  END AS is_passable
FROM public.phase_instances pi
JOIN public.phases p ON p.id = pi.phase_id
LEFT JOIN public.phase_stages ps
  ON ps.phase_id = pi.phase_id
LEFT JOIN public.stage_instances si
  ON si.stage_id = ps.stage_id
  AND si.packageinstance_id = pi.package_instance_id
GROUP BY pi.id, pi.package_instance_id, pi.phase_id, p.title,
         pi.sort_order, pi.gate_type, pi.status;

-- 7. RPCs

CREATE OR REPLACE FUNCTION public.fn_instantiate_phases_for_package_instance(
  p_package_instance_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_id bigint;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF NOT is_vivacity_team_safe(v_user_id) THEN
    RAISE EXCEPTION 'Unauthorised: Vivacity staff only';
  END IF;

  SELECT pki.package_id INTO v_package_id
  FROM public.package_instances pki
  WHERE pki.id = p_package_instance_id;

  IF v_package_id IS NULL THEN
    RAISE EXCEPTION 'Package instance % not found', p_package_instance_id;
  END IF;

  INSERT INTO public.phase_instances (phase_id, package_instance_id, gate_type, sort_order)
  SELECT DISTINCT
    ph.id,
    p_package_instance_id,
    ph.gate_type,
    ph.sort_order_default
  FROM public.phase_stages phs
  JOIN public.phases ph ON ph.id = phs.phase_id
  WHERE phs.package_id = v_package_id
    AND ph.is_archived = false
  ON CONFLICT (phase_id, package_instance_id) DO NOTHING;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES (
    'phase_instances',
    gen_random_uuid(),
    'instantiate_phases',
    v_user_id,
    jsonb_build_object('package_instance_id', p_package_instance_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_close_phase_instance(
  p_phase_instance_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_exception_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_missing integer;
BEGIN
  v_user_id := auth.uid();
  IF NOT is_vivacity_team_safe(v_user_id) THEN
    RAISE EXCEPTION 'Unauthorised: Vivacity staff only';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dd_phase_status WHERE value = p_status) THEN
    RAISE EXCEPTION 'Invalid phase status: %', p_status;
  END IF;

  IF p_status = 'completed' THEN
    SELECT COUNT(*) INTO v_missing
    FROM public.phase_stages ps
    JOIN public.phase_instances phi ON phi.phase_id = ps.phase_id
    WHERE phi.id = p_phase_instance_id
      AND ps.is_required = true
      AND ps.package_id = (
        SELECT pin.package_id FROM public.package_instances pin
        WHERE pin.id = phi.package_instance_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stage_instances si
        WHERE si.stage_id = ps.stage_id
          AND si.packageinstance_id = phi.package_instance_id
          AND si.status_id IN (2,3)
      );

    IF v_missing > 0 THEN
      RAISE EXCEPTION 'Cannot complete: % required stage(s) not finished', v_missing;
    END IF;
  END IF;

  IF p_status = 'completed_with_exceptions' AND (p_exception_reason IS NULL OR p_exception_reason = '') THEN
    RAISE EXCEPTION 'Exception reason required for completed_with_exceptions';
  END IF;

  UPDATE public.phase_instances
  SET status = p_status,
      notes = COALESCE(p_note, notes),
      exception_reason = CASE WHEN p_status = 'completed_with_exceptions' THEN p_exception_reason ELSE exception_reason END,
      completed_at = CASE WHEN p_status IN ('completed','completed_with_exceptions') THEN now() ELSE completed_at END,
      closed_by = CASE WHEN p_status IN ('completed','completed_with_exceptions') THEN v_user_id ELSE closed_by END,
      updated_at = now()
  WHERE id = p_phase_instance_id;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES (
    'phase_instances',
    p_phase_instance_id,
    'close_phase',
    v_user_id,
    jsonb_build_object('status', p_status, 'note', p_note, 'exception_reason', p_exception_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_check_phase_gate(
  p_phase_instance_id uuid
)
RETURNS TABLE(is_passable boolean, gate_type text, missing_stages text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN COUNT(ps.id) FILTER (WHERE ps.is_required) = 0 THEN true
      WHEN COUNT(si.id) FILTER (WHERE ps.is_required AND si.status_id IN (2,3))
           >= COUNT(ps.id) FILTER (WHERE ps.is_required) THEN true
      ELSE false
    END AS is_passable,
    phi.gate_type,
    ARRAY_AGG(ds.title) FILTER (
      WHERE ps.is_required
        AND (si.id IS NULL OR si.status_id NOT IN (2,3))
    ) AS missing_stages
  FROM public.phase_instances phi
  JOIN public.phase_stages ps ON ps.phase_id = phi.phase_id
  JOIN public.documents_stages ds ON ds.id = ps.stage_id
  LEFT JOIN public.stage_instances si
    ON si.stage_id = ps.stage_id
    AND si.packageinstance_id = phi.package_instance_id
  WHERE phi.id = p_phase_instance_id
    AND ps.package_id = (
      SELECT pin.package_id FROM public.package_instances pin
      WHERE pin.id = phi.package_instance_id
    )
  GROUP BY phi.gate_type;
END;
$$;

-- 8. Audit triggers
CREATE TRIGGER trg_phases_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.phases
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_audit();

CREATE TRIGGER trg_phase_stages_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.phase_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_audit();

CREATE TRIGGER trg_phase_instances_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.phase_instances
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_audit();

-- Grant execute on RPCs to authenticated
GRANT EXECUTE ON FUNCTION public.fn_instantiate_phases_for_package_instance(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_close_phase_instance(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_phase_gate(uuid) TO authenticated;

-- ============================================================
-- ROLLBACK (reference only):
-- DROP VIEW IF EXISTS v_phase_progress_summary;
-- DROP VIEW IF EXISTS v_package_has_phases;
-- DROP FUNCTION IF EXISTS fn_check_phase_gate;
-- DROP FUNCTION IF EXISTS fn_close_phase_instance;
-- DROP FUNCTION IF EXISTS fn_instantiate_phases_for_package_instance;
-- DROP TABLE IF EXISTS phase_instances;
-- DROP TABLE IF EXISTS phase_stages;
-- DROP TABLE IF EXISTS phases;
-- DROP TABLE IF EXISTS dd_phase_status;
-- ALTER TABLE app_settings DROP COLUMN IF EXISTS enable_checkpoint_phases;
-- ============================================================
