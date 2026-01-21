-- Step 1: Create Correct Indexes for process_versions (using existing columns)

-- Process + version lookup
CREATE INDEX IF NOT EXISTS idx_process_versions_process_version
ON public.process_versions (process_id, version DESC);

-- Common filters
CREATE INDEX IF NOT EXISTS idx_process_versions_status
ON public.process_versions (status);

CREATE INDEX IF NOT EXISTS idx_process_versions_owner
ON public.process_versions (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_process_versions_review_date
ON public.process_versions (review_date);

-- Approved versions (approved_at is the approval signal)
CREATE INDEX IF NOT EXISTS idx_process_versions_approved
ON public.process_versions (process_id, approved_at DESC)
WHERE approved_at IS NOT NULL;

-- Step 2: Enable Row Level Security
ALTER TABLE public.process_versions ENABLE ROW LEVEL SECURITY;

-- Step 3: Read Access Policy (Tenant Scoped via processes)
DROP POLICY IF EXISTS "process_versions_read_via_process" ON public.process_versions;

CREATE POLICY "process_versions_read_via_process"
ON public.process_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = process_versions.process_id
      AND p.tenant_id = public.current_user_tenant()
  )
);

-- Step 4: Insert Policy (Privileged Roles Only)
DROP POLICY IF EXISTS "process_versions_insert_via_process" ON public.process_versions;

CREATE POLICY "process_versions_insert_via_process"
ON public.process_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = process_versions.process_id
      AND p.tenant_id = public.current_user_tenant()
  )
  AND public.current_user_role() IN ('superadmin', 'admin', 'team_leader')
  AND created_by = auth.uid()
);