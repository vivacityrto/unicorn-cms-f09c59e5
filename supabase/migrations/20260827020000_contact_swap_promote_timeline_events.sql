-- ============================================================
-- Timeline events for User <-> Contact swap / promote
-- ============================================================
-- swap_tenant_user_to_contact and the promoted-contact archival step in
-- accept_invitation_v2 currently only write audit_eos_events (internal,
-- not client-facing). Neither surfaces on a client's Timeline tab or the
-- staff Dashboard's Client Activity feed, both of which read from
-- client_timeline_events (see fn_invitation_*_timeline_trigger /
-- _apply_relationship_role_row for the established pattern this follows).
--
-- Note: "Invitation sent to X" / "X verified their account" already fire
-- automatically for a promoted contact via the existing user_invitations
-- triggers, since Promote now sends a real invitation (see
-- 2026-08-27-promote-sends-real-invitation.md). What's still missing is
-- (1) the swap-to-contact action itself, which touches no invitation row
-- at all, and (2) a distinctly-labeled "was a contact, now a user" event
-- at the moment of promotion — the generic "verified their account"
-- event doesn't communicate that.

-- 1) Two new event types.
ALTER TABLE public.client_timeline_events
  DROP CONSTRAINT IF EXISTS timeline_valid_event_type;

ALTER TABLE public.client_timeline_events
  ADD CONSTRAINT timeline_valid_event_type
  CHECK (event_type = ANY (ARRAY[
    'microsoft_connected','microsoft_disconnected','microsoft_sync_failed',
    'sharepoint_root_configured','sharepoint_root_invalid','sharepoint_doc_linked',
    'document_shared_to_client','document_uploaded','document_downloaded',
    'meeting_synced','meeting_attendance_imported','meeting_artifacts_captured',
    'minutes_draft_created','minutes_draft_updated','minutes_published_pdf',
    'tasks_created_from_minutes','task_completed_team','task_completed_client',
    'action_item_created','action_item_updated','action_item_completed','action_item_comment',
    'email_linked','email_attachment_saved','email_sent','email_failed',
    'note_added','note_created','note_pinned','note_unpinned','structured_note_added',
    'time_posted','time_ignored','time_reallocated',
    'account_invited','account_activated','account_deactivated',
    'account_role_changed','account_removed',
    'client_login',
    'message_sent','message_read',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued','academy_course_published',
    'stage_status_changed','package_status_changed','package_renewed',
    'portal_activity_summary','tenant_status_changed',
    'invitation_sent','invitation_opened','invitation_clicked','invitation_bounced','invitation_accepted',
    'xero_invoice_paid','xero_invoice_issued',
    'audit_created','audit_completed',
    'user_swapped_to_contact','contact_promoted_to_user'
  ]));

-- 2) swap_tenant_user_to_contact — emit the swap event.
CREATE OR REPLACE FUNCTION public.swap_tenant_user_to_contact(
  p_tenant_id bigint,
  p_user_id   uuid,
  p_reason    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller           uuid := auth.uid();
  v_tu_id            bigint;
  v_relationship_role text;
  v_position_type    text;
  v_first_name       text;
  v_last_name        text;
  v_email            text;
  v_full_name        text;
  v_other_admins     int;
  v_existing_contact_id bigint;
  v_contact_id       bigint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_tenant_parent_safe(p_tenant_id, v_caller)
    OR public.is_super_admin_safe(v_caller)
    OR public.is_vivacity_staff(v_caller)
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage users for tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  SELECT id, relationship_role, position_type
    INTO v_tu_id, v_relationship_role, v_position_type
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_tu_id IS NULL THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  IF v_relationship_role IN ('primary_contact', 'secondary_contact') THEN
    SELECT COUNT(*) INTO v_other_admins
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND id <> v_tu_id
      AND relationship_role IN ('primary_contact', 'secondary_contact');

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'Cannot swap the tenant''s only admin contact — assign another Primary or Secondary Contact first'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT first_name, last_name, email
    INTO v_first_name, v_last_name, v_email
  FROM public.users
  WHERE user_uuid = p_user_id;

  v_full_name := NULLIF(trim(both ' ' FROM concat_ws(' ', v_first_name, v_last_name)), '');

  SELECT id INTO v_existing_contact_id
  FROM public.tenant_contacts
  WHERE tenant_id = p_tenant_id AND lower(email) = lower(v_email);

  IF v_existing_contact_id IS NOT NULL THEN
    UPDATE public.tenant_contacts
       SET first_name = COALESCE(NULLIF(v_first_name, ''), first_name),
           last_name = COALESCE(NULLIF(v_last_name, ''), last_name),
           position_type = COALESCE(v_position_type, position_type),
           status = 'active',
           promoted_to_user_id = NULL,
           promoted_at = NULL,
           updated_at = now()
     WHERE id = v_existing_contact_id
     RETURNING id INTO v_contact_id;
  ELSE
    INSERT INTO public.tenant_contacts (
      tenant_id, first_name, last_name, email, position_type, status, created_by
    ) VALUES (
      p_tenant_id, COALESCE(NULLIF(v_first_name, ''), 'Unnamed'), v_last_name, v_email,
      v_position_type, 'active', v_caller
    )
    RETURNING id INTO v_contact_id;
  END IF;

  DELETE FROM public.tenant_users WHERE id = v_tu_id;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    INSERT INTO public.audit_eos_events (
      tenant_id, user_id, entity, entity_id, action, reason, details
    ) VALUES (
      p_tenant_id, p_user_id, 'tenant_users', NULL, 'swapped_to_contact', p_reason,
      jsonb_build_object(
        'tu_id', v_tu_id,
        'contact_id', v_contact_id,
        'old_relationship_role', v_relationship_role,
        'position_type', v_position_type,
        'changed_by', v_caller
      )
    );
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
  ) VALUES (
    p_tenant_id,
    p_tenant_id::text,
    'user_swapped_to_contact',
    format('%s: User → Contact', COALESCE(v_full_name, v_email, 'User')),
    p_reason,
    'tenant_contacts',
    v_contact_id::text,
    jsonb_build_object(
      'tu_id', v_tu_id,
      'contact_id', v_contact_id,
      'old_relationship_role', v_relationship_role,
      'position_type', v_position_type,
      'changed_by', v_caller
    ),
    now(),
    v_caller,
    'user',
    'internal'
  );

  RETURN jsonb_build_object('ok', true, 'contact_id', v_contact_id, 'tenant_id', p_tenant_id);
END;
$function$;

-- 3) accept_invitation_v2 — emit the promote event only when a contact
-- row was actually matched and archived, so a normal (non-contact)
-- invitation acceptance doesn't get a spurious event.
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token_hash text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invitation              record;
  v_existing_uuid           uuid;
  v_existing_accepted       boolean;
  v_relationship_role       text;
  v_tu_role                 text;
  v_tu_primary              boolean;
  v_tu_secondary            boolean;
  v_tu_access_scope         text;
  v_u_unicorn_role          text;
  v_u_user_type             text;
  v_tm_role                 text;
  v_tm_status                text;
  v_is_internal_fallback    boolean := false;
  v_matched_contact_id      bigint;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS',
      'message', 'Missing required parameters');
  END IF;

  IF (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IDENTITY_MISMATCH',
      'message', 'Invitation can only be accepted by the invited user');
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash AND status = 'pending';

  IF v_invitation IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations
      WHERE token_hash = p_token_hash AND status IN ('accepted', 'successful')
    ) INTO v_existing_accepted;
    IF v_existing_accepted THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED',
        'message', 'Invitation already accepted');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN',
      'message', 'Invalid or expired invitation token');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.user_invitations SET status = 'expired', updated_at = now()
     WHERE id = v_invitation.id;
    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED',
      'message', 'This invitation has expired');
  END IF;

  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;
  ELSIF v_invitation.unicorn_role = 'Admin' THEN
    v_relationship_role := 'primary_contact';
  ELSIF v_invitation.tenant_id = 6372 THEN
    v_relationship_role := NULL;
  ELSE
    v_relationship_role := 'user';
  END IF;

  IF (v_invitation.relationship_role IS NULL
      AND v_invitation.unicorn_role NOT IN ('Admin','User'))
     OR v_invitation.tenant_id = 6372 THEN
    v_is_internal_fallback := true;
  END IF;

  CASE v_relationship_role
    WHEN 'primary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := true;  v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'secondary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := false; v_tu_secondary := true;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'active';
    WHEN 'academy_user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'academy_only';
      v_u_unicorn_role := 'Academy User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'inactive';
    ELSE
      NULL;
  END CASE;

  IF v_is_internal_fallback THEN
    v_tu_role := 'child'; v_tu_primary := false; v_tu_secondary := false;
    v_tu_access_scope := 'full'; v_u_user_type := 'Vivacity Team';
    IF v_invitation.unicorn_role IS NOT NULL THEN
      v_u_unicorn_role := v_invitation.unicorn_role;
    END IF;
    v_tm_role := 'Admin'; v_tm_status := 'active';
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users WHERE email = lower(v_invitation.email);

  IF v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN
    UPDATE public.users
       SET user_uuid = p_user_id,
           first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role, user_type = v_u_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id),
           is_team = (v_u_user_type = 'Vivacity Team'), updated_at = now()
     WHERE user_uuid = v_existing_uuid;
  ELSIF v_existing_uuid IS NULL THEN
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, is_team, disabled, archived
    ) VALUES (
      p_user_id, lower(v_invitation.email),
      COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
      COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
      v_u_unicorn_role, v_u_user_type, v_invitation.tenant_id,
      (v_u_user_type = 'Vivacity Team'), false, false
    );
  ELSE
    UPDATE public.users
       SET first_name = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name  = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role, user_type = v_u_user_type,
           tenant_id = COALESCE(tenant_id, v_invitation.tenant_id), updated_at = now()
     WHERE user_uuid = p_user_id;
  END IF;

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, secondary_contact,
    access_scope, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_tu_primary,
    v_tu_secondary, v_tu_access_scope, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    relationship_role = EXCLUDED.relationship_role, role = EXCLUDED.role,
    primary_contact = EXCLUDED.primary_contact, secondary_contact = EXCLUDED.secondary_contact,
    access_scope = EXCLUDED.access_scope;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_invitation.tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();

  UPDATE public.profiles
     SET active_tenant_id = (SELECT id_uuid FROM public.tenants WHERE id = v_invitation.tenant_id),
         updated_at = now()
   WHERE user_id = p_user_id AND active_tenant_id IS NULL;

  UPDATE public.user_invitations
     SET status = 'accepted', accepted_at = now(),
         accepted_by_user_id = p_user_id, updated_at = now()
   WHERE id = v_invitation.id;

  UPDATE public.tenant_contacts
     SET status = 'archived',
         promoted_to_user_id = p_user_id,
         promoted_at = now(),
         updated_at = now()
   WHERE tenant_id = v_invitation.tenant_id
     AND lower(email) = lower(v_invitation.email)
     AND status = 'active'
   RETURNING id INTO v_matched_contact_id;

  IF v_matched_contact_id IS NOT NULL THEN
    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source, visibility
    ) VALUES (
      v_invitation.tenant_id,
      v_invitation.tenant_id::text,
      'contact_promoted_to_user',
      format('%s: Contact → User',
        COALESCE(
          NULLIF(trim(both ' ' FROM concat_ws(' ', v_invitation.first_name, v_invitation.last_name)), ''),
          v_invitation.email
        )
      ),
      NULL,
      'user',
      p_user_id::text,
      jsonb_build_object(
        'contact_id', v_matched_contact_id,
        'email', v_invitation.email,
        'relationship_role', v_relationship_role,
        'invitation_id', v_invitation.id
      ),
      now(),
      p_user_id,
      'user',
      'internal'
    );
  END IF;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id, p_user_id, 'user_invitations', v_invitation.id,
    'invitation_accepted', 'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email, 'tenant_id', v_invitation.tenant_id,
      'unicorn_role', v_u_unicorn_role, 'user_type', v_u_user_type::text,
      'tenant_users_role', v_tu_role, 'primary_contact', v_tu_primary,
      'secondary_contact', v_tu_secondary, 'access_scope', v_tu_access_scope,
      'relationship_role', v_relationship_role, 'tm_role', v_tm_role, 'tm_status', v_tm_status,
      'invitation_relationship_role_source',
        CASE WHEN v_invitation.relationship_role IS NOT NULL THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
      'internal_fallback', v_is_internal_fallback, 'invitation_id', v_invitation.id,
      'relinked_from_uuid',
        CASE WHEN v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN v_existing_uuid::text ELSE NULL END,
      'matched_contact_id', v_matched_contact_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'code', 'SUCCESS', 'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role, 'unicorn_role', v_u_unicorn_role,
    'primary_contact', v_tu_primary, 'secondary_contact', v_tu_secondary,
    'access_scope', v_tu_access_scope, 'relationship_role', v_relationship_role,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;
