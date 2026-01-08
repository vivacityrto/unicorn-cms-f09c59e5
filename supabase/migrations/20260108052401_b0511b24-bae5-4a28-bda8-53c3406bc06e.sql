-- Create document activity log table
CREATE TABLE IF NOT EXISTS public.document_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  client_id bigint REFERENCES public.tenants(id),
  package_id bigint REFERENCES public.packages(id),
  stage_id bigint REFERENCES public.documents_stages(id),
  document_id bigint NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('uploaded', 'downloaded')),
  actor_user_id uuid,
  actor_role text CHECK (actor_role IN ('internal', 'tenant')),
  file_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_activity_log ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doc_activity_client 
ON public.document_activity_log(tenant_id, client_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_activity_document 
ON public.document_activity_log(tenant_id, document_id, occurred_at DESC);

-- RLS policies
CREATE POLICY "Users can read their tenant document activity"
ON public.document_activity_log
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'
  )
);

CREATE POLICY "Users can insert document activity for their tenant"
ON public.document_activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin'
  )
);

-- Create RPC to log document activity and insert timeline event
CREATE OR REPLACE FUNCTION public.rpc_log_document_activity(
  p_tenant_id bigint,
  p_client_id bigint,
  p_package_id bigint,
  p_stage_id bigint,
  p_document_id bigint,
  p_activity_type text,
  p_file_name text,
  p_actor_role text DEFAULT 'internal',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activity_id uuid;
  v_event_type text;
  v_title text;
  v_body text;
  v_stage_name text;
  v_package_name text;
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Insert activity log
  INSERT INTO public.document_activity_log (
    tenant_id, client_id, package_id, stage_id, document_id,
    activity_type, actor_user_id, actor_role, file_name, metadata
  ) VALUES (
    p_tenant_id, p_client_id, p_package_id, p_stage_id, p_document_id,
    p_activity_type, v_user_id, p_actor_role, p_file_name, p_metadata
  )
  RETURNING id INTO v_activity_id;
  
  -- Only create timeline event if client_id is present
  IF p_client_id IS NOT NULL THEN
    -- Determine event type
    IF p_activity_type = 'uploaded' THEN
      v_event_type := 'document_uploaded';
      v_title := 'Document uploaded: ' || COALESCE(p_file_name, 'Unknown file');
    ELSE
      v_event_type := 'document_downloaded';
      v_title := 'Document downloaded: ' || COALESCE(p_file_name, 'Unknown file');
    END IF;
    
    -- Get stage name if available
    IF p_stage_id IS NOT NULL THEN
      SELECT title INTO v_stage_name 
      FROM public.documents_stages 
      WHERE id = p_stage_id;
      v_body := 'Stage: ' || COALESCE(v_stage_name, 'Unknown');
    END IF;
    
    -- Get package name if available
    IF p_package_id IS NOT NULL THEN
      SELECT name INTO v_package_name 
      FROM public.packages 
      WHERE id = p_package_id;
      IF v_body IS NULL THEN
        v_body := 'Package: ' || COALESCE(v_package_name, 'Unknown');
      ELSE
        v_body := v_body || ' | Package: ' || COALESCE(v_package_name, 'Unknown');
      END IF;
    END IF;
    
    -- Insert timeline event
    INSERT INTO public.client_timeline_events (
      tenant_id,
      client_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id,
      metadata,
      occurred_at,
      created_by
    ) VALUES (
      p_tenant_id,
      p_client_id,
      v_event_type,
      v_title,
      v_body,
      'document',
      p_document_id::text,
      jsonb_build_object(
        'activity_log_id', v_activity_id,
        'document_id', p_document_id,
        'package_id', p_package_id,
        'stage_id', p_stage_id,
        'file_name', p_file_name,
        'download_source', CASE WHEN p_stage_id IS NOT NULL THEN 'stage' ELSE 'documents' END,
        'actor_role', p_actor_role
      ) || p_metadata,
      now(),
      v_user_id
    );
  END IF;
  
  RETURN jsonb_build_object('success', true, 'activity_id', v_activity_id);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_log_document_activity TO authenticated;