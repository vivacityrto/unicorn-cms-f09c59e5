-- Fix FK: package_stage_documents.stage_id should reference stages(id), not documents_stages(id)
-- The copy_stage_template_to_package RPC and package builder use stages.id as the stage identifier.
ALTER TABLE public.package_stage_documents
  DROP CONSTRAINT IF EXISTS package_stage_documents_stage_id_fkey;

ALTER TABLE public.package_stage_documents
  ADD CONSTRAINT package_stage_documents_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;