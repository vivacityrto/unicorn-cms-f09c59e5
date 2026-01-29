-- Step 1: Drop the FK constraint referencing documents_stages
ALTER TABLE public.package_stages 
  DROP CONSTRAINT IF EXISTS package_stages_stage_id_fkey;

-- Step 2: Truncate existing incomplete data
TRUNCATE public.package_stages RESTART IDENTITY CASCADE;

-- Step 3: Insert unicorn1 data
INSERT INTO public.package_stages (
  package_id, 
  stage_id, 
  sort_order, 
  is_required, 
  update_policy, 
  use_overrides,
  created_at
)
SELECT 
  ups.package_id,
  ups.stage_id,
  ups.ordernumber,
  true,
  'manual',
  false,
  COALESCE(ups.dateimported, NOW())
FROM unicorn1.package_stages ups
WHERE EXISTS (SELECT 1 FROM public.packages p WHERE p.id = ups.package_id);

-- Step 4: Add new FK constraint referencing stages
ALTER TABLE public.package_stages
  ADD CONSTRAINT package_stages_stage_id_fkey 
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;