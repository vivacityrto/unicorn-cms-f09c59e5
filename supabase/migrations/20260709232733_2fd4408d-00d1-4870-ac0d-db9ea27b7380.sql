
-- =====================================================================
-- 0. Fix stale role list on client_timeline_events RLS policies
-- =====================================================================
-- The canonical internal-staff role list lives in
-- src/lib/roles/vivacityRoles.ts. Keep this policy in sync.
-- Roles: Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET

-- Source of truth: src/lib/roles/vivacityRoles.ts
DROP POLICY IF EXISTS "Vivacity team can view all timeline events" ON public.client_timeline_events;
CREATE POLICY "Vivacity team can view all timeline events"
  ON public.client_timeline_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET')
    )
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND (u.tenant_id = client_timeline_events.tenant_id
             OR u.unicorn_role IN ('Super Admin', 'Team Leader'))
    )
  );

-- Source of truth: src/lib/roles/vivacityRoles.ts
DROP POLICY IF EXISTS "Vivacity team can insert timeline events" ON public.client_timeline_events;
CREATE POLICY "Vivacity team can insert timeline events"
  ON public.client_timeline_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC', 'CET')
    )
  );

-- =====================================================================
-- 1. Extend CHECK constraint with 5 new Accounts event types
-- =====================================================================
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
    'account_role_changed','account_removed'
  ));

-- =====================================================================
-- 2. Centralised RPC: rpc_set_client_account_status
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_set_client_account_status(
  p_user_uuid uuid,
  p_disabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target   RECORD;
  v_actor    RECORD;
  v_allowed  boolean := false;
  v_full_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT user_uuid, tenant_id, first_name, last_name, email, disabled
    INTO v_target
    FROM public.users
   WHERE user_uuid = p_user_uuid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;

  -- Permission check: SuperAdmin via central RPC, OR same-tenant client Admin
  BEGIN
    SELECT public.check_permission(v_actor_id, 'admin.team_users.manage', 'full')
      INTO v_allowed;
  EXCEPTION WHEN OTHERS THEN
    v_allowed := false;
  END;

  IF NOT v_allowed THEN
    SELECT unicorn_role, user_type, tenant_id
      INTO v_actor
      FROM public.users
     WHERE user_uuid = v_actor_id;

    IF FOUND
       AND v_actor.unicorn_role = 'Admin'
       AND v_actor.user_type    = 'Client'
       AND v_actor.tenant_id    = v_target.tenant_id
    THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  -- Idempotent short-circuit
  IF COALESCE(v_target.disabled, false) = COALESCE(p_disabled, false) THEN
    RETURN jsonb_build_object('success', true, 'unchanged', true);
  END IF;

  UPDATE public.users
     SET disabled   = p_disabled,
         updated_at = now()
   WHERE user_uuid = p_user_uuid;

  v_full_name := TRIM(COALESCE(v_target.first_name, '') || ' ' || COALESCE(v_target.last_name, ''));
  IF v_full_name = '' THEN
    v_full_name := COALESCE(v_target.email, 'user');
  END IF;

  INSERT INTO public.client_timeline_events (
    tenant_id, client_id, created_by, source, visibility,
    event_type, title, entity_type, entity_id, metadata
  ) VALUES (
    v_target.tenant_id,
    v_target.tenant_id::text,
    v_actor_id,
    'user',
    'internal',
    CASE WHEN p_disabled THEN 'account_deactivated' ELSE 'account_activated' END,
    CASE WHEN p_disabled THEN 'Account deactivated: ' ELSE 'Account activated: ' END || v_full_name,
    'user',
    p_user_uuid::text,
    jsonb_build_object(
      'target_email', v_target.email,
      'target_name',  v_full_name
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_set_client_account_status(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_set_client_account_status(uuid, boolean) TO authenticated;
