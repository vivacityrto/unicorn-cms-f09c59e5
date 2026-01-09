-- TGA Pipeline Enhancement: Add stage-based tracking, audit table, and fix column names

-- 1. Add stage-based tracking columns to tga_rto_import_jobs
ALTER TABLE tga_rto_import_jobs 
ADD COLUMN IF NOT EXISTS stage text DEFAULT 'full_sync',
ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS run_id uuid,
ADD COLUMN IF NOT EXISTS finished_at timestamptz,
ADD COLUMN IF NOT EXISTS last_error text,
ADD COLUMN IF NOT EXISTS payload_meta jsonb;

-- Add check constraint for valid stages
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tga_rto_import_jobs_stage_check') THEN
    ALTER TABLE tga_rto_import_jobs 
    ADD CONSTRAINT tga_rto_import_jobs_stage_check 
    CHECK (stage IN ('rto_summary', 'addresses', 'contacts', 'delivery_sites', 'scope_quals', 'scope_units', 'scope_skills', 'scope_courses', 'full_sync'));
  END IF;
END $$;

-- Add index for job processing
CREATE INDEX IF NOT EXISTS idx_tga_rto_import_jobs_processing 
ON tga_rto_import_jobs (rto_code, status, stage);

-- 2. Add notes column to tga_import_runs if missing
ALTER TABLE tga_import_runs
ADD COLUMN IF NOT EXISTS notes text;

-- 3. Create TGA import audit table
CREATE TABLE IF NOT EXISTS tga_import_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  triggered_by uuid,
  rto_code text NOT NULL,
  run_id uuid,
  action text NOT NULL DEFAULT 'sync_now',
  stage text,
  status text DEFAULT 'started',
  rows_affected integer DEFAULT 0,
  error_message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE tga_import_audit ENABLE ROW LEVEL SECURITY;

-- Create policy for superadmins
CREATE POLICY "SuperAdmins can view all TGA import audits"
ON tga_import_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.user_uuid = auth.uid()
    AND users.global_role = 'SuperAdmin'
  )
);

-- Create policy for tenant users
CREATE POLICY "Users can view their tenant TGA import audits"
ON tga_import_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
    AND tu.tenant_id = tga_import_audit.tenant_id
  )
);

-- Insert policy for authenticated users
CREATE POLICY "Authenticated users can insert TGA import audits"
ON tga_import_audit FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Update tga_import_state to add latest_success if missing
ALTER TABLE tga_import_state 
ADD COLUMN IF NOT EXISTS latest_success timestamptz;

-- Create index on tga_import_audit
CREATE INDEX IF NOT EXISTS idx_tga_import_audit_tenant ON tga_import_audit (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tga_import_audit_run ON tga_import_audit (run_id);

-- 5. Add foreign key from tga_rto_import_jobs.run_id to tga_import_runs.id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tga_rto_import_jobs_run_id_fkey'
  ) THEN
    ALTER TABLE tga_rto_import_jobs 
    ADD CONSTRAINT tga_rto_import_jobs_run_id_fkey 
    FOREIGN KEY (run_id) REFERENCES tga_import_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Rename columns for consistency if the scope tables have wrong column names
-- Check and rename in tga_scope_qualifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_qualifications' AND column_name = 'scope_start_date') THEN
    ALTER TABLE tga_scope_qualifications RENAME COLUMN scope_start_date TO start_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_qualifications' AND column_name = 'scope_end_date') THEN
    ALTER TABLE tga_scope_qualifications RENAME COLUMN scope_end_date TO end_date;
  END IF;
END $$;

-- Same for skillsets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_skillsets' AND column_name = 'scope_start_date') THEN
    ALTER TABLE tga_scope_skillsets RENAME COLUMN scope_start_date TO start_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_skillsets' AND column_name = 'scope_end_date') THEN
    ALTER TABLE tga_scope_skillsets RENAME COLUMN scope_end_date TO end_date;
  END IF;
END $$;

-- Same for units
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_units' AND column_name = 'scope_start_date') THEN
    ALTER TABLE tga_scope_units RENAME COLUMN scope_start_date TO start_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_units' AND column_name = 'scope_end_date') THEN
    ALTER TABLE tga_scope_units RENAME COLUMN scope_end_date TO end_date;
  END IF;
END $$;

-- Same for courses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_courses' AND column_name = 'scope_start_date') THEN
    ALTER TABLE tga_scope_courses RENAME COLUMN scope_start_date TO start_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tga_scope_courses' AND column_name = 'scope_end_date') THEN
    ALTER TABLE tga_scope_courses RENAME COLUMN scope_end_date TO end_date;
  END IF;
END $$;

-- 7. Create RPC function for staged sync that creates a run and jobs
CREATE OR REPLACE FUNCTION tga_start_staged_sync(
  p_tenant_id bigint,
  p_rto_code text,
  p_triggered_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_stages text[] := ARRAY['rto_summary', 'contacts', 'addresses', 'delivery_sites', 'scope_quals', 'scope_units', 'scope_skills', 'scope_courses'];
  v_stage text;
  v_job_count int := 0;
BEGIN
  -- Create import run
  INSERT INTO tga_import_runs (id, run_type, status, started_at, created_by)
  VALUES (gen_random_uuid(), 'staged_sync', 'running', now(), p_triggered_by)
  RETURNING id INTO v_run_id;
  
  -- Create staged jobs
  FOREACH v_stage IN ARRAY v_stages LOOP
    INSERT INTO tga_rto_import_jobs (
      id, tenant_id, rto_code, status, job_type, stage, run_id, created_by
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_rto_code, 'queued', 'staged', v_stage, v_run_id, p_triggered_by
    );
    v_job_count := v_job_count + 1;
  END LOOP;
  
  -- Create audit record
  INSERT INTO tga_import_audit (tenant_id, triggered_by, rto_code, run_id, action, status, metadata)
  VALUES (p_tenant_id, p_triggered_by, p_rto_code, v_run_id, 'sync_now', 'started', 
    jsonb_build_object('jobs_created', v_job_count, 'stages', v_stages));
  
  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'jobs_created', v_job_count,
    'stages', v_stages
  );
END;
$$;

-- 8. Create RPC to get staged sync progress
CREATE OR REPLACE FUNCTION tga_get_sync_progress(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'run_id', p_run_id,
    'total_jobs', COUNT(*),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'queued', COUNT(*) FILTER (WHERE status = 'queued'),
    'processing', COUNT(*) FILTER (WHERE status = 'processing'),
    'stages', jsonb_agg(
      jsonb_build_object(
        'stage', stage,
        'status', status,
        'attempts', attempts,
        'last_error', last_error,
        'payload_meta', payload_meta
      ) ORDER BY 
        CASE stage 
          WHEN 'rto_summary' THEN 1
          WHEN 'contacts' THEN 2
          WHEN 'addresses' THEN 3
          WHEN 'delivery_sites' THEN 4
          WHEN 'scope_quals' THEN 5
          WHEN 'scope_units' THEN 6
          WHEN 'scope_skills' THEN 7
          WHEN 'scope_courses' THEN 8
        END
    )
  ) INTO v_result
  FROM tga_rto_import_jobs
  WHERE run_id = p_run_id;
  
  RETURN COALESCE(v_result, jsonb_build_object('run_id', p_run_id, 'total_jobs', 0));
END;
$$;