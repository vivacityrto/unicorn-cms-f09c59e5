-- Notification routing, rollout step 4: support tickets and notes.
-- Design: docs/kb/reference/notification-redesign-2026-11-17.md
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Requires 20261117140000 (resolver) and 20261117160000 (eligible owners).
--
-- 1. Support tickets. support_triage_recipients() is the one place that picks who is
--    told about a client ticket or a client's reply. It gains a tenant argument:
--      - an assigned ticket still goes to the assignee (unchanged);
--      - an unassigned ticket for a client whose primary CSC (or delegates, or
--        people watching or opted in) can be notified goes to them, instead of
--        every Super Admin, Team Leader and Team Member;
--      - an unassigned ticket with no tenant, for Vivacity's own tenant (6372, where
--        staff-created company and product tickets live), or whose tenant has no
--        reachable owner, still goes to the triage pool exactly as before, so
--        company and product tickets keep working.
--    The 2-argument version is dropped (a changed parameter list needs DROP, not
--    CREATE OR REPLACE, or a second overload is left behind). Its two callers,
--    create_support_ticket() and support_ticket_messages_after_insert(), are
--    updated in place to pass the tenant (see the DO block below).
--
-- 2. Notes. get_client_notification_recipients() lets signed-in staff ask the
--    resolver who should be told about a client event (never the caller), so the
--    note code no longer picks "the" CSC itself.

-- ---------------------------------------------------------------------------
-- 1. support_triage_recipients with a tenant
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.support_triage_recipients(uuid, uuid);

CREATE OR REPLACE FUNCTION public.support_triage_recipients(
  p_assignee uuid,
  p_exclude  uuid,
  p_tenant   bigint DEFAULT NULL
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
#variable_conflict use_column
DECLARE
  v_ids uuid[];
BEGIN
  IF p_assignee IS NOT NULL THEN
    RETURN QUERY
    SELECT u.user_uuid
      FROM public.users u
     WHERE u.user_uuid = p_assignee
       AND u.user_uuid IS DISTINCT FROM p_exclude
       AND COALESCE(u.disabled, false) = false
       AND COALESCE(u.archived, false) = false;
    RETURN;
  END IF;

  -- 6372 is Vivacity's own tenant: staff-created company and product tickets carry it
  -- (create_support_ticket defaults to it), and they belong in the triage pool.
  IF p_tenant IS NOT NULL AND p_tenant <> 6372 THEN
    SELECT array_agg(r.user_id) INTO v_ids
      FROM public.resolve_notification_recipients('support_ticket', p_tenant, p_exclude) r
     WHERE r.in_app AND r.reason <> 'unassigned';
    IF v_ids IS NOT NULL THEN
      RETURN QUERY SELECT x FROM unnest(v_ids) AS x;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT u.user_uuid
    FROM public.users u
   WHERE u.user_uuid IS DISTINCT FROM p_exclude
     AND COALESCE(u.disabled, false) = false
     AND COALESCE(u.archived, false) = false
     AND COALESCE(u.is_vivacity_internal, false) = true
     AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member');
END;
$fn$;

REVOKE ALL ON FUNCTION public.support_triage_recipients(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_triage_recipients(uuid, uuid, bigint) TO service_role;

-- Update the two callers in place. Each replacement is asserted, and skipped if
-- already applied, so the file can be re-run safely.
DO $callers$
DECLARE
  v_oid   oid;
  v_def   text;
  v_new   text;
  v_name  text;
  v_from  text;
  v_to    text;
BEGIN
  FOR v_name, v_from, v_to IN
    SELECT * FROM (VALUES
      ('create_support_ticket',
       'support_triage_recipients(NULL, v_uid)',
       'support_triage_recipients(NULL, v_uid, v_tenant)'),
      ('support_ticket_messages_after_insert',
       'support_triage_recipients(t.assignee_id, NEW.author_id)',
       'support_triage_recipients(t.assignee_id, NEW.author_id, t.tenant_id)')
    ) AS x(n, f, t)
  LOOP
    SELECT p.oid INTO v_oid
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_name;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'function % not found', v_name;
    END IF;
    IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_name) <> 1 THEN
      RAISE EXCEPTION 'function % has more than one overload', v_name;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    IF position(v_to IN v_def) > 0 THEN
      CONTINUE;  -- already updated
    END IF;
    v_new := replace(v_def, v_from, v_to);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'expected text not found in %: %', v_name, v_from;
    END IF;
    EXECUTE v_new;
  END LOOP;
END
$callers$;

-- ---------------------------------------------------------------------------
-- 2. Who should be told about a client event (for code that writes the
--    notification itself, such as the note code). Staff only; never the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_notification_recipients(p_category text, p_tenant_id bigint)
RETURNS TABLE (user_id uuid, reason text, in_app boolean, teams boolean, email boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.user_id, r.reason, r.in_app, r.teams, r.email
    FROM public.resolve_notification_recipients(p_category, p_tenant_id, auth.uid()) r;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_client_notification_recipients(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_notification_recipients(text, bigint) TO authenticated, service_role;
