-- Phase 2 of the package-renewal-period work (see 20260820120000's comment:
-- "Option B without entry-level tagging, deferred Phase 2"). Tags each
-- time_entry_allocations row with the package_renewal_periods row it falls
-- into, so future reporting can slice usage by period at the entry level
-- instead of only via date-range filtering against time_entries.start_at.
--
-- Nullable, best-effort, non-blocking: only two functions ever write this
-- table (allocate_time_entry(), fn_reallocate_time_entry() - confirmed by
-- grepping every migration for INSERT/UPDATE on time_entry_allocations), no
-- direct frontend writes exist, so no NOT NULL/CHECK is being added here and
-- no other write path needs sweeping. See docs/audit-log entry for this
-- migration.
--
-- Boundary semantics match fn_package_used_minutes()/v_package_burndown():
-- period_start <= entry_date < period_end. Every package_renewal_periods row
-- (open or closed) has both bounds NOT NULL, so this is a single
-- deterministic lookup with no null-boundary special case.

-- ─── 1. New column + index ──────────────────────────────────────────────
ALTER TABLE public.time_entry_allocations
  ADD COLUMN IF NOT EXISTS renewal_period_id uuid NULL
    REFERENCES public.package_renewal_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tea_renewal_period
  ON public.time_entry_allocations (renewal_period_id);

-- ─── 2. Helper: resolve the period a given package_instance_id + date ───
-- falls into. Returns NULL (never raises) when no period row covers the
-- date - e.g. a gap before the first period, or a package instance that
-- predates package_renewal_periods coverage. This is reporting metadata,
-- never a blocking constraint.
CREATE OR REPLACE FUNCTION public.fn_resolve_renewal_period_id(
  p_package_instance_id bigint,
  p_entry_date date
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.package_renewal_periods
  WHERE package_instance_id = p_package_instance_id
    AND period_start <= p_entry_date
    AND p_entry_date < period_end
  ORDER BY period_number DESC
  LIMIT 1;
$$;

-- ─── 3. allocate_time_entry(): stamp renewal_period_id on every insert ──
-- Signature unchanged (uuid, uuid, text) - CREATE OR REPLACE is safe here,
-- no DROP FUNCTION needed (that pattern is only required when the argument
-- list itself changes).
CREATE OR REPLACE FUNCTION public.allocate_time_entry(
  p_time_entry_id uuid,
  p_actor uuid DEFAULT NULL,
  p_reason text DEFAULT 'auto'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_entry RECORD;
  v_memberships RECORD;
  v_rto_weight numeric;
  v_cricos_weight numeric;
  v_rto_minutes integer;
  v_cricos_minutes integer;
  v_entry_date date;
BEGIN
  -- Load the time entry
  SELECT * INTO v_entry FROM time_entries WHERE id = p_time_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry % not found', p_time_entry_id;
  END IF;

  v_entry_date := v_entry.start_at::date;

  -- Remove existing allocations (for reallocation)
  DELETE FROM time_entry_allocations WHERE time_entry_id = p_time_entry_id;

  -- Get membership packages
  SELECT * INTO v_memberships
  FROM get_active_membership_packages(v_entry.tenant_id);

  -- No memberships: nothing to allocate
  IF v_memberships.rto_package_instance_id IS NULL
     AND v_memberships.cricos_package_instance_id IS NULL THEN
    RETURN;
  END IF;

  -- Only RTO
  IF v_memberships.rto_package_instance_id IS NOT NULL
     AND v_memberships.cricos_package_instance_id IS NULL THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason, renewal_period_id)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.rto_package_instance_id,
       v_entry.duration_minutes, p_reason,
       fn_resolve_renewal_period_id(v_memberships.rto_package_instance_id, v_entry_date));
    RETURN;
  END IF;

  -- Only CRICOS
  IF v_memberships.rto_package_instance_id IS NULL
     AND v_memberships.cricos_package_instance_id IS NOT NULL THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason, renewal_period_id)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.cricos_package_instance_id,
       v_entry.duration_minutes, p_reason,
       fn_resolve_renewal_period_id(v_memberships.cricos_package_instance_id, v_entry_date));
    RETURN;
  END IF;

  -- Both memberships active
  IF v_entry.scope_tag = 'rto' THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason, renewal_period_id)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.rto_package_instance_id,
       v_entry.duration_minutes, p_reason,
       fn_resolve_renewal_period_id(v_memberships.rto_package_instance_id, v_entry_date));
    RETURN;
  END IF;

  IF v_entry.scope_tag = 'cricos' THEN
    INSERT INTO time_entry_allocations
      (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason, renewal_period_id)
    VALUES
      (p_time_entry_id, v_entry.tenant_id, v_memberships.cricos_package_instance_id,
       v_entry.duration_minutes, p_reason,
       fn_resolve_renewal_period_id(v_memberships.cricos_package_instance_id, v_entry_date));
    RETURN;
  END IF;

  -- scope_tag = 'both': weighted split
  SELECT COALESCE(mag.rto_weight, 0.5), COALESCE(mag.cricos_weight, 0.5)
  INTO v_rto_weight, v_cricos_weight
  FROM membership_allocation_groups mag
  WHERE mag.tenant_id = v_entry.tenant_id;

  IF NOT FOUND THEN
    v_rto_weight := 0.5;
    v_cricos_weight := 0.5;
  END IF;

  v_rto_minutes := floor(v_entry.duration_minutes * v_rto_weight);
  v_cricos_minutes := v_entry.duration_minutes - v_rto_minutes;

  INSERT INTO time_entry_allocations
    (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason, renewal_period_id)
  VALUES
    (p_time_entry_id, v_entry.tenant_id, v_memberships.rto_package_instance_id,
     v_rto_minutes, p_reason,
     fn_resolve_renewal_period_id(v_memberships.rto_package_instance_id, v_entry_date)),
    (p_time_entry_id, v_entry.tenant_id, v_memberships.cricos_package_instance_id,
     v_cricos_minutes, p_reason,
     fn_resolve_renewal_period_id(v_memberships.cricos_package_instance_id, v_entry_date));
END;
$$;

-- ─── 4. fn_reallocate_time_entry(): stamp/refresh renewal_period_id ─────
-- Also fixes a gap the renewal_period_id feature exposed: EditTimeDialog
-- always resubmits start_at/duration_minutes/package_instance_id together
-- on every save (src/components/client/EditTimeDialog.tsx), but the
-- existing trigger only reacted to package_instance_id or duration_minutes
-- changing. A pure date-only edit (same package, same duration) matched
-- none of the branches and silently returned NEW untouched - harmless
-- before (allocated_minutes doesn't depend on date), but would have left
-- renewal_period_id stale once introduced here. Branch 2's condition now
-- also fires on a start_at change, and a new branch 4 refreshes
-- renewal_period_id (without touching allocated_minutes/split) for the
-- multi-allocation case a date-only edit could hit.
CREATE OR REPLACE FUNCTION public.fn_reallocate_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
BEGIN
  -- Carry-over entries are accounting adjustments (negative duration_minutes),
  -- never real allocatable work - mirrors fn_auto_allocate_time_entry()'s
  -- existing INSERT-time guard.
  IF NEW.work_type = 'carry_over' THEN
    RETURN NEW;
  END IF;

  -- Explicit package change (e.g. EditTimeDialog): pin all minutes to the
  -- chosen instance. allocate_time_entry() would re-target active memberships
  -- and undo historical reallocation to a completed package.
  IF OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id THEN
    DELETE FROM public.time_entry_allocations WHERE time_entry_id = NEW.id;
    IF NEW.package_instance_id IS NOT NULL THEN
      INSERT INTO public.time_entry_allocations
        (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason, renewal_period_id)
      VALUES
        (NEW.id, NEW.tenant_id, NEW.package_instance_id, COALESCE(NEW.duration_minutes, 0), 'reallocate',
         public.fn_resolve_renewal_period_id(NEW.package_instance_id, NEW.start_at::date));
    END IF;
    RETURN NEW;
  END IF;

  -- Duration and/or date change on a single alloc already pinned to this
  -- entry's package: scale minutes and refresh the period tag in place
  -- rather than re-running allocate_time_entry.
  IF (OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
      OR OLD.start_at IS DISTINCT FROM NEW.start_at)
     AND (
       SELECT COUNT(*) FROM public.time_entry_allocations WHERE time_entry_id = NEW.id
     ) = 1
     AND EXISTS (
       SELECT 1 FROM public.time_entry_allocations
       WHERE time_entry_id = NEW.id
         AND package_instance_id IS NOT DISTINCT FROM NEW.package_instance_id
     ) THEN
    UPDATE public.time_entry_allocations
    SET allocated_minutes = COALESCE(NEW.duration_minutes, 0),
        renewal_period_id = public.fn_resolve_renewal_period_id(NEW.package_instance_id, NEW.start_at::date)
    WHERE time_entry_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Scope change, or duration change on multi-alloc / mismatched rows:
  -- existing RTO/CRICOS split logic (already stamps renewal_period_id, see
  -- allocate_time_entry() above).
  IF OLD.scope_tag IS DISTINCT FROM NEW.scope_tag
     OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
    PERFORM public.allocate_time_entry(NEW.id, auth.uid(), 'reallocate');
    RETURN NEW;
  END IF;

  -- Date-only change on a multi-allocation entry (rare - only possible for
  -- scope_tag = 'both' membership-split entries): refresh renewal_period_id
  -- on each existing row without touching allocated_minutes or the split.
  IF OLD.start_at IS DISTINCT FROM NEW.start_at THEN
    UPDATE public.time_entry_allocations
    SET renewal_period_id = public.fn_resolve_renewal_period_id(package_instance_id, NEW.start_at::date)
    WHERE time_entry_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── 5. Backfill: best-effort renewal_period_id for existing rows ───────
-- Non-destructive - only populates the new nullable column via the same
-- date-range join used by fn_resolve_renewal_period_id(). Rows with no
-- matching period (predate package_renewal_periods coverage, or fall in a
-- gap) are left NULL, same as any future entry that has no match.
UPDATE public.time_entry_allocations tea
SET renewal_period_id = public.fn_resolve_renewal_period_id(
  tea.package_instance_id, te.start_at::date
)
FROM public.time_entries te
WHERE te.id = tea.time_entry_id
  AND tea.renewal_period_id IS NULL;
