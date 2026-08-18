-- Track the first time each intended broadcast recipient reads its conversation.
ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS read_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign_read_at
  ON public.broadcast_recipients (campaign_id, read_at);

CREATE OR REPLACE FUNCTION public.fn_mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint;
  v_last_message_at timestamptz;
  v_last_read_at timestamptz;
  v_read_at timestamptz := now();
  v_was_unread boolean := false;
BEGIN
  SELECT tc.tenant_id, tc.last_message_at, cp.last_read_at INTO v_tenant_id, v_last_message_at, v_last_read_at
  FROM public.tenant_conversations tc JOIN public.conversation_participants cp ON cp.conversation_id = tc.id
  WHERE tc.id = p_conversation_id AND cp.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or not accessible'; END IF;
  v_was_unread := v_last_message_at IS NOT NULL AND (v_last_read_at IS NULL OR v_last_read_at < v_last_message_at);
  UPDATE public.conversation_participants SET last_read_at = v_read_at WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
  IF v_was_unread THEN
    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (v_tenant_id, auth.uid(), 'message:read', 'tenant_conversations', p_conversation_id::text, jsonb_build_object('conversation_id', p_conversation_id, 'read_at', v_read_at));
  END IF;
  WITH newly_read AS (
    UPDATE public.broadcast_recipients SET read_at = v_read_at
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid() AND delivery_status = 'sent' AND read_at IS NULL
    RETURNING campaign_id, tenant_id
  )
  INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
  SELECT tenant_id, auth.uid(), 'broadcast:read', 'broadcast_campaigns', campaign_id::text,
    jsonb_build_object('campaign_id', campaign_id, 'conversation_id', p_conversation_id, 'read_at', v_read_at)
  FROM newly_read;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mark_conversation_read(uuid) TO authenticated;
