
-- Step 1: Create a mapping from dd_status values to dd_lifecycle_status values
-- active -> active; disabled/on_hold/overrun/In Arears -> suspended; terminated/cancelled -> closed

-- Step 2: Sync existing lifecycle_status based on status field
UPDATE public.tenants
SET lifecycle_status = CASE
  WHEN status = 'active' THEN 'active'
  WHEN status IN ('disabled', 'on_hold', 'overrun', 'In Arears') THEN 'suspended'
  WHEN status IN ('terminated', 'cancelled') THEN 'closed'
  ELSE lifecycle_status
END
WHERE lifecycle_status IS DISTINCT FROM (
  CASE
    WHEN status = 'active' THEN 'active'
    WHEN status IN ('disabled', 'on_hold', 'overrun', 'In Arears') THEN 'suspended'
    WHEN status IN ('terminated', 'cancelled') THEN 'closed'
    ELSE lifecycle_status
  END
);

-- Step 3: Sync assigned_consultant_user_id from tenant_csc_assignments where missing
UPDATE public.tenants t
SET assigned_consultant_user_id = tca.csc_user_id
FROM public.tenant_csc_assignments tca
WHERE tca.tenant_id = t.id
  AND tca.is_primary = true
  AND (t.assigned_consultant_user_id IS NULL OR t.assigned_consultant_user_id IS DISTINCT FROM tca.csc_user_id);

-- Step 4: Create trigger to auto-sync lifecycle_status when status changes
CREATE OR REPLACE FUNCTION public.sync_tenant_lifecycle_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.lifecycle_status := CASE
      WHEN NEW.status = 'active' THEN 'active'
      WHEN NEW.status IN ('disabled', 'on_hold', 'overrun', 'In Arears') THEN 'suspended'
      WHEN NEW.status IN ('terminated', 'cancelled') THEN 'closed'
      ELSE NEW.lifecycle_status
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_tenant_lifecycle_status ON public.tenants;
CREATE TRIGGER trg_sync_tenant_lifecycle_status
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_lifecycle_status();
