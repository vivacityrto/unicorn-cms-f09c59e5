-- Rollback for 20261117170000_notification_tickets_notes_routing.sql
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Restores the two callers to the 2-argument call, restores the 2-argument
-- support_triage_recipients (the live version from the support tickets model
-- migration: assignee, else every Super Admin, Team Leader and Team Member), and
-- drops the 3-argument version and the notes helper.

DO $callers$
DECLARE
  v_oid  oid;
  v_def  text;
  v_new  text;
  v_name text;
  v_from text;
  v_to   text;
BEGIN
  FOR v_name, v_from, v_to IN
    SELECT * FROM (VALUES
      ('create_support_ticket',
       'support_triage_recipients(NULL, v_uid, v_tenant)',
       'support_triage_recipients(NULL, v_uid)'),
      ('support_ticket_messages_after_insert',
       'support_triage_recipients(t.assignee_id, NEW.author_id, t.tenant_id)',
       'support_triage_recipients(t.assignee_id, NEW.author_id)')
    ) AS x(n, f, t)
  LOOP
    SELECT p.oid INTO v_oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_name;
    v_def := pg_get_functiondef(v_oid);
    IF position(v_to IN v_def) > 0 AND position(v_from IN v_def) = 0 THEN
      CONTINUE;
    END IF;
    v_new := replace(v_def, v_from, v_to);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'expected text not found in %: %', v_name, v_from;
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$callers$;

CREATE OR REPLACE FUNCTION public.support_triage_recipients(p_assignee uuid, p_exclude uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT u.user_uuid
  FROM public.users u
  WHERE u.user_uuid IS DISTINCT FROM p_exclude
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.archived, false) = false
    AND (
      (p_assignee IS NOT NULL AND u.user_uuid = p_assignee)
      OR (p_assignee IS NULL
          AND COALESCE(u.is_vivacity_internal, false) = true
          AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member'))
    );
$fn$;

DROP FUNCTION IF EXISTS public.support_triage_recipients(uuid, uuid, bigint);
DROP FUNCTION IF EXISTS public.get_client_notification_recipients(text, bigint);
