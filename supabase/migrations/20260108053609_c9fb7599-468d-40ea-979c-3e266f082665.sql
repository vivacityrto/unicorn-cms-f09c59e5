-- Add full-text search index on client_timeline_events
CREATE INDEX IF NOT EXISTS idx_timeline_events_fts 
ON public.client_timeline_events 
USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(metadata::text, '')));

-- Add index for date range queries
CREATE INDEX IF NOT EXISTS idx_timeline_events_tenant_client_occurred 
ON public.client_timeline_events (tenant_id, client_id, occurred_at DESC);

-- Drop and recreate the RPC with enhanced parameters
DROP FUNCTION IF EXISTS public.rpc_search_timeline_events(bigint, bigint, text, text[], integer, integer);

CREATE OR REPLACE FUNCTION public.rpc_search_timeline_events(
  p_tenant_id bigint,
  p_client_id bigint,
  p_search text DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL
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
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    e.source
  FROM public.client_timeline_events e
  WHERE e.tenant_id = p_tenant_id
    AND e.client_id = p_client_id::text
    -- Date range filter
    AND (p_from_date IS NULL OR e.occurred_at >= p_from_date)
    AND (p_to_date IS NULL OR e.occurred_at <= p_to_date)
    -- Event type filter
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
    -- Full-text search or ILIKE fallback
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_search_timeline_events TO authenticated;

-- Create RPC for export with all matching rows (no pagination)
CREATE OR REPLACE FUNCTION public.rpc_export_client_timeline(
  p_tenant_id bigint,
  p_client_id bigint,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL,
  p_event_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  event_type text,
  title text,
  body text,
  metadata jsonb,
  occurred_at timestamptz,
  created_by uuid,
  creator_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.event_type,
    e.title,
    e.body,
    e.metadata,
    e.occurred_at,
    e.created_by,
    COALESCE(u.first_name || ' ' || u.last_name, 'System') as creator_name
  FROM public.client_timeline_events e
  LEFT JOIN public.users u ON u.user_uuid = e.created_by
  WHERE e.tenant_id = p_tenant_id
    AND e.client_id = p_client_id::text
    AND (p_from_date IS NULL OR e.occurred_at >= p_from_date)
    AND (p_to_date IS NULL OR e.occurred_at <= p_to_date)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
  ORDER BY e.occurred_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_export_client_timeline TO authenticated;