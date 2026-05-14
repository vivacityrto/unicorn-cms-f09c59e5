-- Phase 2: Migrate notification_event_type enum columns to text + FK to dd_notification_event

-- 1. Pre-flight integrity check
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(DISTINCT et, ', ') INTO v_missing
  FROM (
    SELECT event_type::text AS et FROM public.notification_rules
    UNION
    SELECT event_type::text FROM public.notification_outbox
    UNION
    SELECT event_type::text FROM public.notification_audit_log
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dd_notification_event d WHERE d.value = s.et
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 aborted: event_type values not present in dd_notification_event: %', v_missing;
  END IF;
END$$;

-- 2. Drop existing function (enum-typed signature)
DROP FUNCTION IF EXISTS public.emit_notification(
  public.notification_event_type, uuid, text, uuid, jsonb, integer, integer
);

-- 3. Alter columns enum -> text
ALTER TABLE public.notification_rules
  ALTER COLUMN event_type TYPE text USING event_type::text;
ALTER TABLE public.notification_outbox
  ALTER COLUMN event_type TYPE text USING event_type::text;
ALTER TABLE public.notification_audit_log
  ALTER COLUMN event_type TYPE text USING event_type::text;

-- 4. Add FKs to dd_notification_event(value)
ALTER TABLE public.notification_rules
  ADD CONSTRAINT fk_notification_rules_event_type
  FOREIGN KEY (event_type) REFERENCES public.dd_notification_event(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT fk_notification_outbox_event_type
  FOREIGN KEY (event_type) REFERENCES public.dd_notification_event(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.notification_audit_log
  ADD CONSTRAINT fk_notification_audit_log_event_type
  FOREIGN KEY (event_type) REFERENCES public.dd_notification_event(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- 5. Recreate emit_notification with text signature
CREATE OR REPLACE FUNCTION public.emit_notification(
  p_event_type text,
  p_recipient_user_uuid uuid,
  p_record_type text,
  p_record_id uuid,
  p_payload jsonb,
  p_tenant_id integer DEFAULT NULL,
  p_client_id integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notification_id uuid;
  v_rule_enabled boolean;
BEGIN
  -- Validate event_type against lookup
  IF NOT EXISTS (
    SELECT 1 FROM public.dd_notification_event
    WHERE value = p_event_type AND is_active
  ) THEN
    RAISE EXCEPTION 'Unknown or inactive notification event_type: %', p_event_type;
  END IF;

  SELECT is_enabled INTO v_rule_enabled
  FROM public.notification_rules
  WHERE user_uuid = p_recipient_user_uuid
    AND event_type = p_event_type;

  IF v_rule_enabled IS NULL THEN
    v_rule_enabled := true;
  END IF;

  IF v_rule_enabled THEN
    INSERT INTO public.notification_outbox (
      event_type,
      tenant_id,
      client_id,
      record_type,
      record_id,
      recipient_user_uuid,
      payload,
      status
    ) VALUES (
      p_event_type,
      p_tenant_id,
      p_client_id,
      p_record_type,
      p_record_id,
      p_recipient_user_uuid,
      p_payload,
      'queued'
    )
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
  END IF;

  RETURN NULL;
END;
$$;

-- 6. Restore EXECUTE grant (matches prior PUBLIC grant)
GRANT EXECUTE ON FUNCTION public.emit_notification(
  text, uuid, text, uuid, jsonb, integer, integer
) TO PUBLIC;