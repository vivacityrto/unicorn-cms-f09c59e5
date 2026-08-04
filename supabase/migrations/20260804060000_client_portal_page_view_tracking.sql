-- Timeline expansion Phase F: client-portal page-view tracking (greenfield —
-- no analytics/page-view capture existed anywhere in this codebase before
-- this migration).
--
-- Design: track every page view at raw fidelity in a lightweight dedicated
-- table (NOT client_timeline_events directly — per-page rows would flood
-- both the visible Timeline feed and the Ask Viv RAG corpus). A daily cron
-- job then rolls each user's prior-day page views into a SINGLE
-- client_timeline_events row ('portal_activity_summary', internal-only),
-- which is what actually reaches the Timeline UI and RAG. Idempotency uses
-- the existing dedupe_key mechanism (idx_timeline_events_dedupe) already
-- used elsewhere on this table.

-- 1) Raw page-view table.
CREATE TABLE IF NOT EXISTS public.client_portal_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  path text NOT NULL,
  page_label text NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds int NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_portal_page_views_tenant_entered
  ON public.client_portal_page_views (tenant_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_portal_page_views_session
  ON public.client_portal_page_views (session_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_portal_page_views_user_entered
  ON public.client_portal_page_views (user_id, entered_at DESC);
-- Digest job scans "yesterday" daily; narrow this to open (still-being-closed-out) rows.
CREATE INDEX IF NOT EXISTS idx_client_portal_page_views_open
  ON public.client_portal_page_views (session_id, user_id)
  WHERE duration_seconds IS NULL;

ALTER TABLE public.client_portal_page_views ENABLE ROW LEVEL SECURITY;

-- Writes only ever go through rpc_log_page_view (SECURITY DEFINER below) —
-- no direct INSERT/UPDATE policy is granted to authenticated users.
DROP POLICY IF EXISTS "Staff can view page views for their tenant" ON public.client_portal_page_views;
CREATE POLICY "Staff can view page views for their tenant"
  ON public.client_portal_page_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET')
        AND (u.tenant_id = client_portal_page_views.tenant_id OR u.unicorn_role IN ('Super Admin', 'Team Leader'))
    )
  );

-- 2) RPC: log a page view, closing out the previous open one in the same call.
CREATE OR REPLACE FUNCTION public.rpc_log_page_view(
  p_path text,
  p_page_label text DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_prev_duration_seconds int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint;
BEGIN
  IF v_user_id IS NULL OR p_session_id IS NULL OR p_path IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing required fields');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE user_uuid = v_user_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tenant resolved');
  END IF;

  IF p_prev_duration_seconds IS NOT NULL THEN
    UPDATE public.client_portal_page_views
       SET duration_seconds = greatest(p_prev_duration_seconds, 0)
     WHERE id = (
       SELECT id FROM public.client_portal_page_views
        WHERE session_id = p_session_id
          AND user_id = v_user_id
          AND duration_seconds IS NULL
        ORDER BY entered_at DESC
        LIMIT 1
     );
  END IF;

  INSERT INTO public.client_portal_page_views (
    tenant_id, user_id, session_id, path, page_label, entered_at
  ) VALUES (
    v_tenant_id, v_user_id, p_session_id, p_path, p_page_label, now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_page_view FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_log_page_view TO authenticated;

-- 3) New event type for the daily digest.
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
    'academy_enrolled','academy_lesson_completed','academy_certificate_issued',
    'stage_status_changed',
    'portal_activity_summary'
  ));

-- 4) Daily digest: one client_timeline_events row per user per day, not one per page view.
CREATE OR REPLACE FUNCTION public.fn_generate_portal_activity_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_body text;
  v_minutes int;
  v_digest_date date := current_date - 1;
BEGIN
  FOR v_row IN
    SELECT
      user_id,
      tenant_id,
      count(*) AS page_count,
      COALESCE(sum(duration_seconds), 0) AS total_seconds,
      jsonb_agg(
        jsonb_build_object('path', path, 'page_label', page_label, 'entered_at', entered_at)
        ORDER BY entered_at
      ) AS pages
    FROM public.client_portal_page_views
    WHERE entered_at >= v_digest_date
      AND entered_at < v_digest_date + 1
    GROUP BY user_id, tenant_id
  LOOP
    v_minutes := greatest(round(v_row.total_seconds / 60.0), 1)::int;
    v_body := format(
      'Visited %s page%s over %s minute%s',
      v_row.page_count, CASE WHEN v_row.page_count = 1 THEN '' ELSE 's' END,
      v_minutes, CASE WHEN v_minutes = 1 THEN '' ELSE 's' END
    );

    INSERT INTO public.client_timeline_events (
      tenant_id, client_id, event_type, title, body,
      entity_type, entity_id, metadata, occurred_at, created_by, source, dedupe_key
    ) VALUES (
      v_row.tenant_id,
      v_row.tenant_id::text,
      'portal_activity_summary',
      'Portal activity summary',
      v_body,
      'portal_activity_digest',
      v_row.user_id::text,
      jsonb_build_object(
        'user_id', v_row.user_id,
        'digest_date', v_digest_date,
        'page_count', v_row.page_count,
        'total_seconds', v_row.total_seconds,
        'pages', v_row.pages
      ),
      v_digest_date,
      v_row.user_id,
      'system',
      'portal_activity:' || v_row.user_id::text || ':' || v_digest_date::text
    )
    ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_portal_activity_digest FROM anon, authenticated, PUBLIC;

-- 5) Daily cron registration — pure SQL, no edge function/HTTP call needed.
SELECT cron.schedule(
  'portal-activity-digest-daily',
  '15 0 * * *',
  $$ SELECT public.fn_generate_portal_activity_digest(); $$
);
