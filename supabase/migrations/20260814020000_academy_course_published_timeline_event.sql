-- Surfaces Academy course publishing as a Client Activity timeline event.
-- This is an internal staff action (publishing a course), not tied to any
-- specific client tenant, so it's attributed to the designated internal
-- system tenant (tenants.is_system_tenant = true — "Vivacity Coaching &
-- Consulting") rather than a hardcoded tenant id, so it shows up in the
-- cross-tenant Client Activity dashboard under Vivacity's own name.
--
-- Note: the live timeline_valid_event_type constraint already includes
-- action_item_comment, package_status_changed, audit_created, and
-- audit_completed, none of which are present in src/types/timeline.ts's
-- TIMELINE_EVENT_TYPES — pre-existing drift, left untouched here (out of
-- scope), preserved as-is below rather than narrowed.

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
    'invitation_sent','invitation_clicked','invitation_bounced','invitation_accepted','invitation_opened',
    'package_status_changed',
    'xero_invoice_paid','xero_invoice_issued',
    'audit_created','audit_completed',
    'academy_course_published'
  ]::text[]));

CREATE OR REPLACE FUNCTION public.fn_academy_course_published_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_system_tenant_id bigint;
  v_publisher_name text;
begin
  if NEW.status = 'published'
     and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status)
  then
    select id into v_system_tenant_id from public.tenants where is_system_tenant = true limit 1;
    if v_system_tenant_id is null then
      return NEW;
    end if;

    select NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
      into v_publisher_name
      from public.users where user_uuid = NEW.published_by;

    insert into public.client_timeline_events (
      tenant_id, client_id, event_type, title,
      entity_type, entity_id, metadata, occurred_at, created_by, source
    ) values (
      v_system_tenant_id,
      v_system_tenant_id::text,
      'academy_course_published',
      format('%s published %s', COALESCE(v_publisher_name, 'A staff member'), NEW.title),
      'academy_course',
      NEW.id::text,
      jsonb_build_object('course_id', NEW.id),
      COALESCE(NEW.published_at, now()),
      NEW.published_by,
      'system'
    );
  end if;

  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_academy_course_published_timeline ON public.academy_courses;
CREATE TRIGGER trg_academy_course_published_timeline
  AFTER INSERT OR UPDATE ON public.academy_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_academy_course_published_timeline_trigger();

REVOKE EXECUTE ON FUNCTION public.fn_academy_course_published_timeline_trigger() FROM anon, authenticated, PUBLIC;
