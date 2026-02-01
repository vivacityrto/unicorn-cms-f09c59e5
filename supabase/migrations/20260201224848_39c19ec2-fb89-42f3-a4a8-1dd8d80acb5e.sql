-- Step 1: Schema Alterations for document_instances
-- Fix ID column (drop UUID, add bigint)
ALTER TABLE public.document_instances DROP CONSTRAINT document_instances_pkey;
ALTER TABLE public.document_instances DROP COLUMN id;
ALTER TABLE public.document_instances ADD COLUMN id bigint PRIMARY KEY;

-- Add required columns from unicorn1
ALTER TABLE public.document_instances ADD COLUMN isgenerated boolean DEFAULT false;
ALTER TABLE public.document_instances ADD COLUMN generationdate timestamp without time zone;

-- Step 2: Data Migration
INSERT INTO public.document_instances (
  id,
  document_id,
  tenant_id,
  status,
  isgenerated,
  generationdate,
  stageinstance_id,
  created_at,
  updated_at
)
SELECT 
  u1.id::bigint,
  u1.document_id::bigint,
  pi.tenant_id,
  CASE WHEN u1.isgenerated THEN 'generated' ELSE 'pending' END,
  u1.isgenerated,
  u1.generationdate,
  u1.stageinstance_id::bigint,
  COALESCE(u1.dateimported, now()),
  COALESCE(u1.generationdate, u1.dateimported, now())
FROM unicorn1.document_instances u1
JOIN stage_instances si ON si.id = u1.stageinstance_id
JOIN package_instances pi ON pi.id = si.packageinstance_id;