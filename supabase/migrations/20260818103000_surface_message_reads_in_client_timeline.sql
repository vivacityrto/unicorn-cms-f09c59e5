-- Project message-read activity into the staff-facing client timeline.
-- The original read-tracking RPC already records the audit history and each
-- broadcast recipient's first read time. Client Detail > Timeline and the
-- Client Activity dashboard consume client_timeline_events instead.

ALTER TABLE public.client_timeline_events
  DROP CONSTRAINT IF EXISTS timeline_valid_event_type;

ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_valid_event_type CHECK (event_type = ANY (ARRAY[
    'microsoft_connected', 'microsoft_disconnected', 'microsoft_sync_failed',
    'sharepoint_root_configured', 'sharepoint_root_invalid', 'sharepoint_doc_linked',
    'document_shared_to_client', 'document_uploaded', 'document_downloaded',
    'meeting_synced', 'meeting_attendance_imported', 'meeting_artifacts_captured',
    'minutes_draft_created', 'minutes_draft_updated', 'minutes_published_pdf',
    'tasks_created_from_minutes', 'task_completed_team', 'task_completed_client',
    'action_item_created', 'action_item_updated', 'action_item_completed', 'action_item_comment',
    'email_linked', 'email_attachment_saved', 'email_sent', 'email_failed',
    'note_added', 'note_created', 'note_pinned', 'note_unpinned', 'structured_note_added',
    'time_posted', 'time_ignored', 'time_reallocated',
    'account_invited', 'account_activated', 'account_deactivated', 'account_role_changed', 'account_removed',
    'client_login', 'message_sent', 'message_read',
    'academy_enrolled', 'academy_lesson_completed', 'academy_certificate_issued', 'academy_course_published',
    'stage_status_changed', 'package_status_changed', 'portal_activity_summary', 'tenant_status_changed',
    'invitation_sent', 'invitation_opened', 'invitation_clicked', 'invitation_bounced', 'invitation_accepted',
    'xero_invoice_paid', 'xero_invoice_issued', 'audit_created', 'audit_completed'
  ]));

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
  v_broadcast_campaign_id uuid;
BEGIN
  SELECT tc.tenant_id, tc.last_message_at, cp.last_read_at
    INTO v_tenant_id, v_last_message_at, v_last_read_at
  FROM public.tenant_conversations tc
  JOIN public.conversation_participants cp ON cp.conversation_id = tc.id
  WHERE tc.id = p_conversation_id AND cp.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found or not accessible';
  END IF;

  v_was_unread := v_last_message_at IS NOT NULL
    AND (v_last_read_at IS NULL OR v_last_read_at < v_last_message_at);

  -- Capture a broadcast first-read before marking the recipient row, so the
  -- activity event can name the read as a broadcast without a second lookup.
  SELECT campaign_id
    INTO v_broadcast_campaign_id
  FROM public.broadcast_recipients
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
    AND delivery_status = 'sent'
    AND read_at IS NULL
  LIMIT 1;

  UPDATE public.conversation_participants
  SET last_read_at = v_read_at
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  IF v_was_unread THEN
    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, details
    ) VALUES (
      v_tenant_id, auth.uid(), 'message:read', 'tenant_conversations', p_conversation_id::text,
      jsonb_build_object('conversation_id', p_conversation_id, 'read_at', v_read_at)
    );

    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, created_by, source, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, visibility, dedupe_key
    ) VALUES (
      v_tenant_id, v_tenant_id::text, auth.uid(), 'user', 'message_read',
      CASE WHEN v_broadcast_campaign_id IS NULL THEN 'Message read' ELSE 'Broadcast message read' END,
      CASE WHEN v_broadcast_campaign_id IS NULL THEN 'A client user read a message.' ELSE 'A client user read a broadcast message.' END,
      'tenant_conversations', p_conversation_id::text,
      jsonb_build_object(
        'conversation_id', p_conversation_id,
        'campaign_id', v_broadcast_campaign_id,
        'read_at', v_read_at
      ),
      v_read_at, 'internal', 'message-read:' || p_conversation_id::text || ':' || auth.uid()::text || ':' || v_read_at::text
    );
  END IF;

  UPDATE public.broadcast_recipients
  SET read_at = v_read_at
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
    AND delivery_status = 'sent'
    AND read_at IS NULL;

  IF v_broadcast_campaign_id IS NOT NULL THEN
    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, details
    ) VALUES (
      v_tenant_id, auth.uid(), 'broadcast:read', 'broadcast_campaigns', v_broadcast_campaign_id::text,
      jsonb_build_object(
        'campaign_id', v_broadcast_campaign_id,
        'conversation_id', p_conversation_id,
        'read_at', v_read_at
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mark_conversation_read(uuid) TO authenticated;
