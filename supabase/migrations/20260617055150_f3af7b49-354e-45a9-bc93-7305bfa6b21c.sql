
CREATE OR REPLACE FUNCTION public.rpc_get_inbox_items(
  p_user_id         uuid,
  p_limit           integer DEFAULT 100,
  p_offset          integer DEFAULT 0,
  p_item_type       text    DEFAULT NULL,
  p_tenant_id       integer DEFAULT NULL,
  p_action_required boolean DEFAULT NULL
)
RETURNS TABLE (
  inbox_id          uuid,
  tenant_id         bigint,
  user_id           uuid,
  item_type         text,
  item_source       text,
  source_id         text,
  title             text,
  preview           text,
  status            text,
  due_at            timestamptz,
  priority          integer,
  unread            boolean,
  action_required   boolean,
  related_entity    text,
  related_entity_id text,
  created_at        timestamptz,
  updated_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id                                              AS inbox_id,
    t.tenant_id                                       AS tenant_id,
    t.assigned_to_user_id                             AS user_id,
    'ticket'::text                                    AS item_type,
    'email_tickets'::text                             AS item_source,
    t.id::text                                        AS source_id,
    t.subject                                         AS title,
    (COALESCE(t.sender_name,'') || ' <' || COALESCE(t.sender_email,'') || '>') AS preview,
    t.status                                          AS status,
    t.response_due_at                                 AS due_at,
    CASE WHEN t.urgent THEN 1 ELSE 2 END              AS priority,
    true                                              AS unread,
    (COALESCE(t.urgent,false) OR COALESCE(t.sla_breached,false)) AS action_required,
    'email_ticket'::text                              AS related_entity,
    t.id::text                                        AS related_entity_id,
    t.received_at                                     AS created_at,
    t.updated_at                                      AS updated_at
  FROM public.email_tickets t
  WHERE t.assigned_to_user_id = p_user_id
    AND t.status IS DISTINCT FROM 'closed'
    AND (p_item_type IS NULL OR p_item_type = 'ticket')
    AND (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id::bigint)
    AND (
      p_action_required IS NULL
      OR p_action_required = false
      OR (COALESCE(t.urgent,false) OR COALESCE(t.sla_breached,false))
    )
  ORDER BY (CASE WHEN t.urgent THEN 1 ELSE 2 END) ASC,
           t.response_due_at ASC NULLS LAST
  LIMIT  GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0)
$$;

REVOKE ALL ON FUNCTION public.rpc_get_inbox_items(uuid,integer,integer,text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_inbox_items(uuid,integer,integer,text,integer,boolean) TO authenticated;
