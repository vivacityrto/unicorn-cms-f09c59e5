-- Prevent double-click/retry races from creating duplicate resend events.

CREATE OR REPLACE FUNCTION public.fn_invitation_sent_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.id::text, 0)
    );

    IF EXISTS (
      SELECT 1 FROM public.client_timeline_events e
      WHERE e.entity_type = 'user_invitation'
        AND e.entity_id = NEW.id::text
        AND e.event_type = 'invitation_sent'
        AND e.metadata->>'resend' = 'true'
        AND e.created_at >= clock_timestamp() - interval '1 minute'
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'invitation_sent',
    CASE WHEN TG_OP = 'INSERT'
      THEN format('Invitation sent to %s', NEW.email)
      ELSE format('Invitation resent to %s', NEW.email)
    END,
    NULL,
    'user_invitation',
    NEW.id::text,
    jsonb_build_object(
      'email', NEW.email,
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'unicorn_role', NEW.unicorn_role,
      'relationship_role', NEW.relationship_role,
      'resend', (TG_OP = 'UPDATE')
    ),
    COALESCE(NEW.last_sent_at, NEW.created_at, now()),
    COALESCE(auth.uid(), NEW.invited_by),
    'user'
  );

  RETURN NEW;
END;
$$;

-- Remove only resend rows created within one second of an earlier row for the
-- same invitation; legitimate resends remain separate timeline events.
WITH ordered AS (
  SELECT e.id, e.created_at,
    lag(e.created_at) OVER (
      PARTITION BY e.entity_id, e.event_type
      ORDER BY e.created_at, e.id
    ) AS previous_created_at
  FROM public.client_timeline_events e
  WHERE e.entity_type = 'user_invitation'
    AND e.event_type = 'invitation_sent'
    AND e.metadata->>'resend' = 'true'
), duplicates AS (
  SELECT id FROM ordered
  WHERE previous_created_at IS NOT NULL
    AND created_at - previous_created_at <= interval '1 second'
)
DELETE FROM public.client_timeline_events e
USING duplicates d
WHERE e.id = d.id;
