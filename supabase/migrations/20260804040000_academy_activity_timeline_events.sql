-- Timeline expansion Phase D: surface Vivacity Academy engagement on the
-- client Timeline (internal/staff-only — Academy engagement is not currently
-- shown to clients anywhere in the portal, so this keeps that boundary).
--
-- Tenant resolution: academy_enrollments.tenant_id is nullable, so the robust
-- path is public.users.tenant_id via user_id first, falling back to the
-- enrollment/certificate row's own tenant_id. Skip (no insert) if neither
-- resolves, consistent with the ambiguity handling used in Phase B.

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
    'message_sent',
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued'
  ));

-- 2) Enrollment created.
CREATE OR REPLACE FUNCTION public.fn_academy_enrollment_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_user_name text;
  v_course_title text;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE user_uuid = NEW.user_id;
  v_tenant_id := COALESCE(v_tenant_id, NEW.tenant_id);
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
    INTO v_user_name
    FROM public.users WHERE user_uuid = NEW.user_id;
  SELECT title INTO v_course_title FROM public.academy_courses WHERE id = NEW.course_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'academy_enrolled',
    format('%s enrolled in %s', COALESCE(v_user_name, 'A client user'), COALESCE(v_course_title, 'an Academy course')),
    'academy_enrollment',
    NEW.id::text,
    jsonb_build_object('course_id', NEW.course_id, 'status', NEW.status, 'source', NEW.source),
    COALESCE(NEW.enrolled_at, NEW.created_at, now()),
    COALESCE(NEW.enrolled_by, NEW.user_id),
    'system'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_enrollment_timeline ON public.academy_enrollments;
CREATE TRIGGER trg_academy_enrollment_timeline
  AFTER INSERT ON public.academy_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_academy_enrollment_timeline_trigger();

-- 3) Lesson completed (fires only when is_completed transitions to true).
CREATE OR REPLACE FUNCTION public.fn_academy_lesson_completed_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_user_name text;
  v_lesson_title text;
  v_course_title text;
BEGIN
  IF NEW.is_completed IS NOT TRUE OR OLD.is_completed IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE user_uuid = NEW.user_id;
  IF v_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM public.academy_enrollments WHERE id = NEW.enrollment_id;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
    INTO v_user_name
    FROM public.users WHERE user_uuid = NEW.user_id;
  SELECT title INTO v_lesson_title FROM public.academy_lessons WHERE id = NEW.lesson_id;
  SELECT title INTO v_course_title FROM public.academy_courses WHERE id = NEW.course_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'academy_lesson_completed',
    format('%s completed lesson: %s', COALESCE(v_user_name, 'A client user'), COALESCE(v_lesson_title, 'Untitled lesson')),
    'academy_lesson_progress',
    NEW.id::text,
    jsonb_build_object('course_id', NEW.course_id, 'course_title', v_course_title, 'lesson_id', NEW.lesson_id),
    COALESCE(NEW.completed_at, now()),
    NEW.user_id,
    'system'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_lesson_completed_timeline ON public.academy_lesson_progress;
CREATE TRIGGER trg_academy_lesson_completed_timeline
  AFTER UPDATE OF is_completed ON public.academy_lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_academy_lesson_completed_timeline_trigger();

-- 4) Certificate issued.
CREATE OR REPLACE FUNCTION public.fn_academy_certificate_timeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_user_name text;
  v_course_title text;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE user_uuid = NEW.user_id;
  v_tenant_id := COALESCE(v_tenant_id, NEW.tenant_id);
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
    INTO v_user_name
    FROM public.users WHERE user_uuid = NEW.user_id;
  SELECT title INTO v_course_title FROM public.academy_courses WHERE id = NEW.course_id;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, event_type, title,
    entity_type, entity_id, metadata, occurred_at, created_by, source
  ) VALUES (
    v_tenant_id,
    v_tenant_id::text,
    'academy_certificate_issued',
    format('%s earned a certificate: %s', COALESCE(v_user_name, 'A client user'), COALESCE(v_course_title, 'an Academy course')),
    'academy_certificate',
    NEW.id::text,
    jsonb_build_object('course_id', NEW.course_id, 'certificate_number', NEW.certificate_number),
    COALESCE(NEW.issued_at, now()),
    NEW.issued_by,
    'system'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_certificate_timeline ON public.academy_certificates;
CREATE TRIGGER trg_academy_certificate_timeline
  AFTER INSERT ON public.academy_certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_academy_certificate_timeline_trigger();

-- 5) Trigger-only SECURITY DEFINER functions — revoke direct execute.
REVOKE EXECUTE ON FUNCTION public.fn_academy_enrollment_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_academy_lesson_completed_timeline_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_academy_certificate_timeline_trigger() FROM anon, authenticated, PUBLIC;
