-- RPC function to get action items assigned to a user across all clients
CREATE OR REPLACE FUNCTION public.rpc_get_my_action_items(
  p_user_id uuid,
  p_status_filter text DEFAULT 'open',
  p_include_overdue boolean DEFAULT true
)
RETURNS TABLE (
  action_item_id uuid,
  client_id text,
  client_name text,
  tenant_id bigint,
  title text,
  description text,
  due_date date,
  priority text,
  status text,
  source text,
  related_entity_type text,
  related_entity_id text,
  created_at timestamptz,
  is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Return action items assigned to the user
  RETURN QUERY
  SELECT 
    ai.id AS action_item_id,
    ai.client_id,
    COALESCE(t.name, 'Unknown Client') AS client_name,
    ai.tenant_id::bigint,
    ai.title,
    ai.description,
    ai.due_date,
    ai.priority,
    ai.status,
    ai.source,
    ai.related_entity_type,
    ai.related_entity_id,
    ai.created_at,
    CASE 
      WHEN ai.due_date IS NOT NULL 
        AND ai.due_date < CURRENT_DATE 
        AND ai.status NOT IN ('done', 'cancelled')
      THEN true
      ELSE false
    END AS is_overdue
  FROM public.client_action_items ai
  LEFT JOIN public.tenants t ON t.id = ai.tenant_id
  WHERE ai.owner_user_id = p_user_id
    AND (
      CASE 
        WHEN p_status_filter = 'all' THEN true
        WHEN p_status_filter = 'open' THEN ai.status IN ('open', 'in_progress', 'blocked')
        WHEN p_status_filter = 'overdue' THEN 
          ai.due_date < CURRENT_DATE 
          AND ai.status NOT IN ('done', 'cancelled')
        ELSE ai.status = p_status_filter
      END
    )
  ORDER BY 
    -- Overdue first
    CASE WHEN ai.due_date < CURRENT_DATE AND ai.status NOT IN ('done', 'cancelled') THEN 0 ELSE 1 END,
    -- Then by due date
    ai.due_date NULLS LAST,
    -- Then by priority
    CASE ai.priority 
      WHEN 'urgent' THEN 0 
      WHEN 'high' THEN 1 
      WHEN 'normal' THEN 2 
      WHEN 'low' THEN 3 
      ELSE 4 
    END,
    ai.created_at DESC;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_get_my_action_items(uuid, text, boolean) TO authenticated;

-- Add index to improve query performance if not exists
CREATE INDEX IF NOT EXISTS idx_client_action_items_owner_status 
ON public.client_action_items(owner_user_id, status, due_date);