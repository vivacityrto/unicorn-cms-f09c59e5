-- Extend ai_interaction_logs for Compliance Assistant tracking
ALTER TABLE public.ai_interaction_logs 
ADD COLUMN IF NOT EXISTS records_accessed jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ai_interaction_logs 
ADD COLUMN IF NOT EXISTS request_context jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add index for mode filtering
CREATE INDEX IF NOT EXISTS idx_ai_interaction_logs_mode ON public.ai_interaction_logs(mode);

COMMENT ON COLUMN public.ai_interaction_logs.records_accessed IS 'JSON array of records accessed during the query: [{table, id, label}]';
COMMENT ON COLUMN public.ai_interaction_logs.request_context IS 'Request context including tenant_id, client_id, role, etc.';