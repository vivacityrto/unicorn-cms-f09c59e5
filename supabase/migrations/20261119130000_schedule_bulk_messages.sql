-- migration-target-project: yxkgdalkbrriasiyyrwk
ALTER TABLE public.broadcast_campaigns
  ADD COLUMN scheduled_category_id uuid REFERENCES public.message_categories(id) ON DELETE SET NULL,
  ADD COLUMN scheduled_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN schedule_failure_reason text,
  DROP CONSTRAINT broadcast_campaigns_target_mode_check,
  ADD CONSTRAINT broadcast_campaigns_target_mode_check
    CHECK (target_mode IN ('everyone', 'members', 'tier', 'package_type', 'superhero')),
  DROP CONSTRAINT broadcast_campaigns_status_check,
  ADD CONSTRAINT broadcast_campaigns_status_check
    CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'cancelled', 'scheduled', 'failed'));

CREATE INDEX broadcast_campaigns_due_idx ON public.broadcast_campaigns (scheduled_for, id)
  WHERE status = 'scheduled';

-- Direct writes remain available for immediate messages only.
CREATE POLICY bc_schedule_insert_guard ON public.broadcast_campaigns
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (scheduled_for IS NULL AND status NOT IN ('scheduled', 'failed')
    AND scheduled_category_id IS NULL AND scheduled_attachments = '[]'::jsonb
    AND schedule_failure_reason IS NULL);
CREATE POLICY bc_schedule_update_guard ON public.broadcast_campaigns
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (scheduled_for IS NULL)
  WITH CHECK (scheduled_for IS NULL AND status NOT IN ('scheduled', 'failed')
    AND scheduled_category_id IS NULL AND scheduled_attachments = '[]'::jsonb
    AND schedule_failure_reason IS NULL);

CREATE POLICY br_schedule_insert_guard ON public.broadcast_recipients
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.broadcast_campaigns c WHERE c.id = campaign_id AND c.scheduled_for IS NULL
  ));
CREATE POLICY br_schedule_update_guard ON public.broadcast_recipients
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.broadcast_campaigns c WHERE c.id = campaign_id AND c.scheduled_for IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.broadcast_campaigns c WHERE c.id = campaign_id AND c.scheduled_for IS NULL
  ));

CREATE FUNCTION public.fn_resolve_broadcast_recipients(
  p_target_mode text, p_package_type text, p_include_roles text[]
)
RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT DISTINCT ON (tu.user_id)
    t.id AS tenant_id,
    tu.user_id,
    t.name AS tenant_name
  FROM public.tenants t
  JOIN public.tenant_users tu ON tu.tenant_id = t.id
  WHERE
    t.id != 6372
    AND t.status = 'active'
    AND (
      tu.role = ANY(p_include_roles)
      OR tu.relationship_role = ANY(p_include_roles)
    )
    AND tu.access_scope = 'full'
    AND (
      CASE p_target_mode
        WHEN 'everyone' THEN true
        WHEN 'members' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = 'membership'
        )
        -- Same package IDs used by the Superhero Membership Dashboard.
        WHEN 'superhero' THEN EXISTS (
          SELECT 1 FROM public.package_instances pi
          WHERE pi.tenant_id = t.id AND pi.is_complete = false
            AND pi.package_id IN (29, 16, 3, 22, 39, 13, 5, 24, 40)
        )
        WHEN 'tier' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = 'membership'
            AND lower(p.name) LIKE
              CASE lower(coalesce(p_package_type, ''))
                WHEN 'diamond'  THEN 'm-d%'
                WHEN 'gold'     THEN 'm-g%'
                WHEN 'ruby'     THEN 'm-r%'
                WHEN 'sapphire' THEN 'm-sa%'
                WHEN 'amethyst' THEN 'm-am%'
                ELSE '__no_match__'
              END
        )
        WHEN 'package_type' THEN EXISTS (
          SELECT 1
          FROM public.package_instances pi
          JOIN public.packages p ON p.id = pi.package_id
          WHERE pi.tenant_id = t.id
            AND pi.is_complete = false
            AND p.package_type = p_package_type
        )
        ELSE false
      END
    )
  ORDER BY tu.user_id, t.id;
$$;

CREATE OR REPLACE FUNCTION public.fn_preview_broadcast_recipients(
  p_target_mode text, p_package_type text DEFAULT NULL, p_include_roles text[] DEFAULT ARRAY['parent']
)
RETURNS TABLE(tenant_id bigint, user_id uuid, tenant_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(public.is_vivacity_team_safe(auth.uid()), false) THEN
    RAISE EXCEPTION 'Access denied: Vivacity staff access required';
  END IF;
  RETURN QUERY SELECT * FROM public.fn_resolve_broadcast_recipients(p_target_mode, p_package_type, p_include_roles);
END;
$$;

CREATE FUNCTION public.fn_schedule_bulk_message(
  p_campaign_id uuid, p_title text, p_body text, p_target_mode text,
  p_package_type text, p_scheduled_for timestamptz, p_category_id uuid, p_attachments jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  recipient_roles text[] := ARRAY['parent', 'user'];
  saved_time timestamptz;
  attachment_count integer;
  attachments jsonb;
BEGIN
  IF NOT coalesce(public.is_vivacity_team_safe(actor), false)
     OR NOT coalesce(public.check_permission(actor, 'admin.broadcast.send', 'full'), false) THEN
    RAISE EXCEPTION 'Insufficient permissions to schedule a bulk message' USING ERRCODE = '42501';
  END IF;

  -- Return the saved schedule when a request is retried after a lost response.
  SELECT scheduled_for INTO saved_time FROM public.broadcast_campaigns
  WHERE id = p_campaign_id AND created_by = actor;
  IF saved_time IS NOT NULL THEN
    RETURN saved_time;
  END IF;

  IF p_scheduled_for IS NULL OR NOT isfinite(p_scheduled_for) OR p_scheduled_for <= clock_timestamp() THEN
    RAISE EXCEPTION 'Choose a send date and time in the future';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL OR length(p_title) > 120 OR nullif(btrim(p_body), '') IS NULL THEN
    RAISE EXCEPTION 'A valid title and message are required';
  END IF;
  IF jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid attachments';
  END IF;
  IF jsonb_array_length(p_attachments) > 5 THEN
    RAISE EXCEPTION 'A maximum of five attachments is allowed';
  END IF;

  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
    'storage_path', o.name, 'filename', a.filename,
    'mime_type', o.metadata->>'mimetype', 'file_size', (o.metadata->>'size')::integer
  )), '[]'::jsonb)
  INTO attachment_count, attachments
  FROM jsonb_to_recordset(p_attachments) AS a(storage_path text, filename text)
  JOIN storage.objects o ON o.bucket_id = 'message-attachments' AND o.name = a.storage_path
  WHERE split_part(o.name, '/', 1) = 'broadcast'
    AND split_part(o.name, '/', 2) = p_campaign_id::text
    AND split_part(o.name, '/', 3) <> '' AND split_part(o.name, '/', 4) = ''
    AND nullif(btrim(a.filename), '') IS NOT NULL
    AND (o.metadata->>'size')::bigint BETWEEN 0 AND 10485760;
  IF attachment_count <> jsonb_array_length(p_attachments) THEN
    RAISE EXCEPTION 'One or more attachments could not be verified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_resolve_broadcast_recipients(p_target_mode, p_package_type, recipient_roles)
  ) THEN
    RAISE EXCEPTION 'No recipients currently match the selected audience';
  END IF;

  INSERT INTO public.broadcast_campaigns (
    id, title, body, target_mode, package_type, include_roles, status, scheduled_for,
    created_by, scheduled_category_id, scheduled_attachments
  ) VALUES (
    p_campaign_id, btrim(p_title), btrim(p_body), p_target_mode, p_package_type, recipient_roles,
    'scheduled', p_scheduled_for, actor, p_category_id, attachments
  )
  ON CONFLICT (id) DO NOTHING RETURNING scheduled_for INTO saved_time;

  IF FOUND THEN
    INSERT INTO public.client_audit_log (actor_user_id, action, entity_type, entity_id, details)
    VALUES (actor, 'broadcast:schedule', 'broadcast_campaigns', p_campaign_id,
      jsonb_build_object('scheduled_for', saved_time, 'target_mode', p_target_mode));
  ELSE
    SELECT scheduled_for INTO STRICT saved_time FROM public.broadcast_campaigns
    WHERE id = p_campaign_id AND created_by = actor AND scheduled_for IS NOT NULL;
  END IF;
  RETURN saved_time;
END;
$$;

CREATE FUNCTION public.fn_cancel_scheduled_bulk_message(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF NOT coalesce(public.is_vivacity_team_safe(actor), false)
     OR NOT coalesce(public.check_permission(actor, 'admin.broadcast.send', 'full'), false) THEN
    RAISE EXCEPTION 'Insufficient permissions to cancel a bulk message' USING ERRCODE = '42501';
  END IF;

  UPDATE public.broadcast_campaigns SET status = 'cancelled' WHERE id = p_campaign_id AND status = 'scheduled';
  IF FOUND THEN
    INSERT INTO public.client_audit_log (actor_user_id, action, entity_type, entity_id)
    VALUES (actor, 'broadcast:cancel', 'broadcast_campaigns', p_campaign_id);
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.broadcast_campaigns WHERE id = p_campaign_id AND status = 'cancelled' AND scheduled_for IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This bulk message is no longer scheduled';
  END IF;
END;
$$;

CREATE FUNCTION public.fn_deliver_scheduled_bulk_messages()
RETURNS void
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  campaign public.broadcast_campaigns%ROWTYPE;
  client_id bigint;
  conversation uuid;
  message uuid;
  total integer;
  sent integer;
  failed integer;
  reason text;
BEGIN
  FOR campaign IN
    SELECT * FROM public.broadcast_campaigns
    WHERE status = 'scheduled' AND scheduled_for <= statement_timestamp()
    ORDER BY scheduled_for, id LIMIT 3 FOR UPDATE SKIP LOCKED
  LOOP
    reason := NULL;
    total := 0;
    IF NOT coalesce(public.is_vivacity_team_safe(campaign.created_by), false)
       OR NOT coalesce(public.check_permission(campaign.created_by, 'admin.broadcast.send', 'full'), false)
       OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = campaign.created_by) THEN
      reason := 'The sender no longer has permission to send bulk messages.';
    ELSIF EXISTS (
      SELECT 1 FROM jsonb_array_elements(campaign.scheduled_attachments) a
      WHERE NOT EXISTS (
        SELECT 1 FROM storage.objects WHERE bucket_id = 'message-attachments' AND name = a->>'storage_path'
      )
    ) THEN
      reason := 'A scheduled attachment is no longer available.';
    ELSE
      INSERT INTO public.broadcast_recipients (campaign_id, tenant_id, user_id)
      SELECT campaign.id, r.tenant_id, r.user_id
      FROM public.fn_resolve_broadcast_recipients(campaign.target_mode, campaign.package_type, campaign.include_roles) r;
      GET DIAGNOSTICS total = ROW_COUNT;
      IF total = 0 THEN
        reason := 'No eligible recipients matched the audience at send time.';
      END IF;
    END IF;

    UPDATE public.broadcast_recipients r
    SET delivery_status = 'failed', failure_reason = 'Recipient does not have an active sign-in account.'
    WHERE r.campaign_id = campaign.id AND r.delivery_status = 'queued'
      AND NOT EXISTS (
        SELECT 1 FROM auth.users a JOIN public.users u ON u.user_uuid = a.id
        WHERE a.id = r.user_id AND NOT coalesce(u.archived, false) AND NOT coalesce(u.disabled, false)
      );

    FOR client_id IN
      SELECT DISTINCT tenant_id FROM public.broadcast_recipients
      WHERE campaign_id = campaign.id AND delivery_status = 'queued' AND reason IS NULL
    LOOP
      -- A failed tenant transaction leaves no message, participants or notifications.
      BEGIN
        INSERT INTO public.tenant_conversations (tenant_id, topic, type, subject, created_by_user_uuid, status)
        VALUES (client_id, 'general', 'broadcast', campaign.title, campaign.created_by, 'open')
        RETURNING id INTO conversation;

        INSERT INTO public.conversation_participants (conversation_id, user_id, role, last_read_at)
        VALUES (conversation, campaign.created_by, 'staff', now());

        INSERT INTO public.conversation_participants (conversation_id, user_id, role)
        SELECT conversation, user_id, 'client' FROM public.broadcast_recipients
        WHERE campaign_id = campaign.id AND tenant_id = client_id AND delivery_status = 'queued'
        ON CONFLICT (conversation_id, user_id) DO NOTHING;

        INSERT INTO public.tenant_messages (conversation_id, tenant_id, sender_user_uuid, sender_type, body, category_id)
        VALUES (conversation, client_id, campaign.created_by, 'staff', campaign.body, campaign.scheduled_category_id)
        RETURNING id INTO message;

        INSERT INTO public.tenant_message_attachments (message_id, storage_path, filename, mime_type, file_size)
        SELECT message, a.storage_path, a.filename, a.mime_type, a.file_size
        FROM jsonb_to_recordset(campaign.scheduled_attachments)
          AS a(storage_path text, filename text, mime_type text, file_size integer);

        UPDATE public.broadcast_recipients
        SET delivery_status = 'sent', sent_at = now(), conversation_id = conversation
        WHERE campaign_id = campaign.id AND tenant_id = client_id AND delivery_status = 'queued';
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Scheduled broadcast % tenant % failed: %', campaign.id, client_id, SQLERRM;
        UPDATE public.broadcast_recipients
        SET delivery_status = 'failed', failure_reason = 'Delivery failed for this client.'
        WHERE campaign_id = campaign.id AND tenant_id = client_id AND delivery_status = 'queued';
      END;
    END LOOP;

    SELECT count(*) FILTER (WHERE delivery_status = 'sent'), count(*) FILTER (WHERE delivery_status = 'failed')
    INTO sent, failed FROM public.broadcast_recipients WHERE campaign_id = campaign.id;

    IF sent = 0 AND reason IS NULL THEN
      reason := 'Delivery failed for all recipients.';
    END IF;

    UPDATE public.broadcast_campaigns
    SET status = CASE WHEN sent > 0 THEN 'sent' ELSE 'failed' END,
        total_recipients = total, total_sent = sent, total_failed = failed,
        sent_at = CASE WHEN sent > 0 THEN now() END, schedule_failure_reason = reason
    WHERE id = campaign.id;

    INSERT INTO public.client_audit_log (actor_user_id, action, entity_type, entity_id, details)
    VALUES (campaign.created_by, CASE WHEN sent > 0 THEN 'broadcast:send' ELSE 'broadcast:scheduled_send_failed' END,
      'broadcast_campaigns', campaign.id, jsonb_build_object(
        'scheduled', true, 'total_recipients', total, 'total_sent', sent, 'total_failed', failed, 'reason', reason
      ));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_broadcast_recipients(text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_schedule_bulk_message(uuid, text, text, text, text, timestamptz, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cancel_scheduled_bulk_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_deliver_scheduled_bulk_messages() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_schedule_bulk_message(uuid, text, text, text, text, timestamptz, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cancel_scheduled_bulk_message(uuid) TO authenticated;

SELECT cron.schedule('deliver-scheduled-bulk-messages', '* * * * *',
  'SELECT public.fn_deliver_scheduled_bulk_messages()');
