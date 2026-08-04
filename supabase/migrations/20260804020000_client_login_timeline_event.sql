-- Timeline expansion Phase B: surface client-portal logins on the client Timeline
-- (internal/staff-only). Extends the existing handle_user_login() trigger
-- (fires on every auth.users.last_sign_in_at change, staff and portal users alike)
-- to also emit a client_timeline_events row when the signed-in user is a
-- client-portal user (user_type NOT IN ('Vivacity','Vivacity Team')).
--
-- Tenant resolution mirrors src/contexts/ClientTenantContext.tsx's caution:
-- prefer public.users.tenant_id; otherwise fall back to tenant_users only if
-- it resolves to exactly one tenant. If ambiguous or unresolved, skip silently
-- rather than guess — consistent with how the rest of the codebase already
-- treats multi-tenant ambiguity.

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
    'client_login'
  ));

-- 2) Extend handle_user_login() with client-portal login timeline emission.
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_type text;
  v_tenant_id bigint;
  v_email text;
  v_full_name text;
  v_tenant_count int;
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    -- Preserved: append a login row to the activity ledger
    INSERT INTO public.user_activity (user_id, login_date)
    VALUES (NEW.id, COALESCE(NEW.last_sign_in_at, now()));

    -- Preserved: mirror auth.users.last_sign_in_at into public.users so views
    -- (v_client_tenant_users etc.) read an accurate value without needing
    -- to cross the auth.users RLS boundary.
    UPDATE public.users
       SET last_sign_in_at = NEW.last_sign_in_at
     WHERE user_uuid = NEW.id;

    -- New: client-portal login -> internal-only timeline event.
    SELECT user_type, tenant_id, email,
           NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
      INTO v_user_type, v_tenant_id, v_email, v_full_name
      FROM public.users
     WHERE user_uuid = NEW.id;

    IF v_user_type IS NOT NULL AND v_user_type NOT IN ('Vivacity', 'Vivacity Team') THEN
      IF v_tenant_id IS NULL THEN
        SELECT count(DISTINCT tu.tenant_id), max(tu.tenant_id)
          INTO v_tenant_count, v_tenant_id
          FROM public.tenant_users tu
         WHERE tu.user_id = NEW.id;

        IF v_tenant_count IS DISTINCT FROM 1 THEN
          v_tenant_id := NULL;
        END IF;
      END IF;

      IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.client_timeline_events (
          tenant_id, client_id, event_type, title,
          entity_type, entity_id, metadata, occurred_at, created_by, source
        ) VALUES (
          v_tenant_id,
          v_tenant_id::text,
          'client_login',
          format('%s logged in', COALESCE(v_full_name, v_email, 'Client user')),
          'user',
          NEW.id::text,
          jsonb_build_object('user_type', v_user_type),
          COALESCE(NEW.last_sign_in_at, now()),
          NEW.id,
          'system'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_user_login() FROM PUBLIC;
