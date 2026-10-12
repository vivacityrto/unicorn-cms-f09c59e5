-- Link an EOS to-do to the IDS issue it was created from.
--
-- Until now nothing recorded which issue a to-do came from, so the IDS dialog could only
-- show the to-dos added in the current session and a to-do could not be found again from
-- its issue. Adds eos_todos.issue_id, has create_todos_from_issue() set it, and backfills
-- existing IDS to-dos from the audit trail.
--
-- eos_todos has table-level grants, so the new column is covered by the existing
-- authenticated / service_role grants and RLS policies; no new grant or policy is needed.

ALTER TABLE public.eos_todos
  ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES public.eos_issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eos_todos_issue_id ON public.eos_todos (issue_id) WHERE issue_id IS NOT NULL;

-- Same signature as before (so CREATE OR REPLACE replaces it rather than adding an overload);
-- the only change is that each created to-do records issue_id = p_issue_id.
CREATE OR REPLACE FUNCTION public.create_todos_from_issue(p_issue_id uuid, p_todos jsonb, p_meeting_id uuid DEFAULT NULL::uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_todo jsonb;
  v_created_ids uuid[] := '{}';
  v_new_id uuid;
  v_tenant_id integer;
  v_meeting_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Get tenant_id from the issue, falling back to Vivacity's internal
  -- tenant (6372) if the issue predates the tenant_id backfill above.
  SELECT COALESCE(tenant_id, 6372) INTO v_tenant_id
  FROM eos_issues WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  -- Use explicit meeting_id if provided, otherwise get from issue
  IF p_meeting_id IS NOT NULL THEN
    v_meeting_id := p_meeting_id;
  ELSE
    SELECT meeting_id INTO v_meeting_id FROM eos_issues WHERE id = p_issue_id;
  END IF;

  -- Create each to-do
  FOR v_todo IN SELECT * FROM jsonb_array_elements(p_todos)
  LOOP
    INSERT INTO eos_todos (
      tenant_id,
      meeting_id,
      issue_id,
      title,
      owner_id,
      assigned_to,
      due_date,
      status,
      created_by
    ) VALUES (
      v_tenant_id,
      v_meeting_id,
      p_issue_id,
      v_todo->>'title',
      (v_todo->>'owner_id')::uuid,
      (v_todo->>'owner_id')::uuid,
      (v_todo->>'due_date')::date,
      'Open',
      v_user_id
    )
    RETURNING id INTO v_new_id;

    v_created_ids := v_created_ids || v_new_id;
  END LOOP;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, entity, entity_id, action, user_id, details
  ) VALUES (
    v_tenant_id,
    'todo',
    p_issue_id,
    'bulk_create',
    v_user_id,
    jsonb_build_object(
      'count', array_length(v_created_ids, 1),
      'from_issue', p_issue_id,
      'meeting_id', v_meeting_id
    )
  );

  RETURN v_created_ids;
END;
$function$;

-- The completed-meeting guard (see 20261012020000) lets only status / completed_at /
-- due_date / updated_at through on a closed meeting's to-do. issue_id is link metadata, not
-- content, and it must be allowed: the ON DELETE SET NULL above rewrites it when an issue is
-- deleted, and the backfill below sets it on to-dos that mostly belong to closed meetings.
CREATE OR REPLACE FUNCTION public.protect_todos_in_completed_meeting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  -- Existing to-do: guard on the meeting it currently belongs to.
  IF OLD.meeting_id IS NOT NULL THEN
    SELECT status INTO v_status FROM eos_meetings WHERE id = OLD.meeting_id;
    IF v_status IN ('closed', 'completed') THEN
      IF TG_OP = 'UPDATE'
         AND (to_jsonb(NEW) - ARRAY['status', 'completed_at', 'updated_at', 'due_date', 'issue_id'])
           = (to_jsonb(OLD) - ARRAY['status', 'completed_at', 'updated_at', 'due_date', 'issue_id']) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Cannot modify data for completed meeting. Create a new item instead.';
    END IF;
  END IF;

  -- Moving a to-do into a completed meeting is still blocked.
  IF TG_OP = 'UPDATE' AND NEW.meeting_id IS DISTINCT FROM OLD.meeting_id AND NEW.meeting_id IS NOT NULL THEN
    SELECT status INTO v_status FROM eos_meetings WHERE id = NEW.meeting_id;
    IF v_status IN ('closed', 'completed') THEN
      RAISE EXCEPTION 'Cannot modify data for completed meeting. Create a new item instead.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Backfill: create_todos_from_issue() inserts its to-dos and its 'bulk_create' audit row in
-- one transaction, so they share created_at / created_by / tenant_id and the audit row's
-- entity_id is the issue. Match on those; only to-dos not already linked are touched.
UPDATE public.eos_todos t
SET issue_id = a.entity_id
FROM public.audit_eos_events a
WHERE a.entity = 'todo'
  AND a.action = 'bulk_create'
  AND a.created_at = t.created_at
  AND a.user_id = t.created_by
  AND a.tenant_id = t.tenant_id
  AND t.issue_id IS NULL
  AND EXISTS (SELECT 1 FROM public.eos_issues i WHERE i.id = a.entity_id);
