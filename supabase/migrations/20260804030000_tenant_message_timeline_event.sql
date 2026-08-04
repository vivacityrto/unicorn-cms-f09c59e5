-- Timeline expansion Phase C: surface client <-> CSC messages on the client
-- Timeline as client-visible events. tenant_messages.tenant_id is single-valued
-- and NOT NULL on every row (no multi-tenant conversations exist), so there is
-- no ambiguity to resolve here, unlike login/academy attribution.
--
-- Client-visible events must carry source='unicorn' per the existing
-- timeline_client_unicorn_only CHECK constraint.

-- 0) Drop a stale CHECK constraint left over from the original table creation
-- (20260107054614) that was never dropped when timeline_valid_source widened
-- the allowed values to include 'unicorn'/'microsoft'. Postgres enforces all
-- CHECK constraints simultaneously, so this leftover silently blocked EVERY
-- insert with source='unicorn' or 'microsoft' since the table was created —
-- confirmed zero such rows exist in production. This has been blocking not
-- just client-visible events (this phase) but the Microsoft integration's
-- timeline events too. timeline_valid_source (added 20260210082835) is the
-- current, intentionally-widened constraint and stays.
ALTER TABLE public.client_timeline_events
  DROP CONSTRAINT IF EXISTS client_timeline_events_source_check;

-- 1) Extend the event_type CHECK constraint.
ALTER TABLE public.client_timeline_events
  DROP CONSTRAINT IF EXISTS timeline_valid_event_type;

ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_valid_event_type
  CHECK (event_type IN (
    'microsoft_connected','microsoft_disconnected','microsoft_sync_failed',
    'sharepoint_root_configured','sharepoint_root_invalid','sharepoint_doc_linked',
    'document_shared_to_client','document_uploaded','document_downloaded',
    'meeting_synced','meeting_attendance_imported','meeting_artifacts_captured',
    'minutes_draft_created','minutes_draft_updated','minutes_published_pdf',
    'tasks_created_from_minutes','task_completed_team','task_completed_client',
    'action_item_created','action_item_updated','action_item_completed',
    'email_linked','email_attachment_saved','email_sent','email_failed',
    'note_added','note_created','note_pinned','note_unpinned',
    'time_posted','time_ignored',
    'account_invited','account_activated','account_deactivated',
    'account_role_changed','account_removed',
    'structured_note_added',
    'client_login',
    'message_sent'
  ));

-- 2) Trigger function: one client_timeline_events row per tenant_messages insert.
CREATE OR REPLACE FUNCTION public.fn_tenant_message_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_name text;
  v_conversation_subject text;
  v_conversation_type text;
BEGIN
  SELECT subject, type INTO v_conversation_subject, v_conversation_type
    FROM public.tenant_conversations
   WHERE id = NEW.conversation_id;

  IF NEW.sender_type IN ('client', 'staff') THEN
    SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
      INTO v_sender_name
      FROM public.users
     WHERE user_uuid = NEW.sender_user_uuid;
  END IF;

  v_sender_name := COALESCE(
    v_sender_name,
    CASE NEW.sender_type
      WHEN 'bot' THEN 'Viv Assistant'
      WHEN 'system' THEN 'System'
      ELSE 'Someone'
    END
  );

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body, visibility, source,
    entity_type, entity_id, metadata, occurred_at, created_by
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'message_sent',
    format('%s sent a message', v_sender_name),
    NEW.body,
    'client',
    'unicorn',
    'tenant_conversation',
    NEW.conversation_id::text,
    jsonb_build_object(
      'sender_type', NEW.sender_type,
      'conversation_subject', v_conversation_subject,
      'conversation_type', v_conversation_type,
      'message_id', NEW.id
    ),
    NEW.created_at,
    NEW.sender_user_uuid
  );
  RETURN NEW;
END;
$$;

-- 3) Trigger — alongside the existing audit + conversation-touch triggers on tenant_messages.
DROP TRIGGER IF EXISTS trg_tenant_message_timeline ON public.tenant_messages;
CREATE TRIGGER trg_tenant_message_timeline
  AFTER INSERT ON public.tenant_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tenant_message_timeline_trigger();

-- 4) Trigger-only SECURITY DEFINER function — revoke direct execute.
REVOKE EXECUTE ON FUNCTION public.fn_tenant_message_timeline_trigger() FROM anon, authenticated, PUBLIC;
