-- Rock blockers and carryover.
--
-- 1. 'blocked' joins the Rock status vocabulary (dd_rock_status). eos_rocks.status has
--    no CHECK, so no constraint changes; milestones already allow 'blocked'.
-- 2. eos_rock_blockers: why a Rock or milestone is blocked, what it depends on, the next
--    action and its owner, when it is next reviewed, and how it was resolved. One OPEN
--    blocker per subject; resolved ones are kept as history. Written only through
--    set_blocker() / resolve_blocker() (staff-only), never directly.
--    Status and blocker stay consistent: a Rock or milestone cannot BECOME blocked without
--    an open blocker (checked at commit), and leaving 'blocked' resolves the open blocker.
--    Resolving a blocker never completes anything.
-- 3. eos_rock_carryovers + eos_rock_carryover_milestones: a first-class, navigable record
--    that unfinished scope in one Rock was carried into a LATER-quarter Rock, with
--    milestone-level provenance. The source is never changed (status, dates, evidence
--    stay as committed). Separate from eos_rock_milestone_links (Company to Individual).
-- 4. carry_forward_rock(): staff-only, atomic. Carries selected incomplete milestones,
--    creates or reuses the destination Rock, keeps the Company to Individual structure
--    and recreates the Company-to-Individual milestone links in the destination quarter.
-- 5. rock_delete_blockers() also refuses to delete a Rock that is part of a carryover.
--
-- Additive; no existing row is changed apart from one new lookup row.
-- Rollback: rollback/20261028020000_rock_blockers_and_carryover.down.sql

-- 1. Rock status vocabulary ---------------------------------------------------------

INSERT INTO public.dd_rock_status (code, value, label, color, sort_order, is_active)
SELECT 5, 'blocked', 'Blocked', 'text-violet-700', 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.dd_rock_status WHERE value = 'blocked');

-- 2. Blockers -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eos_rock_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  rock_id uuid REFERENCES public.eos_rocks(id) ON DELETE CASCADE,
  milestone_id uuid,
  reason text NOT NULL,
  dependency_note text,
  depends_on_rock_id uuid REFERENCES public.eos_rocks(id) ON DELETE SET NULL,
  depends_on_milestone_id uuid REFERENCES public.eos_rock_milestones(id) ON DELETE SET NULL,
  next_action text,
  next_action_owner_id uuid REFERENCES auth.users(id),
  review_date date,
  evidence_url text,
  status_before text,
  recorded_by uuid REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_note text,
  CONSTRAINT eos_rock_blockers_milestone_fk FOREIGN KEY (milestone_id, tenant_id)
    REFERENCES public.eos_rock_milestones(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT eos_rock_blockers_one_subject CHECK ((rock_id IS NOT NULL)::int + (milestone_id IS NOT NULL)::int = 1),
  CONSTRAINT eos_rock_blockers_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  CONSTRAINT eos_rock_blockers_text_lengths CHECK (
    coalesce(length(dependency_note), 0) <= 1000 AND coalesce(length(next_action), 0) <= 1000
    AND coalesce(length(resolution_note), 0) <= 1000
  ),
  CONSTRAINT eos_rock_blockers_evidence_check CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
  CONSTRAINT eos_rock_blockers_one_dependency CHECK (depends_on_rock_id IS NULL OR depends_on_milestone_id IS NULL),
  CONSTRAINT eos_rock_blockers_not_self_rock CHECK (depends_on_rock_id IS NULL OR depends_on_rock_id <> rock_id),
  CONSTRAINT eos_rock_blockers_not_self_milestone CHECK (depends_on_milestone_id IS NULL OR depends_on_milestone_id <> milestone_id),
  CONSTRAINT eos_rock_blockers_resolution_pair CHECK (resolved_at IS NOT NULL OR (resolved_by IS NULL AND resolution_note IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_eos_rock_blockers_open_rock
  ON public.eos_rock_blockers (rock_id) WHERE resolved_at IS NULL AND rock_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_eos_rock_blockers_open_milestone
  ON public.eos_rock_blockers (milestone_id) WHERE resolved_at IS NULL AND milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eos_rock_blockers_rock ON public.eos_rock_blockers (rock_id, recorded_at DESC) WHERE rock_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eos_rock_blockers_milestone ON public.eos_rock_blockers (milestone_id, recorded_at DESC) WHERE milestone_id IS NOT NULL;

ALTER TABLE public.eos_rock_blockers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_blockers_select ON public.eos_rock_blockers;
CREATE POLICY eos_rock_blockers_select ON public.eos_rock_blockers
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_blockers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_blockers TO authenticated;

-- Keeps the blocker's references inside one tenant and on live, staff-owned work.
CREATE OR REPLACE FUNCTION public.validate_eos_rock_blocker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  subject_tenant bigint;
  dep_tenant bigint;
BEGIN
  IF NEW.rock_id IS NOT NULL THEN
    SELECT tenant_id INTO subject_tenant FROM public.eos_rocks WHERE id = NEW.rock_id;
  ELSE
    SELECT tenant_id INTO subject_tenant FROM public.eos_rock_milestones WHERE id = NEW.milestone_id;
  END IF;
  IF subject_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'The blocker and what it blocks must belong to the same tenant';
  END IF;

  IF NEW.depends_on_rock_id IS NOT NULL THEN
    SELECT tenant_id INTO dep_tenant FROM public.eos_rocks WHERE id = NEW.depends_on_rock_id;
    IF dep_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'A blocker can only depend on a Rock in the same tenant';
    END IF;
  END IF;
  IF NEW.depends_on_milestone_id IS NOT NULL THEN
    SELECT tenant_id INTO dep_tenant FROM public.eos_rock_milestones WHERE id = NEW.depends_on_milestone_id;
    IF dep_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'A blocker can only depend on a milestone in the same tenant';
    END IF;
  END IF;

  IF NEW.next_action_owner_id IS NOT NULL AND NOT public.is_vivacity_team_safe(NEW.next_action_owner_id) THEN
    RAISE EXCEPTION 'The next action must be owned by an active team member';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_blocker() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_eos_rock_blocker ON public.eos_rock_blockers;
CREATE TRIGGER trg_validate_eos_rock_blocker
  BEFORE INSERT OR UPDATE ON public.eos_rock_blockers
  FOR EACH ROW EXECUTE FUNCTION public.validate_eos_rock_blocker();

-- Leaving 'blocked' by any route resolves the open blocker, so state never disagrees.
CREATE OR REPLACE FUNCTION public.resolve_blocker_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'blocked' AND NEW.status IS DISTINCT FROM 'blocked' THEN
    IF TG_TABLE_NAME = 'eos_rocks' THEN
      UPDATE public.eos_rock_blockers
         SET resolved_at = now(), resolved_by = auth.uid(),
             resolution_note = COALESCE(resolution_note, 'Status changed to ' || COALESCE(NEW.status, 'unset'))
       WHERE rock_id = NEW.id AND resolved_at IS NULL;
    ELSE
      UPDATE public.eos_rock_blockers
         SET resolved_at = now(), resolved_by = auth.uid(),
             resolution_note = COALESCE(resolution_note, 'Status changed to ' || COALESCE(NEW.status, 'unset'))
       WHERE milestone_id = NEW.id AND resolved_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_blocker_on_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resolve_blocker_on_rock_status ON public.eos_rocks;
CREATE TRIGGER trg_resolve_blocker_on_rock_status
  AFTER UPDATE OF status ON public.eos_rocks
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.resolve_blocker_on_status_change();

DROP TRIGGER IF EXISTS trg_resolve_blocker_on_milestone_status ON public.eos_rock_milestones;
CREATE TRIGGER trg_resolve_blocker_on_milestone_status
  AFTER UPDATE OF status ON public.eos_rock_milestones
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.resolve_blocker_on_status_change();

-- Becoming 'blocked' needs an open blocker by commit time. Existing blocked rows are not
-- re-judged: this only fires when the status changes to blocked (or a blocked row is inserted).
CREATE OR REPLACE FUNCTION public.require_open_blocker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  has_open boolean;
  current_status text;
BEGIN
  -- The event carries the row as it was when the status changed; judge the
  -- row as it stands now, so a blocked-then-unblocked row in one transaction
  -- is not refused.
  IF TG_TABLE_NAME = 'eos_rocks' THEN
    SELECT status INTO current_status FROM public.eos_rocks WHERE id = NEW.id;
  ELSE
    SELECT status INTO current_status FROM public.eos_rock_milestones WHERE id = NEW.id;
  END IF;
  IF current_status IS DISTINCT FROM 'blocked' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM 'blocked' THEN
      RETURN NULL;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'eos_rocks' THEN
    SELECT EXISTS (SELECT 1 FROM public.eos_rock_blockers WHERE rock_id = NEW.id AND resolved_at IS NULL) INTO has_open;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.eos_rock_blockers WHERE milestone_id = NEW.id AND resolved_at IS NULL) INTO has_open;
  END IF;
  IF NOT has_open THEN
    RAISE EXCEPTION 'A blocked Rock or milestone needs a reason. Record the blocker first.';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.require_open_blocker() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_require_open_blocker_rock ON public.eos_rocks;
CREATE CONSTRAINT TRIGGER trg_require_open_blocker_rock
  AFTER INSERT OR UPDATE OF status ON public.eos_rocks
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_open_blocker();

DROP TRIGGER IF EXISTS trg_require_open_blocker_milestone ON public.eos_rock_milestones;
CREATE CONSTRAINT TRIGGER trg_require_open_blocker_milestone
  AFTER INSERT OR UPDATE OF status ON public.eos_rock_milestones
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_open_blocker();

-- Record or edit the open blocker and set the status to blocked, atomically.
CREATE OR REPLACE FUNCTION public.set_blocker(p_subject text, p_id uuid, p_blocker jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant bigint;
  v_status text;
  v_archived timestamptz;
  v_reason text;
  v_existing uuid;
  v_dep_rock uuid;
  v_dep_milestone uuid;
  v_owner uuid;
  v_review date;
  v_evidence text;
  v_blocker_id uuid;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;
  IF p_subject NOT IN ('rock', 'milestone') THEN
    RAISE EXCEPTION 'A blocker applies to a rock or a milestone';
  END IF;

  IF p_subject = 'rock' THEN
    SELECT tenant_id, status, archived_at INTO v_tenant, v_status, v_archived
    FROM public.eos_rocks WHERE id = p_id FOR UPDATE;
  ELSE
    SELECT m.tenant_id, m.status, r.archived_at INTO v_tenant, v_status, v_archived
    FROM public.eos_rock_milestones m JOIN public.eos_rocks r ON r.id = m.rock_id
    WHERE m.id = p_id FOR UPDATE OF m;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'An archived Rock cannot be blocked';
  END IF;
  IF v_status = 'complete' THEN
    RAISE EXCEPTION 'Completed work cannot be blocked';
  END IF;

  v_reason := btrim(COALESCE(p_blocker->>'reason', ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A blocker needs a reason';
  END IF;
  v_dep_rock := NULLIF(p_blocker->>'depends_on_rock_id', '')::uuid;
  v_dep_milestone := NULLIF(p_blocker->>'depends_on_milestone_id', '')::uuid;
  v_owner := NULLIF(p_blocker->>'next_action_owner_id', '')::uuid;
  v_review := NULLIF(p_blocker->>'review_date', '')::date;
  v_evidence := NULLIF(btrim(COALESCE(p_blocker->>'evidence_url', '')), '');

  IF p_subject = 'rock' THEN
    SELECT id INTO v_existing FROM public.eos_rock_blockers WHERE rock_id = p_id AND resolved_at IS NULL;
  ELSE
    SELECT id INTO v_existing FROM public.eos_rock_blockers WHERE milestone_id = p_id AND resolved_at IS NULL;
  END IF;

  IF v_existing IS NULL THEN
    INSERT INTO public.eos_rock_blockers (
      tenant_id, rock_id, milestone_id, reason, dependency_note, depends_on_rock_id, depends_on_milestone_id,
      next_action, next_action_owner_id, review_date, evidence_url, status_before, recorded_by
    ) VALUES (
      v_tenant,
      CASE WHEN p_subject = 'rock' THEN p_id END,
      CASE WHEN p_subject = 'milestone' THEN p_id END,
      v_reason,
      NULLIF(btrim(COALESCE(p_blocker->>'dependency_note', '')), ''),
      v_dep_rock, v_dep_milestone,
      NULLIF(btrim(COALESCE(p_blocker->>'next_action', '')), ''),
      v_owner, v_review, v_evidence,
      NULLIF(v_status, 'blocked'),
      auth.uid()
    ) RETURNING id INTO v_blocker_id;

    IF v_status IS DISTINCT FROM 'blocked' THEN
      IF p_subject = 'rock' THEN
        UPDATE public.eos_rocks SET status = 'blocked' WHERE id = p_id;
      ELSE
        UPDATE public.eos_rock_milestones SET status = 'blocked' WHERE id = p_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.eos_rock_blockers SET
      reason = v_reason,
      dependency_note = NULLIF(btrim(COALESCE(p_blocker->>'dependency_note', '')), ''),
      depends_on_rock_id = v_dep_rock,
      depends_on_milestone_id = v_dep_milestone,
      next_action = NULLIF(btrim(COALESCE(p_blocker->>'next_action', '')), ''),
      next_action_owner_id = v_owner,
      review_date = v_review,
      evidence_url = v_evidence
    WHERE id = v_existing;
    v_blocker_id := v_existing;
  END IF;

  RETURN jsonb_build_object('blocker_id', v_blocker_id, 'subject', p_subject, 'status', 'blocked', 'created', v_existing IS NULL);
END;
$function$;

-- Resolve the open blocker and set the status that follows. Never completes anything.
CREATE OR REPLACE FUNCTION public.resolve_blocker(p_subject text, p_id uuid, p_new_status text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_blocker public.eos_rock_blockers%ROWTYPE;
  v_allowed text[];
  v_fallback text;
  v_next text;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;
  IF p_subject NOT IN ('rock', 'milestone') THEN
    RAISE EXCEPTION 'A blocker applies to a rock or a milestone';
  END IF;

  IF p_subject = 'rock' THEN
    SELECT * INTO v_blocker FROM public.eos_rock_blockers WHERE rock_id = p_id AND resolved_at IS NULL FOR UPDATE;
    v_allowed := ARRAY['not_started', 'on_track', 'at_risk', 'off_track'];
    v_fallback := 'on_track';
  ELSE
    SELECT * INTO v_blocker FROM public.eos_rock_blockers WHERE milestone_id = p_id AND resolved_at IS NULL FOR UPDATE;
    v_allowed := ARRAY['not_started', 'in_progress', 'off_track', 'deferred'];
    v_fallback := 'in_progress';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no open blocker to resolve';
  END IF;

  IF p_new_status IS NOT NULL AND p_new_status IN ('complete', 'blocked') THEN
    RAISE EXCEPTION 'Resolving a blocker never completes work or leaves it blocked. Choose the status it resumes at.';
  END IF;
  IF p_new_status IS NOT NULL AND NOT (p_new_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Invalid status for this item';
  END IF;
  v_next := COALESCE(p_new_status, CASE WHEN v_blocker.status_before = ANY (v_allowed) THEN v_blocker.status_before END, v_fallback);

  UPDATE public.eos_rock_blockers
     SET resolved_at = now(), resolved_by = auth.uid(), resolution_note = NULLIF(btrim(COALESCE(p_note, '')), '')
   WHERE id = v_blocker.id;

  IF p_subject = 'rock' THEN
    UPDATE public.eos_rocks SET status = v_next WHERE id = p_id;
  ELSE
    UPDATE public.eos_rock_milestones SET status = v_next WHERE id = p_id;
  END IF;

  RETURN jsonb_build_object('blocker_id', v_blocker.id, 'subject', p_subject, 'status', v_next);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_blocker(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_blocker(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_blocker(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_blocker(text, uuid, text, text) TO authenticated;

-- 3. Carryover ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eos_rock_carryovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  source_rock_id uuid NOT NULL REFERENCES public.eos_rocks(id) ON DELETE RESTRICT,
  destination_rock_id uuid NOT NULL REFERENCES public.eos_rocks(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  carried_by uuid REFERENCES auth.users(id),
  carried_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_rock_carryovers_distinct CHECK (source_rock_id <> destination_rock_id),
  CONSTRAINT eos_rock_carryovers_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  CONSTRAINT eos_rock_carryovers_pair_key UNIQUE (source_rock_id, destination_rock_id),
  CONSTRAINT eos_rock_carryovers_id_tenant_key UNIQUE (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_eos_rock_carryovers_destination ON public.eos_rock_carryovers (destination_rock_id);

CREATE TABLE IF NOT EXISTS public.eos_rock_carryover_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  carryover_id uuid NOT NULL,
  source_milestone_id uuid,
  destination_milestone_id uuid,
  source_title text NOT NULL,
  source_status text NOT NULL,
  source_due_date date,
  new_due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_rock_carryover_milestones_carryover_fk FOREIGN KEY (carryover_id, tenant_id)
    REFERENCES public.eos_rock_carryovers(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT eos_rock_carryover_milestones_source_fk FOREIGN KEY (source_milestone_id, tenant_id)
    REFERENCES public.eos_rock_milestones(id, tenant_id) ON DELETE SET NULL (source_milestone_id),
  CONSTRAINT eos_rock_carryover_milestones_destination_fk FOREIGN KEY (destination_milestone_id, tenant_id)
    REFERENCES public.eos_rock_milestones(id, tenant_id) ON DELETE SET NULL (destination_milestone_id),
  CONSTRAINT eos_rock_carryover_milestones_distinct CHECK (source_milestone_id IS NULL OR source_milestone_id <> destination_milestone_id),
  CONSTRAINT eos_rock_carryover_milestones_source_once UNIQUE (source_milestone_id),
  CONSTRAINT eos_rock_carryover_milestones_destination_once UNIQUE (destination_milestone_id)
);
CREATE INDEX IF NOT EXISTS idx_eos_rock_carryover_milestones_carryover ON public.eos_rock_carryover_milestones (carryover_id);

ALTER TABLE public.eos_rock_carryovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_rock_carryover_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_carryovers_select ON public.eos_rock_carryovers;
CREATE POLICY eos_rock_carryovers_select ON public.eos_rock_carryovers
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );
DROP POLICY IF EXISTS eos_rock_carryover_milestones_select ON public.eos_rock_carryover_milestones;
CREATE POLICY eos_rock_carryover_milestones_select ON public.eos_rock_carryover_milestones
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_carryovers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.eos_rock_carryover_milestones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_carryovers, public.eos_rock_carryover_milestones TO authenticated;

-- A carryover goes forward in time, within one tenant and one level, never in a loop, and
-- keeps the Company to Individual structure intact.
CREATE OR REPLACE FUNCTION public.validate_eos_rock_carryover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  src public.eos_rocks%ROWTYPE;
  dst public.eos_rocks%ROWTYPE;
  parent_destination uuid;
BEGIN
  SELECT * INTO src FROM public.eos_rocks WHERE id = NEW.source_rock_id;
  SELECT * INTO dst FROM public.eos_rocks WHERE id = NEW.destination_rock_id;
  IF src.id IS NULL OR dst.id IS NULL THEN
    RAISE EXCEPTION 'Both Rocks must exist';
  END IF;
  IF src.tenant_id IS DISTINCT FROM NEW.tenant_id OR dst.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A carryover must stay within one tenant';
  END IF;
  IF src.rock_level IS DISTINCT FROM dst.rock_level THEN
    RAISE EXCEPTION 'A Rock can only be carried into a Rock at the same level';
  END IF;
  IF (dst.quarter_year * 4 + dst.quarter_number) <= (src.quarter_year * 4 + src.quarter_number) THEN
    RAISE EXCEPTION 'A Rock can only be carried into a later quarter';
  END IF;
  IF dst.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'The destination Rock is archived';
  END IF;

  -- No path from the destination back to the source (the quarter rule already forbids it).
  IF EXISTS (
    WITH RECURSIVE walk AS (
      SELECT c.destination_rock_id AS rock_id FROM public.eos_rock_carryovers c WHERE c.source_rock_id = NEW.destination_rock_id
      UNION
      SELECT c.destination_rock_id FROM public.eos_rock_carryovers c JOIN walk w ON c.source_rock_id = w.rock_id
    )
    SELECT 1 FROM walk WHERE rock_id = NEW.source_rock_id
  ) THEN
    RAISE EXCEPTION 'This carryover would create a loop';
  END IF;

  -- If the source's parent was itself carried forward, the destination must sit under that destination.
  IF src.parent_rock_id IS NOT NULL THEN
    SELECT c.destination_rock_id INTO parent_destination
    FROM public.eos_rock_carryovers c WHERE c.source_rock_id = src.parent_rock_id
    ORDER BY c.carried_at DESC LIMIT 1;
    IF parent_destination IS NOT NULL AND dst.parent_rock_id IS DISTINCT FROM parent_destination THEN
      RAISE EXCEPTION 'The destination Rock must serve the Rock its parent was carried into';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_carryover() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_eos_rock_carryover ON public.eos_rock_carryovers;
CREATE TRIGGER trg_validate_eos_rock_carryover
  BEFORE INSERT ON public.eos_rock_carryovers
  FOR EACH ROW EXECUTE FUNCTION public.validate_eos_rock_carryover();

CREATE OR REPLACE FUNCTION public.validate_eos_rock_carryover_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  co public.eos_rock_carryovers%ROWTYPE;
  sm public.eos_rock_milestones%ROWTYPE;
  dm public.eos_rock_milestones%ROWTYPE;
BEGIN
  SELECT * INTO co FROM public.eos_rock_carryovers WHERE id = NEW.carryover_id;
  IF co.id IS NULL OR co.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'The carryover must be in the same tenant';
  END IF;
  IF NEW.source_milestone_id IS NOT NULL THEN
    SELECT * INTO sm FROM public.eos_rock_milestones WHERE id = NEW.source_milestone_id;
    IF sm.rock_id IS DISTINCT FROM co.source_rock_id THEN
      RAISE EXCEPTION 'The carried milestone must belong to the source Rock';
    END IF;
    IF sm.status = 'complete' THEN
      RAISE EXCEPTION 'Completed milestones are not carried forward';
    END IF;
  END IF;
  IF NEW.destination_milestone_id IS NOT NULL THEN
    SELECT * INTO dm FROM public.eos_rock_milestones WHERE id = NEW.destination_milestone_id;
    IF dm.rock_id IS DISTINCT FROM co.destination_rock_id THEN
      RAISE EXCEPTION 'The destination milestone must belong to the destination Rock';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_carryover_milestone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_eos_rock_carryover_milestone ON public.eos_rock_carryover_milestones;
CREATE TRIGGER trg_validate_eos_rock_carryover_milestone
  BEFORE INSERT ON public.eos_rock_carryover_milestones
  FOR EACH ROW EXECUTE FUNCTION public.validate_eos_rock_carryover_milestone();

-- 4. carry_forward_rock -------------------------------------------------------------
-- p_destination: {"rock_id": "<uuid>"} to reuse a Rock, or {"create": {title?, description?, owner_id?,
--   due_date, quarter_year, quarter_number, parent_rock_id?}} to make one.
-- p_milestones:  [{"source_milestone_id": "<uuid>", "new_due_date": "YYYY-MM-DD"?,
--   "destination_milestone_id": "<uuid>"?}]  (a missing destination milestone is created)
CREATE OR REPLACE FUNCTION public.carry_forward_rock(
  p_source_rock_id uuid, p_destination jsonb, p_milestones jsonb, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  src public.eos_rocks%ROWTYPE;
  dst_id uuid;
  dst public.eos_rocks%ROWTYPE;
  co_id uuid;
  v_reason text;
  item jsonb;
  sm public.eos_rock_milestones%ROWTYPE;
  dm_id uuid;
  v_new_due date;
  v_create jsonb;
  v_parent uuid;
  v_payload jsonb;
  v_status text;
  v_sort integer;
  v_added integer := 0;
  v_result jsonb;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Say why this is being carried forward';
  END IF;
  IF p_milestones IS NOT NULL AND jsonb_typeof(p_milestones) <> 'array' THEN
    RAISE EXCEPTION 'milestones must be a list';
  END IF;

  SELECT * INTO src FROM public.eos_rocks WHERE id = p_source_rock_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source Rock not found';
  END IF;
  IF src.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'An archived Rock cannot be carried forward';
  END IF;
  IF src.status = 'complete' THEN
    RAISE EXCEPTION 'A completed Rock has nothing to carry forward';
  END IF;

  dst_id := NULLIF(p_destination->>'rock_id', '')::uuid;
  v_create := p_destination->'create';
  IF (dst_id IS NULL) = (v_create IS NULL) THEN
    RAISE EXCEPTION 'Choose an existing destination Rock or describe a new one, not both';
  END IF;

  IF dst_id IS NULL THEN
    v_parent := NULLIF(v_create->>'parent_rock_id', '')::uuid;
    IF v_parent IS NULL AND src.parent_rock_id IS NOT NULL THEN
      SELECT c.destination_rock_id INTO v_parent FROM public.eos_rock_carryovers c
      WHERE c.source_rock_id = src.parent_rock_id ORDER BY c.carried_at DESC LIMIT 1;
    END IF;
    v_payload := jsonb_build_object(
      'title', COALESCE(NULLIF(btrim(v_create->>'title'), ''), src.title),
      'description', COALESCE(v_create->>'description', src.description),
      'issue', src.issue,
      'outcome', src.outcome,
      'rock_level', src.rock_level,
      'function_id', src.function_id,
      'owner_id', COALESCE(NULLIF(v_create->>'owner_id', '')::uuid, src.owner_id),
      'parent_rock_id', v_parent,
      'client_tenant_id', src.client_tenant_id,
      'rock_type', src.rock_type,
      'quarter_year', (v_create->>'quarter_year')::integer,
      'quarter_number', (v_create->>'quarter_number')::integer,
      'due_date', v_create->>'due_date',
      'tenant_id', src.tenant_id
    );
    dst_id := (public.upsert_rock_with_parenting(v_payload)->>'id')::uuid;
  END IF;

  SELECT * INTO dst FROM public.eos_rocks WHERE id = dst_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination Rock not found';
  END IF;

  SELECT id INTO co_id FROM public.eos_rock_carryovers WHERE source_rock_id = src.id AND destination_rock_id = dst.id;
  IF co_id IS NULL THEN
    INSERT INTO public.eos_rock_carryovers (tenant_id, source_rock_id, destination_rock_id, reason, carried_by)
    VALUES (src.tenant_id, src.id, dst.id, v_reason, auth.uid())
    RETURNING id INTO co_id;
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) INTO v_sort FROM public.eos_rock_milestones WHERE rock_id = dst.id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_milestones, '[]'::jsonb)) LOOP
    SELECT * INTO sm FROM public.eos_rock_milestones
    WHERE id = (item->>'source_milestone_id')::uuid FOR UPDATE;
    IF NOT FOUND OR sm.rock_id <> src.id THEN
      RAISE EXCEPTION 'A selected milestone does not belong to the source Rock';
    END IF;
    IF sm.status = 'complete' THEN
      RAISE EXCEPTION 'Completed milestones are not carried forward';
    END IF;
    IF EXISTS (SELECT 1 FROM public.eos_rock_carryover_milestones WHERE source_milestone_id = sm.id) THEN
      RAISE EXCEPTION 'The milestone "%" has already been carried forward', sm.title;
    END IF;

    v_new_due := COALESCE(NULLIF(item->>'new_due_date', '')::date, dst.due_date);
    dm_id := NULLIF(item->>'destination_milestone_id', '')::uuid;
    IF dm_id IS NULL THEN
      v_status := CASE WHEN sm.status = 'in_progress' THEN 'in_progress' ELSE 'not_started' END;
      v_sort := v_sort + 1;
      INSERT INTO public.eos_rock_milestones (
        tenant_id, rock_id, title, owner_id, due_date, priority, status, exit_criteria, sort_order, created_by
      ) VALUES (
        sm.tenant_id, dst.id, sm.title, sm.owner_id, v_new_due, sm.priority, v_status, sm.exit_criteria, v_sort, auth.uid()
      ) RETURNING id INTO dm_id;
    END IF;

    INSERT INTO public.eos_rock_carryover_milestones (
      tenant_id, carryover_id, source_milestone_id, destination_milestone_id,
      source_title, source_status, source_due_date, new_due_date
    ) VALUES (
      sm.tenant_id, co_id, sm.id, dm_id, sm.title, sm.status, sm.due_date, v_new_due
    );
    v_added := v_added + 1;
  END LOOP;

  -- Keep the Company to Individual milestone mapping in the destination quarter.
  INSERT INTO public.eos_rock_milestone_links (tenant_id, company_milestone_id, individual_milestone_id, created_by)
  SELECT l.tenant_id, cc.destination_milestone_id, ci.destination_milestone_id, auth.uid()
  FROM public.eos_rock_milestone_links l
  JOIN public.eos_rock_carryover_milestones cc ON cc.source_milestone_id = l.company_milestone_id
  JOIN public.eos_rock_carryover_milestones ci ON ci.source_milestone_id = l.individual_milestone_id
  WHERE l.tenant_id = src.tenant_id AND cc.destination_milestone_id IS NOT NULL AND ci.destination_milestone_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  v_result := jsonb_build_object(
    'carryover_id', co_id, 'source_rock_id', src.id, 'destination_rock_id', dst.id, 'milestones_carried', v_added
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.carry_forward_rock(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carry_forward_rock(uuid, jsonb, jsonb, text) TO authenticated;

-- 5. A Rock in a carryover is history: it is archived, not deleted ------------------

CREATE OR REPLACE FUNCTION public.rock_delete_blockers(p_rock_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT array_remove(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id)
      THEN 'children' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_issues i WHERE i.linked_rock_id = p_rock_id)
      THEN 'linked_issues' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_milestones m
                      WHERE m.rock_id = p_rock_id AND (m.status <> 'not_started' OR m.evidence_url IS NOT NULL))
      THEN 'milestone_progress' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_milestone_task_links t
                      JOIN public.eos_rock_milestones m ON m.id = t.milestone_id
                      WHERE m.rock_id = p_rock_id)
      THEN 'task_links' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_milestone_links l
                      JOIN public.eos_rock_milestones m ON m.id IN (l.company_milestone_id, l.individual_milestone_id)
                      WHERE m.rock_id = p_rock_id)
      THEN 'milestone_links' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.rock_outcomes o WHERE o.rock_id = p_rock_id)
      THEN 'outcomes' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_carryovers c
                      WHERE c.source_rock_id = p_rock_id OR c.destination_rock_id = p_rock_id)
      THEN 'carryover' END
  ]::text[], NULL);
$function$;

REVOKE ALL ON FUNCTION public.rock_delete_blockers(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
