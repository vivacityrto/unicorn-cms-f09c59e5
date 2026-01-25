-- Step 1.2: Insert 16 missing packages from unicorn1
INSERT INTO public.packages (name, status, u1_packageid, document_assurance_period, duration_months, created_at)
SELECT 
  u1.name,
  'active',
  u1.id,
  u1.documentassuranceperiod,
  12,
  NOW()
FROM unicorn1.packages u1
LEFT JOIN public.packages p ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
WHERE p.id IS NULL;

-- Step 1.3: Fix orphaned package_instances by remapping to new public.packages IDs
UPDATE public.package_instances pi
SET package_id = new_pkg.id
FROM (
  SELECT p.id, u1.id as u1_id
  FROM public.packages p
  JOIN unicorn1.packages u1 ON LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
) new_pkg
WHERE pi.package_id = new_pkg.u1_id
  AND NOT EXISTS (SELECT 1 FROM public.packages WHERE id = pi.package_id);

-- Step 1.4: Backfill existing packages with document_assurance_period
UPDATE public.packages p
SET document_assurance_period = u1.documentassuranceperiod
FROM unicorn1.packages u1
WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(u1.name))
  AND (p.document_assurance_period IS NULL OR p.document_assurance_period = 0);