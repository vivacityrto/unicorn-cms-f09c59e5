-- Phase 9: Hardening for Document Generation and Email Sending

-- 1) Add retry and rate limiting fields to generated_documents
ALTER TABLE public.generated_documents 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamptz NULL;

-- 2) Add retry fields to email_send_log and unique constraint for idempotency
ALTER TABLE public.email_send_log
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamptz NULL;

-- Add unique constraint for email idempotency using correct column name (to_email)
CREATE UNIQUE INDEX IF NOT EXISTS email_send_log_idempotency_idx 
ON public.email_send_log(stage_release_id, email_template_id, to_email)
WHERE stage_release_id IS NOT NULL;

-- 3) Add emergency stop controls to app_settings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'email_sending_enabled') THEN
    ALTER TABLE public.app_settings ADD COLUMN email_sending_enabled boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'generation_enabled') THEN
    ALTER TABLE public.app_settings ADD COLUMN generation_enabled boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'max_generation_retries') THEN
    ALTER TABLE public.app_settings ADD COLUMN max_generation_retries integer DEFAULT 3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'generation_rate_limit_per_hour') THEN
    ALTER TABLE public.app_settings ADD COLUMN generation_rate_limit_per_hour integer DEFAULT 50;
  END IF;
END $$;

-- 4) Create rate limiting tracking table
CREATE TABLE IF NOT EXISTS public.rate_limit_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, action_type, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_tracker_tenant_action_idx ON public.rate_limit_tracker(tenant_id, action_type, window_start);

-- 5) Tighten RLS on generated_documents
DROP POLICY IF EXISTS "Tenant users can view their generated documents" ON public.generated_documents;
DROP POLICY IF EXISTS "Admins can manage generated documents" ON public.generated_documents;

CREATE POLICY "Tenant users can view their generated documents"
ON public.generated_documents FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
  )
);

-- 6) Tighten RLS on stage_releases
DROP POLICY IF EXISTS "Tenant users can view released stages" ON public.stage_releases;
DROP POLICY IF EXISTS "Admins can manage stage releases" ON public.stage_releases;

CREATE POLICY "Tenant users can view released stages"
ON public.stage_releases FOR SELECT
USING (
  status = 'released' AND
  tenant_id IN (
    SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
  )
);

CREATE POLICY "Admins can view all stage releases"
ON public.stage_releases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Admin')
  )
);

-- 7) Tighten RLS on stage_release_items
DROP POLICY IF EXISTS "Tenant users can view released items" ON public.stage_release_items;
DROP POLICY IF EXISTS "Admins can manage release items" ON public.stage_release_items;

CREATE POLICY "Tenant users can view released items"
ON public.stage_release_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.stage_releases sr
    WHERE sr.id = stage_release_id
    AND sr.status = 'released'
    AND sr.tenant_id IN (
      SELECT tenant_id FROM public.users WHERE user_uuid = auth.uid()
    )
  )
);

CREATE POLICY "Admins can view all release items"
ON public.stage_release_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role IN ('Super Admin', 'Admin')
  )
);

-- 8) Create SECURITY DEFINER RPCs

-- RPC: create_stage_release
CREATE OR REPLACE FUNCTION public.create_stage_release(
  p_tenant_id integer,
  p_package_id integer DEFAULT NULL,
  p_stage_id integer DEFAULT NULL,
  p_document_ids integer[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_release_id uuid;
  v_doc_id integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT unicorn_role INTO v_user_role
  FROM public.users WHERE user_uuid = v_user_id;

  IF v_user_role NOT IN ('Super Admin', 'Admin') THEN
    RAISE EXCEPTION 'Permission denied: only Admin or Super Admin can create releases';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Invalid tenant_id';
  END IF;

  INSERT INTO public.stage_releases (tenant_id, package_id, stage_id, status, created_by)
  VALUES (p_tenant_id, p_package_id, p_stage_id, 'draft', v_user_id)
  RETURNING id INTO v_release_id;

  IF p_document_ids IS NOT NULL THEN
    FOREACH v_doc_id IN ARRAY p_document_ids
    LOOP
      INSERT INTO public.stage_release_items (stage_release_id, document_id, generation_status)
      VALUES (v_release_id, v_doc_id, 'pending');
    END LOOP;
  END IF;

  INSERT INTO public.client_audit_log (tenant_id, action, entity_type, entity_id, actor_user_id, details)
  VALUES (p_tenant_id, 'stage.release_created', 'stage_release', v_release_id::text, v_user_id, 
    jsonb_build_object('package_id', p_package_id, 'stage_id', p_stage_id));

  RETURN v_release_id;
END;
$$;

-- RPC: check_rate_limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_tenant_id integer,
  p_action_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_current_count integer;
  v_window_start timestamptz;
BEGIN
  SELECT generation_rate_limit_per_hour INTO v_limit FROM public.app_settings LIMIT 1;
  v_limit := COALESCE(v_limit, 50);
  v_window_start := date_trunc('hour', now());

  SELECT count INTO v_current_count
  FROM public.rate_limit_tracker
  WHERE tenant_id = p_tenant_id
    AND action_type = p_action_type
    AND window_start = v_window_start;

  RETURN COALESCE(v_current_count, 0) < v_limit;
END;
$$;

-- RPC: increment_rate_limit
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_tenant_id integer,
  p_action_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start timestamptz;
BEGIN
  v_window_start := date_trunc('hour', now());

  INSERT INTO public.rate_limit_tracker (tenant_id, action_type, window_start, count)
  VALUES (p_tenant_id, p_action_type, v_window_start, 1)
  ON CONFLICT (tenant_id, action_type, window_start)
  DO UPDATE SET count = public.rate_limit_tracker.count + 1;
END;
$$;

-- RPC: release_to_tenant
CREATE OR REPLACE FUNCTION public.release_to_tenant(
  p_stage_release_id uuid,
  p_confirm_override boolean DEFAULT false,
  p_confirm_phrase text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_release record;
  v_fail_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT unicorn_role INTO v_user_role
  FROM public.users WHERE user_uuid = v_user_id;

  IF v_user_role NOT IN ('Super Admin', 'Admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_release FROM public.stage_releases WHERE id = p_stage_release_id;
  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release not found';
  END IF;

  IF v_release.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'Cannot release from status: %', v_release.status;
  END IF;

  SELECT COUNT(*) INTO v_fail_count
  FROM public.stage_release_items
  WHERE stage_release_id = p_stage_release_id
    AND generation_status = 'failed';

  IF v_fail_count > 0 AND NOT p_confirm_override THEN
    RETURN jsonb_build_object(
      'success', false,
      'requires_override', true,
      'fail_count', v_fail_count,
      'message', 'Release has failed items. Override required.'
    );
  END IF;

  IF v_fail_count > 0 AND p_confirm_override THEN
    IF v_user_role != 'Super Admin' THEN
      RAISE EXCEPTION 'Only Super Admin can override failures';
    END IF;
    IF p_confirm_phrase != 'RELEASE ANYWAY' THEN
      RAISE EXCEPTION 'Invalid confirmation phrase';
    END IF;
  END IF;

  UPDATE public.stage_releases
  SET status = 'released',
      released_at = now(),
      released_by = v_user_id
  WHERE id = p_stage_release_id;

  INSERT INTO public.client_audit_log (tenant_id, action, entity_type, entity_id, actor_user_id, details)
  VALUES (v_release.tenant_id, 'stage.released', 'stage_release', p_stage_release_id::text, v_user_id,
    jsonb_build_object('override_used', p_confirm_override, 'fail_count', v_fail_count));

  RETURN jsonb_build_object('success', true, 'released_at', now());
END;
$$;

-- RPC: retry_failed_generation
CREATE OR REPLACE FUNCTION public.retry_failed_generation(
  p_generated_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_doc record;
  v_max_retries integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT unicorn_role INTO v_user_role
  FROM public.users WHERE user_uuid = v_user_id;

  IF v_user_role NOT IN ('Super Admin', 'Admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT max_generation_retries INTO v_max_retries FROM public.app_settings LIMIT 1;
  v_max_retries := COALESCE(v_max_retries, 3);

  SELECT * INTO v_doc FROM public.generated_documents WHERE id = p_generated_document_id;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.status != 'failed' THEN
    RAISE EXCEPTION 'Only failed documents can be retried';
  END IF;

  IF v_doc.retry_count >= v_max_retries THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Maximum retries (%s) exceeded', v_max_retries)
    );
  END IF;

  UPDATE public.generated_documents
  SET status = 'pending',
      retry_count = retry_count + 1,
      last_retry_at = now(),
      error_message = NULL
  WHERE id = p_generated_document_id;

  INSERT INTO public.client_audit_log (tenant_id, action, entity_type, entity_id, actor_user_id, details)
  VALUES (v_doc.tenant_id, 'document.retry_queued', 'generated_document', p_generated_document_id::text, v_user_id,
    jsonb_build_object('retry_count', v_doc.retry_count + 1));

  RETURN jsonb_build_object('success', true, 'retry_count', v_doc.retry_count + 1);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_stage_release TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_to_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_failed_generation TO authenticated;

-- Enable RLS on rate_limit_tracker
ALTER TABLE public.rate_limit_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for rate limit tracker"
ON public.rate_limit_tracker FOR ALL
USING (false)
WITH CHECK (false);