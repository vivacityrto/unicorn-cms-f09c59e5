
-- Add dedupe_key column for idempotent timeline event emission
ALTER TABLE public.client_timeline_events 
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

-- Partial unique index: only one event per dedupe_key per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_events_dedupe 
  ON public.client_timeline_events (tenant_id, dedupe_key) 
  WHERE dedupe_key IS NOT NULL;
