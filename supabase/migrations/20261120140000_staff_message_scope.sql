-- Which clients' messages are mine? Used by the staff messenger bubble to show each person the threads they are
-- responsible for first, using exactly the same rules that decide who is notified of a client message.
-- Adds one read-only function, public.get_my_message_scope(). No table, policy or row is changed.
--
-- It does not copy the routing rules: for every active client organisation it asks public.resolve_notification_recipients
-- for the 'client_message' category and keeps the organisations where the caller is a recipient. So the bubble and the bell
-- can never disagree about who owns a client, and a change to the routing (a new delegate, a reassigned consultant, a
-- watch or mute) changes the bubble with it.
--
-- reason is the resolver's own word: primary_csc (my client), delegate (I cover for their consultant, who is named in
-- covering_name), opted_in (my preference is all clients), watching (I chose to watch this client) or unassigned (a Super
-- Admin, for an organisation with no consultant). Only Vivacity staff get rows; everyone else gets none.

CREATE OR REPLACE FUNCTION public.get_my_message_scope()
RETURNS TABLE(tenant_id bigint, reason text, covering_user_id uuid, covering_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    t.id AS tenant_id,
    r.reason,
    CASE WHEN r.reason = 'delegate' THEN o.csc_user_id END AS covering_user_id,
    CASE WHEN r.reason = 'delegate' THEN NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') END AS covering_name
  FROM public.tenants t
  CROSS JOIN LATERAL public.resolve_notification_recipients('client_message', t.id, NULL) r
  LEFT JOIN LATERAL (
    SELECT a.csc_user_id
    FROM public.tenant_csc_assignments a
    WHERE a.tenant_id = t.id AND a.ended_at IS NULL AND a.superseded_at IS NULL
    LIMIT 1
  ) o ON true
  LEFT JOIN public.users u ON u.user_uuid = o.csc_user_id
  WHERE t.id != 6372
    AND t.status = 'active'
    AND r.user_id = (SELECT auth.uid())
    AND public.is_vivacity_team_safe((SELECT auth.uid()));
$function$;

REVOKE ALL ON FUNCTION public.get_my_message_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_message_scope() TO authenticated;
