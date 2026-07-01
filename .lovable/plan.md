
## Phase SE — staff_task_instances invariant enforcement

Pre-flight (already run against live DB — all zero):

- Non-canonical `status` values: **0**
- Rows where (`status_id`, `status`) does not resolve to a single `dd_status` row with `code < 100`: **0**
- Rows with null `status` or null `status_id`: **0**

`dd_status` reference (`code < 100`) — the resolution table used by the trigger:

```text
0 → not_started
1 → in_progress
2 → completed
3 → na
4 → core_complete
5 → blocked
6 → monitor
7 → closed
```

Note the CHECK constraint permits only 6 of these 8 values (`blocked` and `closed` intentionally excluded per spec). If a future writer needs `blocked` or `closed`, the CHECK will need widening — flagging so we don't rediscover this the hard way.

### Design decision — INSERT vs UPDATE branching

The user's spec ("if only X supplied") is not directly observable in a BEFORE trigger — `NEW` always has both fields populated (either explicitly, via defaults, or carried over on UPDATE). The trigger interprets intent as follows:

- **INSERT**: column defaults (`'not_started'` / `0`) guarantee both fields are populated. Always run agreement check.
- **UPDATE**: compare `NEW` vs `OLD` to detect which field the caller actually changed.
  - Only `status` changed → resolve `status_id` from `dd_status`.
  - Only `status_id` changed → resolve `status` from `dd_status`.
  - Both changed → agreement check.
  - Neither changed → no-op (trigger still fires because it's listed on both columns, but nothing to do).

All resolution failures raise `SQLSTATE 23514` (check_violation) with a clear message naming the offending value.

### Migration SQL

```sql
-- Phase SE: staff_task_instances invariant enforcement.
-- Pre-flight verified: 0 non-canonical, 0 mismatched, 0 null rows.

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.trg_staff_task_status_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected_status    text;
  v_expected_status_id smallint;
  v_status_changed     boolean;
  v_status_id_changed  boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status_changed    := true;
    v_status_id_changed := true;
  ELSE
    v_status_changed    := NEW.status    IS DISTINCT FROM OLD.status;
    v_status_id_changed := NEW.status_id IS DISTINCT FROM OLD.status_id;
  END IF;

  -- UPDATE: only status changed → resolve status_id from dd_status.
  IF TG_OP = 'UPDATE' AND v_status_changed AND NOT v_status_id_changed THEN
    SELECT ds.code INTO v_expected_status_id
      FROM public.dd_status ds
     WHERE ds.value = NEW.status AND ds.code < 100
     LIMIT 1;
    IF v_expected_status_id IS NULL THEN
      RAISE EXCEPTION
        'staff_task_instances: unknown status %L — no dd_status row with code < 100',
        NEW.status USING ERRCODE = '23514';
    END IF;
    NEW.status_id := v_expected_status_id;
    RETURN NEW;
  END IF;

  -- UPDATE: only status_id changed → resolve status from dd_status.
  IF TG_OP = 'UPDATE' AND v_status_id_changed AND NOT v_status_changed THEN
    SELECT ds.value INTO v_expected_status
      FROM public.dd_status ds
     WHERE ds.code = NEW.status_id AND ds.code < 100
     LIMIT 1;
    IF v_expected_status IS NULL THEN
      RAISE EXCEPTION
        'staff_task_instances: unknown status_id % — no dd_status row with code < 100',
        NEW.status_id USING ERRCODE = '23514';
    END IF;
    NEW.status := v_expected_status;
    RETURN NEW;
  END IF;

  -- INSERT, or UPDATE where both changed / neither changed → agreement check.
  SELECT ds.value, ds.code
    INTO v_expected_status, v_expected_status_id
    FROM public.dd_status ds
   WHERE ds.code = NEW.status_id
     AND ds.value = NEW.status
     AND ds.code < 100
   LIMIT 1;

  IF v_expected_status IS NULL THEN
    RAISE EXCEPTION
      'staff_task_instances: (status_id=%, status=%L) does not resolve to a single dd_status row with code < 100',
      NEW.status_id, NEW.status USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_staff_task_status_normalize() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_staff_task_status_normalize() TO authenticated, service_role;

-- 2. Trigger
DROP TRIGGER IF EXISTS trg_staff_task_status_normalize ON public.staff_task_instances;
CREATE TRIGGER trg_staff_task_status_normalize
  BEFORE INSERT OR UPDATE OF status, status_id
  ON public.staff_task_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_staff_task_status_normalize();

-- 3. CHECK constraint — add NOT VALID then VALIDATE for lock minimisation.
ALTER TABLE public.staff_task_instances
  ADD CONSTRAINT chk_staff_task_instances_status_valid
  CHECK (status IN ('not_started','in_progress','completed','na','core_complete','monitor'))
  NOT VALID;

ALTER TABLE public.staff_task_instances
  VALIDATE CONSTRAINT chk_staff_task_instances_status_valid;

NOTIFY pgrst, 'reload schema';
```

### Rollback (kept alongside plan for reference)

```sql
ALTER TABLE public.staff_task_instances DROP CONSTRAINT chk_staff_task_instances_status_valid;
DROP TRIGGER trg_staff_task_status_normalize ON public.staff_task_instances;
DROP FUNCTION public.trg_staff_task_status_normalize();
NOTIFY pgrst, 'reload schema';
```

### Risks

1. **Existing trigger `trg_update_event_conducted_date`** fires on `status_id` change. The new normalize trigger runs BEFORE and may set `status_id` from `status` — this actually improves consistency (writes that only touch `status` will now also propagate `status_id`, so the event trigger fires correctly). Low risk, net positive.
2. **`blocked` / `closed` excluded from CHECK**: any writer attempting those values will fail with `23514`. Current data has zero such rows, and known writers only use the 6 permitted values. If a future feature needs them, widen the CHECK.
3. **SECURITY DEFINER trigger**: only reads `public.dd_status`; no privilege escalation surface.
4. **Performance**: one indexed lookup on `dd_status` per row-write on `staff_task_instances`. `dd_status` is a small lookup table; negligible impact.

### Post-migration verification

```sql
-- Should succeed (agreement).
INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
VALUES (<real_id>, <real_id>, 1, 'in_progress');

-- Should raise 23514 (disagreement).
-- ... status_id=2, status='in_progress' ...

-- Should raise 23514 (CHECK — blocked not permitted).
-- ... status_id=5, status='blocked' ...

-- Should auto-resolve status_id.
UPDATE public.staff_task_instances SET status = 'completed' WHERE id = <test_id>;
-- Then confirm status_id = 2.
```
