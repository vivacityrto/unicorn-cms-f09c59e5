
-- Add visibility column
ALTER TABLE public.client_timeline_events 
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';

-- Add index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_timeline_events_visibility 
  ON public.client_timeline_events (tenant_id, visibility, occurred_at DESC);

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view timeline for their tenant" ON public.client_timeline_events;
DROP POLICY IF EXISTS "Users can insert timeline events for their tenant" ON public.client_timeline_events;

-- New SELECT policy: Vivacity team sees all rows; client users see only visibility='client'
CREATE POLICY "Vivacity team can view all timeline events"
  ON public.client_timeline_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.user_uuid = auth.uid()
        AND (u.tenant_id = client_timeline_events.tenant_id
             OR u.unicorn_role IN ('Super Admin', 'Team Leader'))
    )
  );

CREATE POLICY "Client users can view client-visible timeline events"
  ON public.client_timeline_events
  FOR SELECT
  USING (
    visibility = 'client'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.user_uuid = auth.uid()
        AND u.tenant_id = client_timeline_events.tenant_id
    )
  );

-- INSERT: Only Vivacity team can insert internal events
CREATE POLICY "Vivacity team can insert timeline events"
  ON public.client_timeline_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
    )
  );

-- Client users can only insert client-visible events (e.g. notes)
CREATE POLICY "Client users can insert client-visible events"
  ON public.client_timeline_events
  FOR INSERT
  WITH CHECK (
    visibility = 'client'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.user_uuid = auth.uid()
        AND u.tenant_id = client_timeline_events.tenant_id
    )
  );

-- Update RPC to include visibility column and optional visibility filter
CREATE OR REPLACE FUNCTION public.rpc_search_timeline_events(
  p_tenant_id bigint,
  p_client_id bigint,
  p_search text DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_package_id bigint DEFAULT NULL,
  p_visibility text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  tenant_id integer,
  client_id text,
  event_type text,
  title text,
  body text,
  entity_type text,
  entity_id text,
  metadata jsonb,
  occurred_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  source text,
  package_id bigint,
  visibility text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.tenant_id,
    e.client_id,
    e.event_type,
    e.title,
    e.body,
    e.entity_type,
    e.entity_id,
    e.metadata,
    e.occurred_at,
    e.created_at,
    e.created_by,
    e.source,
    e.package_id,
    e.visibility
  FROM public.client_timeline_events e
  WHERE e.tenant_id = p_tenant_id::integer
    AND e.client_id = p_client_id::text
    AND (p_from_date IS NULL OR e.occurred_at >= p_from_date)
    AND (p_to_date IS NULL OR e.occurred_at <= p_to_date)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
    AND (p_source IS NULL OR e.source = p_source)
    AND (p_package_id IS NULL OR e.package_id = p_package_id)
    AND (p_visibility IS NULL OR e.visibility = p_visibility)
    AND (
      p_search IS NULL 
      OR p_search = '' 
      OR to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.body, '') || ' ' || coalesce(e.metadata::text, '')) 
         @@ plainto_tsquery('english', p_search)
      OR e.title ILIKE '%' || p_search || '%'
      OR e.body ILIKE '%' || p_search || '%'
    )
  ORDER BY e.occurred_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
