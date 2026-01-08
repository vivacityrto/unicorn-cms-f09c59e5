-- Add client_id column to email_send_log
ALTER TABLE public.email_send_log 
ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.tenants(id);

-- Add from_email column if not exists
ALTER TABLE public.email_send_log 
ADD COLUMN IF NOT EXISTS from_email text;

-- Add provider column if not exists  
ALTER TABLE public.email_send_log 
ADD COLUMN IF NOT EXISTS provider text DEFAULT 'mailgun';

-- Add bcc_emails column if not exists
ALTER TABLE public.email_send_log 
ADD COLUMN IF NOT EXISTS bcc_emails text[] DEFAULT '{}';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_send_log_client 
ON public.email_send_log(tenant_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_status 
ON public.email_send_log(tenant_id, status, created_at DESC);

-- Create trigger function to insert timeline event on email send
CREATE OR REPLACE FUNCTION public.fn_email_send_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_title text;
  v_body text;
BEGIN
  -- Only create timeline event if client_id is set
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Determine event type based on status
  IF NEW.status = 'sent' THEN
    v_event_type := 'email_sent';
    v_title := 'Email sent: ' || COALESCE(LEFT(NEW.subject, 80), 'No subject');
  ELSE
    v_event_type := 'email_failed';
    v_title := 'Email failed: ' || COALESCE(LEFT(NEW.subject, 80), 'No subject');
  END IF;
  
  -- Build body preview
  v_body := 'To: ' || COALESCE(NEW.to_email, '');
  IF NEW.error_message IS NOT NULL AND NEW.status != 'sent' THEN
    v_body := v_body || E'\nError: ' || LEFT(NEW.error_message, 200);
  END IF;
  
  -- Insert timeline event using the helper RPC
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
    NEW.tenant_id,
    NEW.client_id,
    v_event_type,
    v_title,
    v_body,
    'email',
    NEW.id::text,
    jsonb_build_object(
      'email_log_id', NEW.id,
      'to', string_to_array(NEW.to_email, ','),
      'cc', COALESCE(NEW.cc_emails, ARRAY[]::text[]),
      'bcc', COALESCE(NEW.bcc_emails, ARRAY[]::text[]),
      'template_id', NEW.email_template_id,
      'package_id', NEW.package_id,
      'stage_id', NEW.stage_id,
      'status', NEW.status,
      'error_message', NEW.error_message,
      'subject', NEW.subject
    ),
    COALESCE(NEW.sent_at, NEW.created_at),
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on email_send_log insert
DROP TRIGGER IF EXISTS trg_email_send_timeline ON public.email_send_log;
CREATE TRIGGER trg_email_send_timeline
AFTER INSERT ON public.email_send_log
FOR EACH ROW
EXECUTE FUNCTION public.fn_email_send_timeline_trigger();

-- Add email_failed to timeline event types filter (for UI reference)
COMMENT ON TABLE public.client_timeline_events IS 'Event types: meeting_synced, time_posted, time_ignored, email_sent, email_failed, document_uploaded, document_downloaded, task_completed_team, task_completed_client, note_added, note_pinned, note_unpinned';