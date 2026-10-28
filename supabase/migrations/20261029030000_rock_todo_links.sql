-- Link a To-Do to a Rock, or to one of its milestones, from either side.
--
-- Until now a milestone's Tasks box only held snapshots of GitHub issues, so a Rock whose work
-- is not tracked in GitHub had nothing to show, and a standalone To-Do could not say which Rock
-- it was for. A To-Do is the app's own task (owner, due date, open or complete), so it can now
-- point at a Rock (or one of its milestones), live, with no sync. Both directions read the same
-- link: the Rock shows its To-Dos, and a To-Do shows its Rock.
--
-- 1. eos_rock_todo_links: one link per To-Do at most (a To-Do is for one thing), to a Rock and
--    optionally one of that Rock's milestones. Select only for clients; written only through
--    the three functions below (staff only). Deleting a Rock, milestone or To-Do removes the
--    link, never the other side: a To-Do whose Rock is deleted simply becomes standalone.
-- 2. add_rock_todo(): creates a To-Do and links it in one step (the To-Do lands in the meeting's
--    tenant when made inside a meeting, as other To-Dos do).
-- 3. link_todo_to_rock() / unlink_todo_from_rock(): link an existing (including standalone)
--    To-Do, moving it if it was linked elsewhere, or remove the link. Unlinking never changes
--    or deletes the To-Do.
--
-- Additive; no existing row is changed.
-- Rollback: rollback/20261029030000_rock_todo_links.down.sql

-- 1. Links ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eos_rock_todo_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  todo_id uuid NOT NULL UNIQUE REFERENCES public.eos_todos(id) ON DELETE CASCADE,
  rock_id uuid NOT NULL REFERENCES public.eos_rocks(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.eos_rock_milestones(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES auth.users(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_todo_links_rock ON public.eos_rock_todo_links (rock_id);
CREATE INDEX IF NOT EXISTS idx_eos_rock_todo_links_milestone ON public.eos_rock_todo_links (milestone_id) WHERE milestone_id IS NOT NULL;

ALTER TABLE public.eos_rock_todo_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_todo_links_select ON public.eos_rock_todo_links;
CREATE POLICY eos_rock_todo_links_select ON public.eos_rock_todo_links
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_todo_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_todo_links TO authenticated;

-- Keeps the link inside one Rock: the milestone must belong to the Rock, and the link carries the
-- Rock's tenant. The functions below already check this; the trigger holds it for any other writer.
CREATE OR REPLACE FUNCTION public.validate_eos_rock_todo_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rock_tenant bigint;
  v_milestone_rock uuid;
BEGIN
  SELECT tenant_id INTO v_rock_tenant FROM public.eos_rocks WHERE id = NEW.rock_id;
  IF v_rock_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'The link must carry the Rock''s tenant';
  END IF;
  IF NEW.milestone_id IS NOT NULL THEN
    SELECT rock_id INTO v_milestone_rock FROM public.eos_rock_milestones WHERE id = NEW.milestone_id;
    IF v_milestone_rock IS DISTINCT FROM NEW.rock_id THEN
      RAISE EXCEPTION 'The milestone must belong to the Rock';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_todo_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_eos_rock_todo_link ON public.eos_rock_todo_links;
CREATE TRIGGER trg_validate_eos_rock_todo_link
  BEFORE INSERT OR UPDATE ON public.eos_rock_todo_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_eos_rock_todo_link();

-- 2. Create a To-Do for a Rock or milestone -------------------------------------------

CREATE OR REPLACE FUNCTION public.add_rock_todo(
  p_rock_id uuid,
  p_title text,
  p_milestone_id uuid DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant bigint;
  v_rock_title text;
  v_archived timestamptz;
  v_milestone_title text;
  v_title text;
  v_owner uuid;
  v_todo_tenant bigint;
  v_todo_id uuid;
  v_link_id uuid;
  v_existing public.eos_rock_todo_links%ROWTYPE;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  v_title := btrim(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'A To-Do needs a title';
  END IF;
  IF length(v_title) > 300 THEN
    RAISE EXCEPTION 'A To-Do title can be at most 300 characters';
  END IF;

  SELECT tenant_id, title, archived_at INTO v_tenant, v_rock_title, v_archived
  FROM public.eos_rocks WHERE id = p_rock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'An archived Rock cannot take new To-Dos';
  END IF;

  IF p_milestone_id IS NOT NULL THEN
    SELECT title INTO v_milestone_title FROM public.eos_rock_milestones WHERE id = p_milestone_id AND rock_id = p_rock_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The milestone must belong to the Rock';
    END IF;
  END IF;

  v_owner := COALESCE(p_owner_id, auth.uid());
  IF NOT public.is_vivacity_team_safe(v_owner) THEN
    RAISE EXCEPTION 'A To-Do must be owned by an active team member';
  END IF;

  -- A To-Do made inside a meeting belongs to that meeting's tenant, as the meeting's own To-Dos do.
  v_todo_tenant := v_tenant;
  IF p_meeting_id IS NOT NULL THEN
    SELECT tenant_id INTO v_todo_tenant FROM public.eos_meetings WHERE id = p_meeting_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Meeting not found';
    END IF;
  END IF;

  -- The same title added for the same target by the same person within 30 seconds (a double click,
  -- a retry) returns the first.
  SELECT l.* INTO v_existing
  FROM public.eos_rock_todo_links l JOIN public.eos_todos t ON t.id = l.todo_id
  WHERE l.rock_id = p_rock_id AND l.milestone_id IS NOT DISTINCT FROM p_milestone_id
    AND l.linked_by = auth.uid() AND t.title = v_title AND l.linked_at > now() - interval '30 seconds'
  ORDER BY l.linked_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('todo_id', v_existing.todo_id, 'link_id', v_existing.id, 'duplicate', true);
  END IF;

  INSERT INTO public.eos_todos (tenant_id, title, description, owner_id, created_by, meeting_id, due_date, status)
  VALUES (
    v_todo_tenant, v_title,
    CASE WHEN v_milestone_title IS NULL
      THEN 'From the Rock "' || v_rock_title || '".'
      ELSE 'From the milestone "' || v_milestone_title || '" of the Rock "' || v_rock_title || '".' END,
    v_owner, auth.uid(), p_meeting_id, COALESCE(p_due_date, current_date + 7), 'Open'
  )
  RETURNING id INTO v_todo_id;

  INSERT INTO public.eos_rock_todo_links (tenant_id, todo_id, rock_id, milestone_id, linked_by)
  VALUES (v_tenant, v_todo_id, p_rock_id, p_milestone_id, auth.uid())
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object('todo_id', v_todo_id, 'link_id', v_link_id, 'duplicate', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_rock_todo(uuid, text, uuid, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_rock_todo(uuid, text, uuid, date, uuid, uuid) TO authenticated;

-- 3. Link an existing To-Do (moving it if needed), or remove its link ------------------

CREATE OR REPLACE FUNCTION public.link_todo_to_rock(p_todo_id uuid, p_rock_id uuid, p_milestone_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant bigint;
  v_archived timestamptz;
  v_link_id uuid;
  v_existed boolean;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT tenant_id, archived_at INTO v_tenant, v_archived FROM public.eos_rocks WHERE id = p_rock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'An archived Rock cannot take new To-Dos';
  END IF;
  IF p_milestone_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.eos_rock_milestones WHERE id = p_milestone_id AND rock_id = p_rock_id) THEN
    RAISE EXCEPTION 'The milestone must belong to the Rock';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.eos_todos WHERE id = p_todo_id) THEN
    RAISE EXCEPTION 'To-Do not found';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.eos_rock_todo_links WHERE todo_id = p_todo_id) INTO v_existed;

  INSERT INTO public.eos_rock_todo_links (tenant_id, todo_id, rock_id, milestone_id, linked_by)
  VALUES (v_tenant, p_todo_id, p_rock_id, p_milestone_id, auth.uid())
  ON CONFLICT (todo_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id, rock_id = EXCLUDED.rock_id, milestone_id = EXCLUDED.milestone_id,
        linked_by = EXCLUDED.linked_by, linked_at = now()
  RETURNING id INTO v_link_id;

  RETURN jsonb_build_object('link_id', v_link_id, 'moved', v_existed);
END;
$function$;

REVOKE ALL ON FUNCTION public.link_todo_to_rock(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_todo_to_rock(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlink_todo_from_rock(p_todo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;
  -- Only the link goes. The To-Do itself is never changed or deleted here.
  DELETE FROM public.eos_rock_todo_links WHERE todo_id = p_todo_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  RETURN jsonb_build_object('unlinked', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.unlink_todo_from_rock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_todo_from_rock(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
