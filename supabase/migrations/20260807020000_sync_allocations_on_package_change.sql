-- Fix: changing a time entry's package_instance_id (EditTimeDialog historical
-- reallocation) left time_entry_allocations pointing at the old package.
-- Package Burndown (v_package_burndown / fn_package_used_minutes) reads
-- allocations; the monthly breakdown read package_instance_id — so the two
-- figures diverged after Dave (and others) moved entries between packages.
--
-- Root cause: trg_reallocate_update / fn_reallocate_time_entry only re-ran
-- allocate_time_entry() when scope_tag or duration_minutes changed — never
-- on package_instance_id change. And allocate_time_entry() itself always
-- resolves to currently-active memberships, so calling it on a move to a
-- completed historical package would undo the move.
--
-- Fix:
--   1) On package_instance_id change → pin 100% of minutes to the chosen
--      package (allocation_reason 'reallocate'; validator only allows
--      auto/override/reallocate).
--   2) On duration change when a single allocation already matches the
--      entry's package → update minutes in place (don't snap back to
--      active memberships).
--   3) Otherwise keep existing allocate_time_entry() behaviour for
--      scope_tag / multi-alloc RTO+CRICOS splits.
--   4) One-shot repair: sync all single-allocation rows that disagree
--      with their entry's package_instance_id (leaves intentional
--      multi-alloc RTO/CRICOS splits alone).

CREATE OR REPLACE FUNCTION public.fn_reallocate_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  -- Explicit package change (e.g. EditTimeDialog): pin all minutes to the
  -- chosen instance. allocate_time_entry() would re-target active memberships
  -- and undo historical reallocation to a completed package.
  IF OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id THEN
    DELETE FROM public.time_entry_allocations WHERE time_entry_id = NEW.id;
    IF NEW.package_instance_id IS NOT NULL THEN
      INSERT INTO public.time_entry_allocations
        (time_entry_id, tenant_id, package_instance_id, allocated_minutes, allocation_reason)
      VALUES
        (NEW.id, NEW.tenant_id, NEW.package_instance_id, COALESCE(NEW.duration_minutes, 0), 'reallocate');
    END IF;
    RETURN NEW;
  END IF;

  -- Duration-only change on a single alloc already pinned to this entry's
  -- package: scale minutes in place rather than re-running allocate_time_entry.
  IF OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
     AND (
       SELECT COUNT(*) FROM public.time_entry_allocations WHERE time_entry_id = NEW.id
     ) = 1
     AND EXISTS (
       SELECT 1 FROM public.time_entry_allocations
       WHERE time_entry_id = NEW.id
         AND package_instance_id IS NOT DISTINCT FROM NEW.package_instance_id
     ) THEN
    UPDATE public.time_entry_allocations
    SET allocated_minutes = COALESCE(NEW.duration_minutes, 0)
    WHERE time_entry_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Scope change, or duration change on multi-alloc / mismatched rows:
  -- existing RTO/CRICOS split logic.
  IF OLD.scope_tag IS DISTINCT FROM NEW.scope_tag
     OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
    PERFORM public.allocate_time_entry(NEW.id, auth.uid(), 'reallocate');
  END IF;

  RETURN NEW;
END;
$$;

-- Repair stale single-allocation rows left by the previous trigger gap.
-- Multi-alloc entries (intentional RTO/CRICOS splits) are left untouched.
UPDATE public.time_entry_allocations tea
SET
  package_instance_id = te.package_instance_id,
  allocation_reason = 'reallocate'
FROM public.time_entries te
WHERE tea.time_entry_id = te.id
  AND te.package_instance_id IS NOT NULL
  AND tea.package_instance_id IS DISTINCT FROM te.package_instance_id
  AND (
    SELECT COUNT(*) FROM public.time_entry_allocations x WHERE x.time_entry_id = te.id
  ) = 1;
