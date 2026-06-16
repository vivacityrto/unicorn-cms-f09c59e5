-- =====================================================================
-- Migration: add_published_action_item_id_index  (1b of 5, plain)
-- Note: CONCURRENTLY is not supported by the migration runner (it wraps
-- statements in a transaction). Plain CREATE INDEX is used instead;
-- on ~23K rows with a nullable uuid column this takes milliseconds
-- and only briefly holds an ACCESS EXCLUSIVE lock.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_cti_published_action_item_id
  ON public.client_task_instances (published_action_item_id)
  WHERE published_action_item_id IS NOT NULL;

-- =====================================================================
-- Post-deploy:
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE indexname='idx_cti_published_action_item_id';
-- =====================================================================