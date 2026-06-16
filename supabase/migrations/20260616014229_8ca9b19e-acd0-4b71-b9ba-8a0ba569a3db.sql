-- =====================================================================
-- Migration: add_published_action_item_id_to_cti  (1a of 5)
-- Window:    any time (metadata-only, sub-second locks)
-- Pre-deploy:
--   SELECT 1 FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='client_task_instances'
--      AND column_name='published_action_item_id';                  -- expect 0 rows
--   SELECT count(*) AS cti_total,
--          count(*) FILTER (WHERE is_archived=false) AS cti_visible
--     FROM public.client_task_instances;
-- =====================================================================

ALTER TABLE public.client_task_instances
  ADD COLUMN published_action_item_id uuid;

ALTER TABLE public.client_task_instances
  ADD CONSTRAINT client_task_instances_published_action_item_id_fkey
  FOREIGN KEY (published_action_item_id)
  REFERENCES public.client_action_items(id)
  ON DELETE SET NULL
  NOT VALID;

COMMENT ON COLUMN public.client_task_instances.published_action_item_id IS
  'When a stage task is published to the client portal, set to the id of the created client_action_items row. NULL = not yet published. Used by dashboards to avoid double-counting.';

-- =====================================================================
-- Post-deploy:
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid='public.client_task_instances'::regclass
--      AND conname='client_task_instances_published_action_item_id_fkey';
--   -- convalidated=false (validation happens in 1c)
-- =====================================================================