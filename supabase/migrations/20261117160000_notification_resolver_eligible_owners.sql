-- Notification resolver: an assignment only counts as an owner when that person
-- can be notified. Design: docs/kb/reference/notification-redesign-2026-11-17.md
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- Requires 20261117140000_notification_routing_foundation.sql.
--
-- Found 17 November 2026 against production data: tenants 7492 (a disabled,
-- archived Super Admin) and 7564 (a System Account) have an active primary CSC
-- who can never be notified. The first resolver counted that assignment as an
-- owner, so such a tenant returned only its delegates and never escalated to
-- Super Admins as "unassigned".
--
-- Replaces public.resolve_notification_recipients(text, bigint, uuid, uuid)
-- (same signature, so no second overload). The only change: owners are the
-- active primary CSCs who are ELIGIBLE (active internal staff, not a system or
-- exempt account). Eligibility is evaluated before the actor is removed, so an
-- owner who is the actor of an event does not turn their client into "unassigned".
--
-- Not live: nothing reaches the resolver while message_routing_mode is 'legacy'
-- and escalation is off, so applying this changes no notification.

CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(
  p_category  text,
  p_tenant_id bigint,
  p_actor     uuid DEFAULT NULL,
  p_subject   uuid DEFAULT NULL
)
RETURNS TABLE (user_id uuid, reason text, in_app boolean, teams boolean, email boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
#variable_conflict use_column
DECLARE
  v_audience text;
BEGIN
  SELECT c.default_audience INTO v_audience
    FROM public.notification_category c
   WHERE c.key = p_category AND c.is_active;

  IF v_audience IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive notification category: %', p_category;
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT u.user_uuid AS uid, u.unicorn_role AS urole
      FROM public.users u
     WHERE u.is_vivacity_internal = true
       AND COALESCE(u.archived, false) = false
       AND COALESCE(u.disabled, false) = false
       AND COALESCE(u.is_system_account, false) = false
       AND u.unicorn_role IS DISTINCT FROM 'System Account'
       AND NOT EXISTS (SELECT 1 FROM public.notification_exempt_users x WHERE x.user_id = u.user_uuid)
  ),
  staff AS (
    SELECT e.uid, e.urole
      FROM eligible e
     WHERE e.uid IS DISTINCT FROM p_actor
  ),
  owners AS (
    SELECT a.csc_user_id AS uid
      FROM public.tenant_csc_assignments a
      JOIN eligible e ON e.uid = a.csc_user_id
     WHERE p_tenant_id IS NOT NULL
       AND a.tenant_id = p_tenant_id
       AND a.ended_at IS NULL
       AND a.superseded_at IS NULL
  ),
  cand AS (
    SELECT o.uid, 'primary_csc'::text AS reason, 1 AS pri FROM owners o WHERE v_audience = 'owner'
    UNION ALL
    SELECT d.delegate_user_id, 'delegate', 2
      FROM public.staff_notification_delegates d
     WHERE v_audience = 'owner'
       AND p_tenant_id IS NOT NULL
       AND d.starts_at <= now()
       AND (d.ended_at IS NULL OR d.ended_at > now())
       AND (d.tenant_id IS NULL OR d.tenant_id = p_tenant_id)
       AND (d.categories IS NULL OR p_category = ANY (d.categories))
       AND ((d.principal_kind = 'all_csc' AND EXISTS (SELECT 1 FROM owners))
            OR (d.principal_kind = 'user' AND d.principal_user_id IN (SELECT uid FROM owners)))
    UNION ALL
    SELECT s.uid, 'opted_in', 3
      FROM staff s
     WHERE v_audience = 'owner'
       AND EXISTS (SELECT 1 FROM public.notification_effective_pref(s.uid, p_category, 'in_app') ep
                    WHERE ep.scope = 'all_clients')
    UNION ALL
    SELECT ov.user_id, 'watching', 3
      FROM public.notification_client_overrides ov
     WHERE v_audience = 'owner' AND p_tenant_id IS NOT NULL
       AND ov.tenant_id = p_tenant_id AND ov.mode = 'watch'
    UNION ALL
    SELECT s.uid, 'unassigned', 4
      FROM staff s
     WHERE v_audience = 'owner' AND s.urole = 'Super Admin'
       AND NOT EXISTS (SELECT 1 FROM owners)
    UNION ALL
    SELECT p_subject, 'assignee', 1
     WHERE v_audience = 'assignee' AND p_subject IS NOT NULL
    UNION ALL
    SELECT s.uid, 'platform_alert', 1
      FROM staff s
     WHERE v_audience = 'super_admin' AND s.urole = 'Super Admin'
  ),
  best AS (
    SELECT DISTINCT ON (c.uid) c.uid, c.reason
      FROM cand c
     ORDER BY c.uid, c.pri
  )
  SELECT b.uid, b.reason, ch_in.enabled, ch_tm.enabled, ch_em.enabled
    FROM best b
    JOIN staff s ON s.uid = b.uid
    CROSS JOIN LATERAL public.notification_effective_pref(b.uid, p_category, 'in_app') ch_in
    CROSS JOIN LATERAL public.notification_effective_pref(b.uid, p_category, 'teams')  ch_tm
    CROSS JOIN LATERAL public.notification_effective_pref(b.uid, p_category, 'email')  ch_em
   WHERE (ch_in.enabled OR ch_tm.enabled OR ch_em.enabled)
     AND ch_in.scope <> 'off'
     AND NOT (b.reason = 'primary_csc' AND ch_in.scope NOT IN ('my_clients', 'my_and_delegated', 'all_clients'))
     AND NOT (b.reason = 'delegate'    AND ch_in.scope NOT IN ('my_and_delegated', 'all_clients'))
     AND NOT EXISTS (
           SELECT 1 FROM public.notification_client_overrides m
            WHERE m.user_id = b.uid AND m.tenant_id = p_tenant_id AND m.mode = 'mute');
END;
$fn$;

-- CREATE OR REPLACE keeps the existing privileges; restate them so the file is self-contained.
REVOKE ALL ON FUNCTION public.resolve_notification_recipients(text, bigint, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_notification_recipients(text, bigint, uuid, uuid) TO service_role;
