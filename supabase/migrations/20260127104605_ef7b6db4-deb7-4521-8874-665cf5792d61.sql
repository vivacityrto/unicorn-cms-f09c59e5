-- ============================================
-- PHASE 4: SYNC PACKAGE_INSTANCES
-- ============================================

-- Step 4a: Rename tenant_id to u2tid (preserve old value)
ALTER TABLE public.package_instances RENAME COLUMN tenant_id TO u2tid;

-- Step 4b: Rename client_id to tenant_id
ALTER TABLE public.package_instances RENAME COLUMN client_id TO tenant_id;

-- Step 4c: Update manager_id from clo_id -> users.legacy_id -> user_uuid
UPDATE public.package_instances pi
SET manager_id = u.user_uuid
FROM public.users u
WHERE pi.clo_id = u.legacy_id AND pi.clo_id IS NOT NULL;

-- Step 4d: Validation
DO $$
DECLARE
  total_count INTEGER;
  mapped_managers INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM public.package_instances;
  SELECT COUNT(*) INTO mapped_managers FROM public.package_instances WHERE manager_id IS NOT NULL;
  
  RAISE NOTICE '=== PHASE 4 COMPLETE ===';
  RAISE NOTICE 'Total package_instances: %', total_count;
  RAISE NOTICE 'Manager IDs mapped: %', mapped_managers;
END $$;