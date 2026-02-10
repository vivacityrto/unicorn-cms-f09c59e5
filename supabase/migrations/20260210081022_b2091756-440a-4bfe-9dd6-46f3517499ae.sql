-- Add package_id column to client_timeline_events
ALTER TABLE public.client_timeline_events 
ADD COLUMN IF NOT EXISTS package_id bigint NULL;

-- Add index for package_id filtering
CREATE INDEX IF NOT EXISTS idx_client_timeline_events_package_id 
ON public.client_timeline_events(package_id) WHERE package_id IS NOT NULL;

-- Add index for source filtering (Microsoft filter chip)
CREATE INDEX IF NOT EXISTS idx_client_timeline_events_source 
ON public.client_timeline_events(source);

-- Drop existing function and recreate with new parameters
DROP FUNCTION IF EXISTS public.rpc_search_timeline_events(bigint, bigint, text, text[], integer, integer, timestamptz, timestamptz);

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
  p_package_id bigint DEFAULT NULL
)
RETURNS TABLE(
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
  package_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    e.package_id
  FROM public.client_timeline_events e
  WHERE e.tenant_id = p_tenant_id::integer
    AND e.client_id = p_client_id::text
    AND (p_from_date IS NULL OR e.occurred_at >= p_from_date)
    AND (p_to_date IS NULL OR e.occurred_at <= p_to_date)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
    AND (p_source IS NULL OR e.source = p_source)
    AND (p_package_id IS NULL OR e.package_id = p_package_id)
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

GRANT EXECUTE ON FUNCTION public.rpc_search_timeline_events(bigint, bigint, text, text[], integer, integer, timestamptz, timestamptz, text, bigint) TO authenticated;