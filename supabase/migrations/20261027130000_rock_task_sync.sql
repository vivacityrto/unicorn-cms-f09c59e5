-- Rock milestone <-> GitHub task sync.
--
-- GitHub [task] issues (ComplyHub-ai/rto-compass-hub) link to a Unicorn
-- milestone by UUID. The rock-task-sync Edge Function verifies a signed event
-- and calls apply_rock_task_sync_event(), which records the link and applies
-- the sync policy to the milestone in one transaction:
--
--   * A started task (in progress / review) or any closed task moves a
--     not_started milestone to in_progress.
--   * An open blocked task moves a not_started / in_progress milestone to
--     blocked. A block the sync set is released when no blocked task remains
--     and nobody has edited the milestone since; a human's block is never
--     released by the sync.
--   * The sync never touches complete, deferred or off_track milestones and
--     never completes anything. "Ready for review" (every linked task closed)
--     is derived from the links, not stored; a person marks the milestone
--     complete in Unicorn.
--
-- Additive: no existing table, policy or function is changed.

CREATE TABLE IF NOT EXISTS public.eos_rock_milestone_task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  milestone_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('github')),
  external_key text NOT NULL,
  external_url text NOT NULL CHECK (external_url ~* '^https://'),
  title text NOT NULL,
  task_state text NOT NULL CHECK (task_state IN ('open', 'closed')),
  task_status text NOT NULL
    CHECK (task_status IN ('backlog', 'ready', 'in progress', 'blocked', 'review', 'completed')),
  priority text,
  due_date date,
  assignees text[] NOT NULL DEFAULT '{}',
  source_updated_at timestamptz NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_rock_milestone_task_links_milestone_fk
    FOREIGN KEY (milestone_id, tenant_id)
    REFERENCES public.eos_rock_milestones(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT eos_rock_milestone_task_links_external_key UNIQUE (provider, external_key)
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_milestone_task_links_milestone
  ON public.eos_rock_milestone_task_links (milestone_id);

CREATE TABLE IF NOT EXISTS public.eos_task_sync_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  external_key text NOT NULL,
  milestone_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('applied', 'stale', 'rejected')),
  status_before text,
  status_after text,
  milestone_updated_at timestamptz,
  detail jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eos_task_sync_events_milestone_status
  ON public.eos_task_sync_events (milestone_id, received_at DESC)
  WHERE status_after IS NOT NULL;

ALTER TABLE public.eos_rock_milestone_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_task_sync_events ENABLE ROW LEVEL SECURITY;

-- Links are readable like the milestones they hang off, and written only by the
-- service-role sync function. The delivery log is service-role only.
REVOKE ALL ON public.eos_rock_milestone_task_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_milestone_task_links TO authenticated;
REVOKE ALL ON public.eos_task_sync_events FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS eos_rock_milestone_task_links_select ON public.eos_rock_milestone_task_links;
CREATE POLICY eos_rock_milestone_task_links_select ON public.eos_rock_milestone_task_links
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

CREATE OR REPLACE FUNCTION public.recompute_rock_milestone_from_tasks(p_milestone_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_m public.eos_rock_milestones%ROWTYPE;
  v_last public.eos_task_sync_events%ROWTYPE;
  v_total integer;
  v_open integer;
  v_blocked integer;
  v_started integer;
  v_closed integer;
  v_new text;
  v_updated timestamptz;
BEGIN
  SELECT * INTO v_m FROM public.eos_rock_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('changed', false, 'reason', 'milestone_missing');
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE task_state = 'open'),
         count(*) FILTER (WHERE task_state = 'open' AND task_status = 'blocked'),
         count(*) FILTER (WHERE task_state = 'open' AND task_status IN ('in progress', 'review')),
         count(*) FILTER (WHERE task_state = 'closed')
    INTO v_total, v_open, v_blocked, v_started, v_closed
  FROM public.eos_rock_milestone_task_links
  WHERE milestone_id = p_milestone_id;

  IF v_total = 0 OR v_m.status IN ('complete', 'deferred', 'off_track') THEN
    RETURN jsonb_build_object('changed', false, 'status', v_m.status, 'ready_for_review', false);
  END IF;

  v_new := v_m.status;
  IF v_blocked > 0 THEN
    IF v_m.status IN ('not_started', 'in_progress') THEN
      v_new := 'blocked';
    END IF;
  ELSIF v_m.status = 'blocked' THEN
    -- Only release a block this sync set and nobody has touched since.
    SELECT * INTO v_last
    FROM public.eos_task_sync_events
    WHERE milestone_id = p_milestone_id AND status_after = 'blocked'
    ORDER BY received_at DESC
    LIMIT 1;
    IF FOUND AND v_last.milestone_updated_at IS NOT DISTINCT FROM v_m.updated_at THEN
      v_new := CASE
        WHEN v_started + v_closed > 0 THEN 'in_progress'
        ELSE COALESCE(v_last.status_before, 'not_started')
      END;
    END IF;
  ELSIF v_m.status = 'not_started' AND v_started + v_closed > 0 THEN
    v_new := 'in_progress';
  END IF;

  IF v_new IS DISTINCT FROM v_m.status THEN
    UPDATE public.eos_rock_milestones
    SET status = v_new
    WHERE id = p_milestone_id
    RETURNING updated_at INTO v_updated;
    RETURN jsonb_build_object(
      'changed', true,
      'status_before', v_m.status,
      'status', v_new,
      'milestone_updated_at', v_updated,
      'ready_for_review', v_open = 0
    );
  END IF;

  RETURN jsonb_build_object('changed', false, 'status', v_m.status, 'ready_for_review', v_open = 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_rock_milestone_from_tasks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_rock_milestone_from_tasks(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_rock_task_sync_event(p_event jsonb, p_expected_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id text := p_event->>'event_id';
  v_provider text := COALESCE(p_event->>'provider', 'github');
  v_key text := p_event->>'external_key';
  v_milestone_id uuid;
  v_rev timestamptz;
  v_due date;
  v_assignees text[];
  v_prior public.eos_task_sync_events%ROWTYPE;
  v_m public.eos_rock_milestones%ROWTYPE;
  v_old_link public.eos_rock_milestone_task_links%ROWTYPE;
  v_result jsonb;
  v_old_result jsonb := NULL;
BEGIN
  IF v_event_id IS NULL OR v_key IS NULL OR p_event->>'milestone_id' IS NULL
     OR p_event->>'source_updated_at' IS NULL OR p_event->>'external_url' IS NULL
     OR p_event->>'title' IS NULL OR p_event->>'task_state' IS NULL
     OR p_event->>'task_status' IS NULL THEN
    RAISE EXCEPTION 'Invalid task sync event';
  END IF;

  v_milestone_id := (p_event->>'milestone_id')::uuid;
  v_rev := (p_event->>'source_updated_at')::timestamptz;
  v_due := NULLIF(p_event->>'due_date', '')::date;
  SELECT COALESCE(array_agg(value), '{}')
    INTO v_assignees
  FROM jsonb_array_elements_text(COALESCE(p_event->'assignees', '[]'::jsonb));

  SELECT * INTO v_prior FROM public.eos_task_sync_events WHERE event_id = v_event_id;
  IF FOUND AND v_prior.outcome IN ('applied', 'stale') THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;

  SELECT * INTO v_m
  FROM public.eos_rock_milestones
  WHERE id = v_milestone_id AND tenant_id = p_expected_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.eos_task_sync_events (event_id, provider, external_key, milestone_id, outcome, detail)
    VALUES (v_event_id, v_provider, v_key, v_milestone_id, 'rejected',
            jsonb_build_object('reason', 'unknown_milestone'))
    ON CONFLICT (event_id) DO UPDATE
      SET outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, received_at = now();
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'unknown_milestone');
  END IF;

  SELECT * INTO v_old_link
  FROM public.eos_rock_milestone_task_links
  WHERE provider = v_provider AND external_key = v_key
  FOR UPDATE;
  IF FOUND AND v_old_link.source_updated_at > v_rev THEN
    INSERT INTO public.eos_task_sync_events (event_id, provider, external_key, milestone_id, outcome, detail)
    VALUES (v_event_id, v_provider, v_key, v_milestone_id, 'stale',
            jsonb_build_object('stored_revision', v_old_link.source_updated_at))
    ON CONFLICT (event_id) DO NOTHING;
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;

  INSERT INTO public.eos_rock_milestone_task_links AS l (
    tenant_id, milestone_id, provider, external_key, external_url, title,
    task_state, task_status, priority, due_date, assignees, source_updated_at
  ) VALUES (
    v_m.tenant_id, v_milestone_id, v_provider, v_key, p_event->>'external_url', p_event->>'title',
    p_event->>'task_state', p_event->>'task_status', NULLIF(p_event->>'priority', ''), v_due,
    v_assignees, v_rev
  )
  ON CONFLICT (provider, external_key) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    milestone_id = EXCLUDED.milestone_id,
    external_url = EXCLUDED.external_url,
    title = EXCLUDED.title,
    task_state = EXCLUDED.task_state,
    task_status = EXCLUDED.task_status,
    priority = EXCLUDED.priority,
    due_date = EXCLUDED.due_date,
    assignees = EXCLUDED.assignees,
    source_updated_at = EXCLUDED.source_updated_at,
    last_synced_at = now()
  WHERE l.source_updated_at <= EXCLUDED.source_updated_at;

  v_result := public.recompute_rock_milestone_from_tasks(v_milestone_id);
  -- A task re-pointed at another milestone also changes the one it left.
  IF v_old_link.id IS NOT NULL AND v_old_link.milestone_id <> v_milestone_id THEN
    v_old_result := public.recompute_rock_milestone_from_tasks(v_old_link.milestone_id);
  END IF;

  INSERT INTO public.eos_task_sync_events (
    event_id, provider, external_key, milestone_id, outcome,
    status_before, status_after, milestone_updated_at, detail
  ) VALUES (
    v_event_id, v_provider, v_key, v_milestone_id, 'applied',
    v_result->>'status_before',
    CASE WHEN (v_result->>'changed')::boolean THEN v_result->>'status' END,
    (v_result->>'milestone_updated_at')::timestamptz,
    jsonb_build_object('result', v_result, 'previous_milestone_result', v_old_result)
  )
  ON CONFLICT (event_id) DO UPDATE SET
    outcome = EXCLUDED.outcome,
    milestone_id = EXCLUDED.milestone_id,
    status_before = EXCLUDED.status_before,
    status_after = EXCLUDED.status_after,
    milestone_updated_at = EXCLUDED.milestone_updated_at,
    detail = EXCLUDED.detail,
    received_at = now();

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'milestone_id', v_milestone_id,
    'status_changed', COALESCE((v_result->>'changed')::boolean, false),
    'status', v_result->>'status',
    'ready_for_review', COALESCE((v_result->>'ready_for_review')::boolean, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_rock_task_sync_event(jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rock_task_sync_event(jsonb, bigint) TO service_role;
