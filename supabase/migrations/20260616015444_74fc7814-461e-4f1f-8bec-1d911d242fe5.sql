-- =====================================================================
-- Migration: validate_published_action_item_id_fkey  (1c of 5)
-- =====================================================================

ALTER TABLE public.client_task_instances
  VALIDATE CONSTRAINT client_task_instances_published_action_item_id_fkey;

-- =====================================================================
-- Post-deploy:
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conname='client_task_instances_published_action_item_id_fkey';   -- expect true
-- =====================================================================