-- The Manage Invites page (src/pages/ManageInvites.tsx) already tracks a full
-- invitation lifecycle on public.user_invitations — sent/resent (last_sent_at,
-- mailgun_message_id), delivery outcome (delivery_status: delivered/bounced/
-- failed/complained, written by supabase/functions/mailgun-webhook and the
-- reconcile-invite-delivery-status fallback), engagement (first_opened_at/
-- open_count, first_clicked_at/click_count, also from mailgun-webhook), and
-- verification (status='accepted', accepted_at, accepted_by_user_id, written
-- by accept_invitation_v2()). None of this reaches the per-client Timeline —
-- confirmed live: zero client_timeline_events rows of entity_type
-- 'user_invitation' exist despite 226 real invitations (110 accepted, 9
-- clicked, 3 bounced/failed/complained). Staff looking at a client's Timeline
-- currently have no visibility into whether/when that client's users were
-- invited, verified, or had delivery problems.
--
-- Every status-changing write path (invite-user's INSERT, mailgun-webhook's
-- two UPDATE branches, reconcile-invite-delivery-status's UPDATE,
-- accept_invitation_v2's UPDATE, resend-invite's UPDATE) is a plain SQL
-- statement against this one table, so a single set of triggers on
-- public.user_invitations catches all of them centrally — no edge function
-- changes needed.
--
-- Four new event types (not reusing account_invited/account_activated: those
-- are already used by the unrelated ghost-user bulk-activation flow for a
-- different meaning — enabling/disabling an existing account — and reusing
-- them here would conflate two different lifecycles). "Pending" from the
-- user's ask is not a separate event: it's the resting state between
-- invitation_sent and one of the other three outcomes, not a transition of
-- its own.
--
-- 226 rows total is small enough to backfill in full (precedent: 113-row
-- time_reallocated backfill), across all four new event types.

-- 1) New event types.
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
    'time_posted','time_ignored','time_reallocated',
    'account_invited','account_activated','account_deactivated',
    'account_role_changed','account_removed',
    'structured_note_added',
    'client_login',
    'message_sent',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued',
    'stage_status_changed',
    'portal_activity_summary',
    'tenant_status_changed',
    'invitation_sent','invitation_clicked','invitation_bounced','invitation_accepted'
  ));

-- 2) Sent / resent. Same function handles both: fired by INSERT (initial
-- send) and by UPDATE OF last_sent_at (resend-invite's post-dispatch stamp),
-- distinguished via TG_OP so a resend doesn't also fire twice on the initial
-- stamp (send-invitation-email sets last_sent_at on first send too — the
-- resend trigger's WHEN clause requires OLD.last_sent_at to already be set).
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

DROP TRIGGER IF EXISTS trg_invitation_sent_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_sent_timeline
  AFTER INSERT ON public.user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_invitation_sent_timeline_trigger();

DROP TRIGGER IF EXISTS trg_invitation_resent_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_resent_timeline
  AFTER UPDATE OF last_sent_at ON public.user_invitations
  FOR EACH ROW
  WHEN (OLD.last_sent_at IS NOT NULL AND NEW.last_sent_at IS DISTINCT FROM OLD.last_sent_at)
  EXECUTE FUNCTION public.fn_invitation_sent_timeline_trigger();

-- 3) Clicked. Fires once, on the first click only (first_clicked_at going
-- from NULL to set) — not on every click_count increment, matching "when
-- they clicked" rather than spamming the Timeline per click.
CREATE OR REPLACE FUNCTION public.fn_invitation_clicked_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'invitation_clicked',
    format('%s clicked the invitation link', NEW.email),
    NULL,
    'user_invitation',
    NEW.id::text,
    jsonb_build_object('email', NEW.email, 'click_count', NEW.click_count),
    NEW.first_clicked_at,
    NULL,
    'system'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitation_clicked_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_clicked_timeline
  AFTER UPDATE OF first_clicked_at ON public.user_invitations
  FOR EACH ROW
  WHEN (OLD.first_clicked_at IS NULL AND NEW.first_clicked_at IS NOT NULL)
  EXECUTE FUNCTION public.fn_invitation_clicked_timeline_trigger();

-- 4) Bounced. Covers the full Mailgun terminal-failure spectrum (bounced /
-- failed / complained) under one event type with a title that names the
-- actual outcome, rather than silently dropping failed/complained.
CREATE OR REPLACE FUNCTION public.fn_invitation_bounced_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'invitation_bounced',
    CASE NEW.delivery_status
      WHEN 'bounced' THEN format('Invitation email to %s bounced', NEW.email)
      WHEN 'complained' THEN format('Invitation email to %s was marked as spam', NEW.email)
      ELSE format('Invitation email to %s failed to deliver', NEW.email)
    END,
    NULL,
    'user_invitation',
    NEW.id::text,
    jsonb_build_object('email', NEW.email, 'delivery_status', NEW.delivery_status),
    COALESCE(NEW.delivery_event_at, now()),
    NULL,
    'system'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitation_bounced_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_bounced_timeline
  AFTER UPDATE OF delivery_status ON public.user_invitations
  FOR EACH ROW
  WHEN (NEW.delivery_status IS DISTINCT FROM OLD.delivery_status AND NEW.delivery_status IN ('bounced', 'failed', 'complained'))
  EXECUTE FUNCTION public.fn_invitation_bounced_timeline_trigger();

-- 5) Accepted ("Verified" in the Manage Invites UI's own vocabulary).
CREATE OR REPLACE FUNCTION public.fn_invitation_accepted_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title, body,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    NEW.tenant_id,
    NEW.tenant_id::text,
    'invitation_accepted',
    format('%s verified their account', NEW.email),
    NULL,
    'user_invitation',
    NEW.id::text,
    jsonb_build_object(
      'email', NEW.email,
      'unicorn_role', NEW.unicorn_role,
      'relationship_role', NEW.relationship_role,
      'accepted_by_user_id', NEW.accepted_by_user_id
    ),
    COALESCE(NEW.accepted_at, now()),
    COALESCE(auth.uid(), NEW.accepted_by_user_id),
    'user'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitation_accepted_timeline ON public.user_invitations;
CREATE TRIGGER trg_invitation_accepted_timeline
  AFTER UPDATE OF status ON public.user_invitations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'accepted')
  EXECUTE FUNCTION public.fn_invitation_accepted_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_invitation_sent_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_invitation_clicked_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_invitation_bounced_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_invitation_accepted_timeline_trigger() FROM anon, authenticated, PUBLIC;

-- 6) Backfill full history (226 invitations; idempotent via NOT EXISTS keyed
-- to entity_type/entity_id/event_type, matching the time_reallocated
-- backfill pattern). Historical resends aren't reconstructable (no log of
-- past last_sent_at values) so only the original send is backfilled per row.

INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source
)
SELECT
  ui.tenant_id,
  ui.tenant_id::text,
  'invitation_sent',
  format('Invitation sent to %s', ui.email),
  NULL,
  'user_invitation',
  ui.id::text,
  jsonb_build_object(
    'email', ui.email,
    'first_name', ui.first_name,
    'last_name', ui.last_name,
    'unicorn_role', ui.unicorn_role,
    'relationship_role', ui.relationship_role,
    'resend', false,
    'backfilled', true
  ),
  COALESCE(ui.created_at, now()),
  ui.invited_by,
  'user'
FROM public.user_invitations ui
WHERE ui.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'user_invitation' AND e.entity_id = ui.id::text AND e.event_type = 'invitation_sent'
  );

INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source
)
SELECT
  ui.tenant_id,
  ui.tenant_id::text,
  'invitation_clicked',
  format('%s clicked the invitation link', ui.email),
  NULL,
  'user_invitation',
  ui.id::text,
  jsonb_build_object('email', ui.email, 'click_count', ui.click_count, 'backfilled', true),
  ui.first_clicked_at,
  NULL,
  'system'
FROM public.user_invitations ui
WHERE ui.first_clicked_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'user_invitation' AND e.entity_id = ui.id::text AND e.event_type = 'invitation_clicked'
  );

INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source
)
SELECT
  ui.tenant_id,
  ui.tenant_id::text,
  'invitation_bounced',
  CASE ui.delivery_status
    WHEN 'bounced' THEN format('Invitation email to %s bounced', ui.email)
    WHEN 'complained' THEN format('Invitation email to %s was marked as spam', ui.email)
    ELSE format('Invitation email to %s failed to deliver', ui.email)
  END,
  NULL,
  'user_invitation',
  ui.id::text,
  jsonb_build_object('email', ui.email, 'delivery_status', ui.delivery_status, 'backfilled', true),
  COALESCE(ui.delivery_event_at, ui.created_at, now()),
  NULL,
  'system'
FROM public.user_invitations ui
WHERE ui.delivery_status IN ('bounced', 'failed', 'complained')
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'user_invitation' AND e.entity_id = ui.id::text AND e.event_type = 'invitation_bounced'
  );

INSERT INTO public.client_timeline_events (
  tenant_id, client_id, event_type, title, body,
  entity_type, entity_id, metadata, occurred_at, created_by, source
)
SELECT
  ui.tenant_id,
  ui.tenant_id::text,
  'invitation_accepted',
  format('%s verified their account', ui.email),
  NULL,
  'user_invitation',
  ui.id::text,
  jsonb_build_object(
    'email', ui.email,
    'unicorn_role', ui.unicorn_role,
    'relationship_role', ui.relationship_role,
    'accepted_by_user_id', ui.accepted_by_user_id,
    'backfilled', true
  ),
  COALESCE(ui.accepted_at, ui.created_at, now()),
  ui.accepted_by_user_id,
  'user'
FROM public.user_invitations ui
WHERE ui.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_timeline_events e
    WHERE e.entity_type = 'user_invitation' AND e.entity_id = ui.id::text AND e.event_type = 'invitation_accepted'
  );
