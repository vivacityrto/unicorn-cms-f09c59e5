-- Step 1: Populate u1_packageid mapping reference in public.packages
UPDATE public.packages pp
SET u1_packageid = up.id
FROM unicorn1.packages up
WHERE pp.name = up.name;

-- Step 2: Remap package_instances to use current public.packages IDs
UPDATE public.package_instances pi
SET package_id = pp.id
FROM unicorn1.packages up
JOIN public.packages pp ON pp.name = up.name
WHERE up.id = pi.package_id
  AND pi.package_id != pp.id;