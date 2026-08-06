-- Close the real gap in v_client_tenant_users: the view never checks that
-- the caller belongs to the tenant being queried. Before this migration,
-- `anon` and `authenticated` both held a plain GRANT SELECT on the view
-- directly, and with security_invoker=false (its state left unfixed by
-- 20260805051000, which intentionally excluded this view) any caller could
-- read ANY tenant's full roster by changing the .eq('tenant_id', ...)
-- filter client-side — including fully unauthenticated `anon` callers.
--
-- The originally-proposed fix (#172, flip security_invoker=true) was the
-- wrong remedy for this specific view even setting aside the auth.sessions
-- grant issue already documented in 20260805051000: this view is a
-- deliberate "team directory" feature (ClientUsersPage.tsx shows the full
-- roster to every tenant member, not just admins/contacts —
-- canManagePortalUsers only gates the invite button and per-row edit
-- controls, not row visibility). Applying tenant_users/users' admin-centric
-- RLS via security_invoker would have silently narrowed every ordinary
-- member's view to just themselves — a real product regression, not just a
-- security tightening.
--
-- Fix: a SECURITY DEFINER RPC scoped to exactly one tenant_id, gated on
-- "caller is superadmin, vivacity staff, or an actual member of that
-- tenant" — then revoke direct SELECT on the view from anon/authenticated
-- so every end-user path goes through the authorization check. service_role
-- callers (ask-viv-fact-builder) are unaffected either way (service_role
-- bypasses RLS/grants regardless) and keep using the raw view directly for
-- cross-tenant analytics, which is intentional for that caller.
--
-- Verified live via SET LOCAL ROLE authenticated + request.jwt.claims
-- dry-runs (rolled back) on 2026-08-06: tenant isolation holds (a real
-- Test RTO A member sees only Test RTO A, 0 rows for Test RTO B and for an
-- unrelated tenant id), superadmin/staff see any tenant, and direct SELECT
-- against the view now correctly errors "permission denied for view
-- v_client_tenant_users" for the authenticated role. Applied to prod, then
-- smoke-tested end-to-end via the real /client/users page (View as Client
-- preview) as both a primary_contact and an academy_user on Test RTO A —
-- both see the full 5-user roster, zero console errors, matching the
-- pre-fix behaviour exactly (only the cross-tenant read path is closed).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_client_tenant_users(p_tenant_id integer)
RETURNS TABLE (
  row_type text,
  row_key text,
  tenant_id integer,
  user_id uuid,
  first_name text,
  last_name text,
  display_name text,
  email text,
  avatar_url text,
  relationship_role text,
  primary_contact boolean,
  secondary_contact boolean,
  access_scope text,
  last_sign_in_at timestamptz,
  invited_at timestamptz,
  invite_expires_at timestamptz,
  status text,
  member_since timestamptz,
  last_sent_at timestamptz,
  mailgun_message_id text,
  delivery_status text,
  delivery_event_at timestamptz,
  open_count integer,
  first_opened_at timestamptz,
  click_count integer,
  first_clicked_at timestamptz,
  last_active_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH authorized AS (
    SELECT (
      is_super_admin_safe((select auth.uid()))
      OR is_vivacity_team_safe((select auth.uid()))
      OR EXISTS (
        SELECT 1 FROM tenant_users tu2
        WHERE tu2.tenant_id = p_tenant_id
          AND tu2.user_id = (select auth.uid())
      )
    ) AS ok
  ),
  active_users AS (
    SELECT 'active'::text AS row_type,
      u.user_uuid::text AS row_key,
      tu.tenant_id,
      u.user_uuid AS user_id,
      NULLIF(TRIM(BOTH FROM u.first_name), ''::text) AS first_name,
      NULLIF(TRIM(BOTH FROM u.last_name), ''::text) AS last_name,
      COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(u.first_name, ''::text) || ' '::text) || COALESCE(u.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM u.email), ''::text), 'Unnamed user'::text) AS display_name,
      NULLIF(TRIM(BOTH FROM u.email), ''::text) AS email,
      u.avatar_path AS avatar_url,
      tu.relationship_role,
      COALESCE(tu.primary_contact, false) AS primary_contact,
      COALESCE(tu.secondary_contact, false) AS secondary_contact,
      tu.access_scope,
      u.last_sign_in_at,
      NULL::timestamptz AS invited_at,
      NULL::timestamptz AS invite_expires_at,
      CASE
        WHEN COALESCE(u.disabled, false) THEN 'disabled'::text
        WHEN COALESCE(u.archived, false) THEN 'archived'::text
        ELSE 'active'::text
      END AS status,
      tu.created_at AS member_since,
      NULL::timestamptz AS last_sent_at,
      NULL::text AS mailgun_message_id,
      NULL::text AS delivery_status,
      NULL::timestamptz AS delivery_event_at,
      NULL::integer AS open_count,
      NULL::timestamptz AS first_opened_at,
      NULL::integer AS click_count,
      NULL::timestamptz AS first_clicked_at,
      GREATEST(u.last_sign_in_at, sess.last_session_at) AS last_active_at
    FROM tenant_users tu
    JOIN users u ON u.user_uuid = tu.user_id
    LEFT JOIN LATERAL (
      SELECT max(s.updated_at) AS last_session_at
      FROM auth.sessions s
      WHERE s.user_id = u.user_uuid
    ) sess ON true
    WHERE tu.tenant_id = p_tenant_id
      AND NOT COALESCE(u.archived, false)
      AND NOT COALESCE(u.is_vivacity_internal, false)
  ),
  pending_invites AS (
    SELECT 'invited'::text AS row_type,
      ui.id::text AS row_key,
      ui.tenant_id,
      NULL::uuid AS user_id,
      NULLIF(TRIM(BOTH FROM ui.first_name), ''::text) AS first_name,
      NULLIF(TRIM(BOTH FROM ui.last_name), ''::text) AS last_name,
      COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(ui.first_name, ''::text) || ' '::text) || COALESCE(ui.last_name, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM ui.email), ''::text), 'Pending invite'::text) AS display_name,
      NULLIF(TRIM(BOTH FROM ui.email), ''::text) AS email,
      NULL::text AS avatar_url,
      ui.relationship_role,
      NULL::boolean AS primary_contact,
      NULL::boolean AS secondary_contact,
      NULL::text AS access_scope,
      NULL::timestamptz AS last_sign_in_at,
      ui.created_at AS invited_at,
      ui.expires_at AS invite_expires_at,
      'invited'::text AS status,
      ui.created_at AS member_since,
      ui.last_sent_at,
      ui.mailgun_message_id,
      ui.delivery_status,
      ui.delivery_event_at,
      ui.open_count,
      ui.first_opened_at,
      ui.click_count,
      ui.first_clicked_at,
      NULL::timestamptz AS last_active_at
    FROM user_invitations ui
    WHERE ui.tenant_id = p_tenant_id
      AND COALESCE(ui.status, 'pending'::text) = 'pending'::text
      AND ui.accepted_at IS NULL
      AND ui.revoked_at IS NULL
      AND ui.expires_at > now()
  )
  SELECT active_users.* FROM active_users, authorized WHERE authorized.ok
  UNION ALL
  SELECT pending_invites.* FROM pending_invites, authorized WHERE authorized.ok;
$$;

REVOKE ALL ON FUNCTION public.get_client_tenant_users(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_tenant_users(integer) TO authenticated;

COMMENT ON FUNCTION public.get_client_tenant_users(integer) IS
  'Tenant-scoped, authorization-checked replacement for direct authenticated/anon access to v_client_tenant_users. Caller must be superadmin, vivacity staff, or an actual member of p_tenant_id. Closes the cross-tenant read gap in the underlying view (any caller could previously read any tenant''s roster by changing the tenant_id filter client-side).';

-- Close the direct-access path: anon/authenticated no longer get a plain
-- GRANT SELECT on the view. service_role (ask-viv-fact-builder) is
-- unaffected — it bypasses grants/RLS regardless (rolbypassrls=true).
REVOKE ALL ON public.v_client_tenant_users FROM anon;
REVOKE ALL ON public.v_client_tenant_users FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
