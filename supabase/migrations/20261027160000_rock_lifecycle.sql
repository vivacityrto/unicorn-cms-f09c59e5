-- Rock editor, stage 3: a safe lifecycle for Rocks (archive, restore, delete)
-- and a change history.
--
-- 1. eos_rock_events + trigger: who changed a Rock's title, status, owner, due
--    date, parent, level, team, quarter, client or priority, or archived,
--    restored or deleted it. Append-only; readable by the same people who can
--    read the Rock. The history has no foreign key, so it outlives a deleted Rock.
-- 2. created_by is set on every insert path (the app-level RPC already did).
-- 3. rock_delete_blockers() is the single definition of "this Rock holds
--    something worth keeping": child Rocks, linked issues, milestone progress or
--    evidence, linked tasks, Company-milestone links, recorded outcomes. A BEFORE
--    DELETE trigger refuses to delete such a Rock, so the rule holds for every
--    caller, not just the screen. Such a Rock is archived instead.
-- 4. rock_impact() reports what archiving or deleting would touch, for the
--    confirmation screen.
-- 5. archive_rock() and restore_rock() change archived_at atomically. Archiving
--    can include the Rocks that serve it (all stamped with one timestamp, so a
--    restore can bring back exactly that set); restoring refuses an archived
--    parent unless asked to restore it too.
--
-- Additive: no existing row is changed. Rollback: rollback/20261027160000_*.down.sql.

CREATE TABLE IF NOT EXISTS public.eos_rock_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  rock_id uuid NOT NULL,
  rock_title text,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'archived', 'restored', 'deleted')),
  actor_user_id uuid,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_events_rock
  ON public.eos_rock_events (rock_id, occurred_at DESC);

ALTER TABLE public.eos_rock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_events_select ON public.eos_rock_events;
CREATE POLICY eos_rock_events_select ON public.eos_rock_events
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_events TO authenticated;

CREATE OR REPLACE FUNCTION public.record_eos_rock_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  tracked text[] := ARRAY['title', 'status', 'owner_id', 'due_date', 'parent_rock_id', 'rock_level',
                          'function_id', 'quarter_year', 'quarter_number', 'client_tenant_id',
                          'priority', 'archived_at'];
  col text;
  old_j jsonb;
  new_j jsonb;
  before_d jsonb := '{}'::jsonb;
  after_d jsonb := '{}'::jsonb;
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_j := to_jsonb(NEW);
    SELECT jsonb_object_agg(k, new_j -> k) INTO after_d FROM unnest(tracked) AS k;
    INSERT INTO public.eos_rock_events (tenant_id, rock_id, rock_title, action, actor_user_id, before_data, after_data)
    VALUES (NEW.tenant_id, NEW.id, NEW.title, 'created', auth.uid(), NULL, after_d);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    old_j := to_jsonb(OLD);
    new_j := to_jsonb(NEW);
    FOREACH col IN ARRAY tracked LOOP
      IF old_j -> col IS DISTINCT FROM new_j -> col THEN
        before_d := before_d || jsonb_build_object(col, old_j -> col);
        after_d := after_d || jsonb_build_object(col, new_j -> col);
      END IF;
    END LOOP;
    IF after_d = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    act := CASE
      WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'archived'
      WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'restored'
      ELSE 'updated'
    END;
    INSERT INTO public.eos_rock_events (tenant_id, rock_id, rock_title, action, actor_user_id, before_data, after_data)
    VALUES (NEW.tenant_id, NEW.id, NEW.title, act, auth.uid(), before_d, after_d);
    RETURN NEW;
  ELSE
    old_j := to_jsonb(OLD);
    SELECT jsonb_object_agg(k, old_j -> k) INTO before_d FROM unnest(tracked) AS k;
    INSERT INTO public.eos_rock_events (tenant_id, rock_id, rock_title, action, actor_user_id, before_data, after_data)
    VALUES (OLD.tenant_id, OLD.id, OLD.title, 'deleted', auth.uid(), before_d, NULL);
    RETURN OLD;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_eos_rock_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_eos_rock_event ON public.eos_rocks;
CREATE TRIGGER trg_record_eos_rock_event
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_rocks
  FOR EACH ROW EXECUTE FUNCTION public.record_eos_rock_event();

CREATE OR REPLACE FUNCTION public.set_eos_rock_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_eos_rock_created_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_eos_rock_created_by ON public.eos_rocks;
CREATE TRIGGER trg_set_eos_rock_created_by
  BEFORE INSERT ON public.eos_rocks
  FOR EACH ROW EXECUTE FUNCTION public.set_eos_rock_created_by();

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
      THEN 'outcomes' END
  ]::text[], NULL);
$function$;

REVOKE ALL ON FUNCTION public.rock_delete_blockers(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_eos_rock_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  blockers text[];
BEGIN
  blockers := public.rock_delete_blockers(OLD.id);
  IF COALESCE(array_length(blockers, 1), 0) > 0 THEN
    RAISE EXCEPTION 'This Rock cannot be deleted because it has child Rocks, linked issues or recorded progress. Archive it instead.'
      USING DETAIL = array_to_string(blockers, ',');
  END IF;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_eos_rock_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_eos_rock_delete ON public.eos_rocks;
CREATE TRIGGER trg_guard_eos_rock_delete
  BEFORE DELETE ON public.eos_rocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_eos_rock_delete();

CREATE OR REPLACE FUNCTION public.rock_impact(p_rock_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  r public.eos_rocks%ROWTYPE;
  parent_row public.eos_rocks%ROWTYPE;
  blockers text[];
  descendants_active integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO r FROM public.eos_rocks WHERE id = p_rock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rock not found';
  END IF;
  IF r.parent_rock_id IS NOT NULL THEN
    SELECT * INTO parent_row FROM public.eos_rocks WHERE id = r.parent_rock_id;
  END IF;

  blockers := public.rock_delete_blockers(p_rock_id);

  WITH RECURSIVE d AS (
    SELECT c.id FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id AND c.archived_at IS NULL
    UNION
    SELECT c.id FROM public.eos_rocks c JOIN d ON c.parent_rock_id = d.id WHERE c.archived_at IS NULL
  )
  SELECT count(*) INTO descendants_active FROM d;

  RETURN jsonb_build_object(
    'rock', jsonb_build_object(
      'id', r.id, 'title', r.title, 'level', r.rock_level, 'archived_at', r.archived_at,
      'quarter_year', r.quarter_year, 'quarter_number', r.quarter_number
    ),
    'parent', CASE WHEN parent_row.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', parent_row.id, 'title', parent_row.title, 'archived_at', parent_row.archived_at
    ) END,
    'children_active', (SELECT count(*) FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id AND c.archived_at IS NULL),
    'children_archived', (SELECT count(*) FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id AND c.archived_at IS NOT NULL),
    'descendants_active', descendants_active,
    'linked_issues', (SELECT count(*) FROM public.eos_issues i WHERE i.linked_rock_id = p_rock_id),
    'milestones', jsonb_build_object(
      'total', (SELECT count(*) FROM public.eos_rock_milestones m WHERE m.rock_id = p_rock_id),
      'started', (SELECT count(*) FROM public.eos_rock_milestones m WHERE m.rock_id = p_rock_id AND m.status <> 'not_started'),
      'complete', (SELECT count(*) FROM public.eos_rock_milestones m WHERE m.rock_id = p_rock_id AND m.status = 'complete'),
      'with_evidence', (SELECT count(*) FROM public.eos_rock_milestones m WHERE m.rock_id = p_rock_id AND m.evidence_url IS NOT NULL)
    ),
    'task_links', (SELECT count(*) FROM public.eos_rock_milestone_task_links t
                   JOIN public.eos_rock_milestones m ON m.id = t.milestone_id WHERE m.rock_id = p_rock_id),
    'milestone_links', (SELECT count(*) FROM public.eos_rock_milestone_links l
                        WHERE EXISTS (SELECT 1 FROM public.eos_rock_milestones m
                                      WHERE m.rock_id = p_rock_id AND m.id IN (l.company_milestone_id, l.individual_milestone_id))),
    'outcomes', (SELECT count(*) FROM public.rock_outcomes o WHERE o.rock_id = p_rock_id),
    'blockers', to_jsonb(COALESCE(blockers, ARRAY[]::text[])),
    'can_delete', COALESCE(array_length(blockers, 1), 0) = 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_rock(p_rock_id uuid, p_include_children boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  r public.eos_rocks%ROWTYPE;
  ts timestamptz := now();
  ids uuid[];
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO r FROM public.eos_rocks WHERE id = p_rock_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rock not found';
  END IF;
  IF r.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This Rock is already archived';
  END IF;

  ids := ARRAY[p_rock_id];
  IF p_include_children THEN
    ids := ids || ARRAY(
      WITH RECURSIVE d AS (
        SELECT c.id FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id AND c.archived_at IS NULL
        UNION
        SELECT c.id FROM public.eos_rocks c JOIN d ON c.parent_rock_id = d.id WHERE c.archived_at IS NULL
      )
      SELECT id FROM d
    );
  END IF;

  UPDATE public.eos_rocks SET archived_at = ts WHERE id = ANY(ids) AND archived_at IS NULL;

  RETURN jsonb_build_object('archived', to_jsonb(ids), 'archived_at', ts);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_rock(
  p_rock_id uuid,
  p_include_parents boolean DEFAULT false,
  p_include_children boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  r public.eos_rocks%ROWTYPE;
  ids uuid[];
  ancestors uuid[];
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO r FROM public.eos_rocks WHERE id = p_rock_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rock not found';
  END IF;
  IF r.archived_at IS NULL THEN
    RAISE EXCEPTION 'This Rock is not archived';
  END IF;

  ancestors := ARRAY(
    WITH RECURSIVE a AS (
      SELECT p.id, p.parent_rock_id, p.archived_at FROM public.eos_rocks p WHERE p.id = r.parent_rock_id
      UNION
      SELECT p.id, p.parent_rock_id, p.archived_at FROM public.eos_rocks p JOIN a ON p.id = a.parent_rock_id
    )
    SELECT id FROM a WHERE archived_at IS NOT NULL
  );
  IF COALESCE(array_length(ancestors, 1), 0) > 0 AND NOT p_include_parents THEN
    RAISE EXCEPTION 'Restore the Rock it serves first, because that one is archived';
  END IF;

  ids := ARRAY[p_rock_id] || ancestors;
  IF p_include_children THEN
    -- Only the Rocks archived together with this one (same timestamp), not ones archived earlier on their own.
    ids := ids || ARRAY(
      WITH RECURSIVE d AS (
        SELECT c.id FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id AND c.archived_at = r.archived_at
        UNION
        SELECT c.id FROM public.eos_rocks c JOIN d ON c.parent_rock_id = d.id WHERE c.archived_at = r.archived_at
      )
      SELECT id FROM d
    );
  END IF;

  UPDATE public.eos_rocks SET archived_at = NULL WHERE id = ANY(ids) AND archived_at IS NOT NULL;

  RETURN jsonb_build_object('restored', to_jsonb(ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.rock_impact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_rock(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_rock(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rock_impact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_rock(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_rock(uuid, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
