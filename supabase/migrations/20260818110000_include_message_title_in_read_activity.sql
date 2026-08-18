-- Make message-read activity actionable by identifying the conversation that
-- was read, not only the reader.

CREATE OR REPLACE FUNCTION public.fn_mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint;
  v_subject text;
  v_last_message_at timestamptz;
  v_last_read_at timestamptz;
  v_read_at timestamptz := now();
  v_was_unread boolean := false;
  v_broadcast_campaign_id uuid;
  v_actor_name text;
BEGIN
  SELECT tc.tenant_id, tc.subject, tc.last_message_at, cp.last_read_at
    INTO v_tenant_id, v_subject, v_last_message_at, v_last_read_at
  FROM public.tenant_conversations tc
  JOIN public.conversation_participants cp ON cp.conversation_id = tc.id
  WHERE tc.id = p_conversation_id AND cp.user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found or not accessible'; END IF;

  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), full_name, email, 'A client user')
    INTO v_actor_name
  FROM public.users
  WHERE user_uuid = auth.uid();

  v_was_unread := v_last_message_at IS NOT NULL
    AND (v_last_read_at IS NULL OR v_last_read_at < v_last_message_at);

  SELECT campaign_id INTO v_broadcast_campaign_id
  FROM public.broadcast_recipients
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    AND delivery_status = 'sent' AND read_at IS NULL
  LIMIT 1;

  UPDATE public.conversation_participants
  SET last_read_at = v_read_at
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  IF v_was_unread THEN
    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (v_tenant_id, auth.uid(), 'message:read', 'tenant_conversations', p_conversation_id::text,
      jsonb_build_object('conversation_id', p_conversation_id, 'read_at', v_read_at));

    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, created_by, source, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, visibility, dedupe_key
    ) VALUES (
      v_tenant_id, v_tenant_id::text, auth.uid(), 'user', 'message_read',
      CASE WHEN v_broadcast_campaign_id IS NULL THEN 'Message read' ELSE 'Broadcast message read' END,
      v_actor_name || ' read ' || CASE WHEN v_broadcast_campaign_id IS NULL THEN '' ELSE 'broadcast ' END
        || '"' || COALESCE(NULLIF(v_subject, ''), 'a message') || '".',
      'tenant_conversations', p_conversation_id::text,
      jsonb_build_object('conversation_id', p_conversation_id, 'campaign_id', v_broadcast_campaign_id, 'read_at', v_read_at, 'reader_name', v_actor_name, 'message_title', v_subject),
      v_read_at, 'internal', 'message-read:' || p_conversation_id::text || ':' || auth.uid()::text || ':' || v_read_at::text
    );
  END IF;

  UPDATE public.broadcast_recipients
  SET read_at = v_read_at
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    AND delivery_status = 'sent' AND read_at IS NULL;

  IF v_broadcast_campaign_id IS NOT NULL THEN
    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (v_tenant_id, auth.uid(), 'broadcast:read', 'broadcast_campaigns', v_broadcast_campaign_id::text,
      jsonb_build_object('campaign_id', v_broadcast_campaign_id, 'conversation_id', p_conversation_id, 'read_at', v_read_at));
  END IF;
END;
$$;

UPDATE public.client_timeline_events AS event
SET body = COALESCE(event.metadata->>'reader_name', (
      SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', user_record.first_name, user_record.last_name)), ''), user_record.full_name, user_record.email)
      FROM public.users AS user_record
      WHERE user_record.user_uuid = event.created_by
    ), 'A client user')
    || ' read ' || CASE WHEN event.metadata->>'campaign_id' IS NULL THEN '' ELSE 'broadcast ' END
    || '"' || COALESCE(NULLIF(conversation.subject, ''), 'a message') || '".',
    metadata = event.metadata || jsonb_build_object('message_title', conversation.subject)
FROM public.tenant_conversations AS conversation
WHERE event.event_type = 'message_read'
  AND event.entity_type = 'tenant_conversations'
  AND event.entity_id = conversation.id::text;

REVOKE ALL ON FUNCTION public.fn_mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mark_conversation_read(uuid) TO authenticated;
