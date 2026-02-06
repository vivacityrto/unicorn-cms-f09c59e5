-- ============================================================================
-- PHASE 2: PERFORMANCE - Add database indexes for high-traffic tables
-- ============================================================================

-- ============================================================================
-- 1. document_instances - High-traffic document tracking
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_document_instances_tenant_id 
ON public.document_instances(tenant_id);

CREATE INDEX IF NOT EXISTS idx_document_instances_stageinstance_id 
ON public.document_instances(stageinstance_id);

CREATE INDEX IF NOT EXISTS idx_document_instances_status 
ON public.document_instances(status);

CREATE INDEX IF NOT EXISTS idx_document_instances_created_at 
ON public.document_instances(created_at DESC);

-- Composite index for common query pattern: filter by tenant and status
CREATE INDEX IF NOT EXISTS idx_document_instances_tenant_status 
ON public.document_instances(tenant_id, status);

-- ============================================================================
-- 2. stage_instances - Stage workflow queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_stage_instances_status 
ON public.stage_instances(status);

CREATE INDEX IF NOT EXISTS idx_stage_instances_packageinstance_id 
ON public.stage_instances(packageinstance_id);

CREATE INDEX IF NOT EXISTS idx_stage_instances_status_id 
ON public.stage_instances(status_id);

-- ============================================================================
-- 3. client_task_instances - Task tracking
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_client_task_instances_stageinstance_id 
ON public.client_task_instances(stageinstance_id);

CREATE INDEX IF NOT EXISTS idx_client_task_instances_status 
ON public.client_task_instances(status);

CREATE INDEX IF NOT EXISTS idx_client_task_instances_due_date 
ON public.client_task_instances(due_date);

-- ============================================================================
-- 4. time_entries - Time tracking queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_time_entries_user_id 
ON public.time_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_created_at 
ON public.time_entries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_id 
ON public.time_entries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_client_id 
ON public.time_entries(client_id);

-- Composite for user time history
CREATE INDEX IF NOT EXISTS idx_time_entries_user_created 
ON public.time_entries(user_id, created_at DESC);