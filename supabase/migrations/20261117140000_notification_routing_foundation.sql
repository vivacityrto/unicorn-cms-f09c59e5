-- Notification routing foundation (rollout step 1). Design and decisions:
-- docs/kb/reference/notification-redesign-2026-11-17.md
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- NO BEHAVIOUR CHANGE: nothing calls the resolver yet. fn_tm_on_message_insert,
-- emit_notification and every existing table are untouched. Rollout step 2
-- swaps the message trigger over.
--
-- Adds:
--   public.users.notification_exempt                    flag: never a notification recipient (not exposed to clients)
--   public.notification_category                        lookup: category key, label, default audience
--   public.notification_role_defaults                   defaults per RBAC role, category and channel
--   public.notification_preferences                     a person's own matrix (RLS: own rows)
--   public.notification_client_overrides                a person's watch / mute per client (RLS: own rows)
--   public.staff_notification_delegates                 assistant links (RLS: read; writes only through the two RPCs)
--   public.notification_effective_pref(uuid,text,text)  preference over role default
--   public.resolve_notification_recipients(...)         who should be told, and why
--   public.create_notification_delegate(...)            Super Admin, or a CSC for their own assistants
--   public.end_notification_delegate(uuid)
--
-- Delegates and exempt flags are DATA, not seeded here: they are applied as a
-- separate, audited production step (see the audit entry).

-- ---------------------------------------------------------------------------
-- 0. Exempt flag on users. Deliberately NOT granted to `authenticated`: users
--    is a per-column-grant table, nothing in the app needs to read this, and the
--    resolver is SECURITY DEFINER.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.notification_exempt IS
  'True for test or duplicate accounts that must never be a notification recipient. System accounts are excluded by role and is_system_account.';

-- ---------------------------------------------------------------------------
-- 1. Category lookup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_category (
  key              text PRIMARY KEY,
  label            text NOT NULL,
  default_audience text NOT NULL CHECK (default_audience IN ('owner', 'assignee', 'super_admin')),
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true
);

INSERT INTO public.notification_category (key, label, default_audience, sort_order) VALUES
  ('client_message', 'Client messages',                'owner',       10),
  ('support_ticket', 'Support tickets from clients',   'owner',       20),
  ('client_note',    'Notes added or shared',          'owner',       30),
  ('package_alert',  'Package hours alerts',           'owner',       40),
  ('risk_flag',      'Risks flagged',                  'owner',       50),
  ('task',           'Tasks assigned to you',          'assignee',    60),
  ('platform_alert', 'Platform alerts',                'super_admin', 70)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Role defaults. scope: my_clients (as primary CSC only), my_and_delegated
--    (plus clients of people you assist), all_clients (opt in to everything), off.
--    A role default never makes a non-owner a recipient on its own: the default
--    scope is my_and_delegated, so only owners and delegates are told.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_role_defaults (
  role     text NOT NULL,
  category text NOT NULL REFERENCES public.notification_category (key) ON DELETE CASCADE,
  channel  text NOT NULL CHECK (channel IN ('in_app', 'teams', 'email')),
  enabled  boolean NOT NULL,
  scope    text NOT NULL DEFAULT 'my_and_delegated'
           CHECK (scope IN ('my_clients', 'my_and_delegated', 'all_clients', 'off')),
  PRIMARY KEY (role, category, channel)
);

INSERT INTO public.notification_role_defaults (role, category, channel, enabled, scope)
SELECT r.role, c.key, ch.channel, (ch.channel <> 'email'), 'my_and_delegated'
  FROM (VALUES ('CSC'), ('Super Admin'), ('Team Member'), ('Integrator'), ('BGT')) AS r(role)
  CROSS JOIN public.notification_category c
  CROSS JOIN (VALUES ('in_app'), ('teams'), ('email')) AS ch(channel)
ON CONFLICT (role, category, channel) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. A person's own preferences and per-client overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    uuid NOT NULL REFERENCES public.users (user_uuid) ON DELETE CASCADE,
  category   text NOT NULL REFERENCES public.notification_category (key) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('in_app', 'teams', 'email')),
  enabled    boolean NOT NULL,
  scope      text NOT NULL DEFAULT 'my_and_delegated'
             CHECK (scope IN ('my_clients', 'my_and_delegated', 'all_clients', 'off')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, channel)
);

CREATE TABLE IF NOT EXISTS public.notification_client_overrides (
  user_id    uuid   NOT NULL REFERENCES public.users (user_uuid) ON DELETE CASCADE,
  tenant_id  bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  mode       text   NOT NULL CHECK (mode IN ('watch', 'mute')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- 4. Delegates (assistants). Written only through the RPCs below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_notification_delegates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_kind    text NOT NULL CHECK (principal_kind IN ('user', 'all_csc')),
  principal_user_id uuid REFERENCES public.users (user_uuid) ON DELETE CASCADE,
  delegate_user_id  uuid NOT NULL REFERENCES public.users (user_uuid) ON DELETE CASCADE,
  tenant_id         bigint REFERENCES public.tenants (id) ON DELETE CASCADE,
  categories        text[],
  starts_at         timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  created_by        uuid,
  ended_by          uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snd_principal_shape CHECK (
    (principal_kind = 'user' AND principal_user_id IS NOT NULL)
    OR (principal_kind = 'all_csc' AND principal_user_id IS NULL)),
  CONSTRAINT snd_not_self CHECK (principal_user_id IS DISTINCT FROM delegate_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS snd_one_active_link
  ON public.staff_notification_delegates (
    principal_kind,
    COALESCE(principal_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    delegate_user_id,
    COALESCE(tenant_id, -1))
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS snd_delegate_active
  ON public.staff_notification_delegates (delegate_user_id) WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Table privileges and RLS. New public tables carry default grants to
--    anon and authenticated, so revoke first and grant only what is needed.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.notification_category, public.notification_role_defaults,
              public.notification_preferences, public.notification_client_overrides,
              public.staff_notification_delegates FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.notification_category, public.notification_role_defaults TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences, public.notification_client_overrides TO authenticated;
GRANT SELECT ON public.staff_notification_delegates TO authenticated;
GRANT ALL ON public.notification_category, public.notification_role_defaults,
             public.notification_preferences, public.notification_client_overrides,
             public.staff_notification_delegates TO service_role;

ALTER TABLE public.notification_category          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_role_defaults     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_client_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_notification_delegates   ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_category_staff_read ON public.notification_category
  FOR SELECT TO authenticated USING (public.is_vivacity_team_safe(auth.uid()));
CREATE POLICY notification_role_defaults_staff_read ON public.notification_role_defaults
  FOR SELECT TO authenticated USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_vivacity_team_safe(auth.uid()));
CREATE POLICY notification_preferences_super_admin_read ON public.notification_preferences
  FOR SELECT TO authenticated USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY notification_client_overrides_own ON public.notification_client_overrides
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY staff_notification_delegates_read ON public.staff_notification_delegates
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin_safe(auth.uid())
    OR (public.is_vivacity_team_safe(auth.uid())
        AND (principal_user_id = auth.uid() OR delegate_user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 6. Effective preference: the person's own row, else the role default,
--    else enabled with the default scope.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_effective_pref(p_user uuid, p_category text, p_channel text)
RETURNS TABLE (enabled boolean, scope text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT COALESCE(np.enabled, rd.enabled, true),
         COALESCE(np.scope, rd.scope, 'my_and_delegated')
    FROM (SELECT 1) AS one
    LEFT JOIN public.users u ON u.user_uuid = p_user
    LEFT JOIN public.notification_preferences np
           ON np.user_id = p_user AND np.category = p_category AND np.channel = p_channel
    LEFT JOIN public.notification_role_defaults rd
           ON rd.role = u.unicorn_role AND rd.category = p_category AND rd.channel = p_channel;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. The resolver. Returns one row per person to notify, with the reason and
--    the channels that person has enabled. Never returns the actor, archived or
--    disabled users, system accounts or exempt accounts.
--
--    owner audience : the tenant's primary CSC(s); their delegates; anyone who
--                     opted in to all clients or is watching the client; and, if
--                     the tenant has no active primary CSC, every Super Admin.
--    assignee       : p_subject.
--    super_admin    : every Super Admin.
-- ---------------------------------------------------------------------------
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
  WITH staff AS (
    SELECT u.user_uuid AS uid, u.unicorn_role AS urole
      FROM public.users u
     WHERE u.is_vivacity_internal = true
       AND COALESCE(u.archived, false) = false
       AND COALESCE(u.disabled, false) = false
       AND COALESCE(u.is_system_account, false) = false
       AND u.unicorn_role IS DISTINCT FROM 'System Account'
       AND u.notification_exempt = false
       AND u.user_uuid IS DISTINCT FROM p_actor
  ),
  owners AS (
    SELECT a.csc_user_id AS uid
      FROM public.tenant_csc_assignments a
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

-- ---------------------------------------------------------------------------
-- 8. Delegate RPCs. Super Admins manage anyone's links; a CSC manages only
--    links where they are the principal, for tenants they hold an active
--    assignment on (null tenant = all of their own clients). all_csc links are
--    Super Admin only. Every create and end is written to audit_events.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification_delegate(
  p_principal_kind    text,
  p_principal_user_id uuid,
  p_delegate_user_id  uuid,
  p_tenant_id         bigint DEFAULT NULL,
  p_categories        text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_sa     boolean;
  v_id     uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_caller) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  v_sa := public.is_super_admin_safe(v_caller);

  IF p_principal_kind NOT IN ('user', 'all_csc') THEN
    RAISE EXCEPTION 'principal_kind must be user or all_csc' USING ERRCODE = '22023';
  END IF;

  IF p_principal_kind = 'all_csc' THEN
    IF NOT v_sa THEN
      RAISE EXCEPTION 'Only a Super Admin can create an all_csc delegate' USING ERRCODE = '42501';
    END IF;
    IF p_principal_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'principal_user_id must be null for all_csc' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_principal_user_id IS NULL THEN
      RAISE EXCEPTION 'principal_user_id is required' USING ERRCODE = '22023';
    END IF;
    IF NOT v_sa AND p_principal_user_id <> v_caller THEN
      RAISE EXCEPTION 'You can only add an assistant for yourself' USING ERRCODE = '42501';
    END IF;
    IF NOT v_sa AND p_tenant_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.tenant_csc_assignments a
          WHERE a.csc_user_id = v_caller AND a.tenant_id = p_tenant_id
            AND a.ended_at IS NULL AND a.superseded_at IS NULL) THEN
      RAISE EXCEPTION 'You are not the primary CSC for that client' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.user_uuid = p_delegate_user_id
          AND u.is_vivacity_internal = true
          AND COALESCE(u.archived, false) = false
          AND COALESCE(u.disabled, false) = false
          AND COALESCE(u.is_system_account, false) = false
          AND u.unicorn_role IS DISTINCT FROM 'System Account'
          AND u.notification_exempt = false) THEN
    RAISE EXCEPTION 'The delegate must be an active internal staff member' USING ERRCODE = '22023';
  END IF;

  IF p_categories IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_categories) AS c(k)
        WHERE NOT EXISTS (SELECT 1 FROM public.notification_category x WHERE x.key = c.k)) THEN
    RAISE EXCEPTION 'Unknown notification category in p_categories' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_notification_delegates
    (principal_kind, principal_user_id, delegate_user_id, tenant_id, categories, created_by)
  VALUES
    (p_principal_kind, p_principal_user_id, p_delegate_user_id, p_tenant_id, p_categories, v_caller)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES ('notification_delegate', v_id, 'created', v_caller,
          jsonb_build_object('principal_kind', p_principal_kind,
                             'principal_user_id', p_principal_user_id,
                             'delegate_user_id', p_delegate_user_id,
                             'tenant_id', p_tenant_id,
                             'categories', p_categories));
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.end_notification_delegate(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_row    public.staff_notification_delegates%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_caller) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.staff_notification_delegates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_row.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'No active delegate link with that id' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin_safe(v_caller)
     AND NOT (v_row.principal_kind = 'user' AND v_row.principal_user_id = v_caller) THEN
    RAISE EXCEPTION 'You can only end your own assistant links' USING ERRCODE = '42501';
  END IF;

  UPDATE public.staff_notification_delegates
     SET ended_at = now(), ended_by = v_caller
   WHERE id = p_id;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES ('notification_delegate', p_id, 'ended', v_caller,
          jsonb_build_object('principal_kind', v_row.principal_kind,
                             'principal_user_id', v_row.principal_user_id,
                             'delegate_user_id', v_row.delegate_user_id,
                             'tenant_id', v_row.tenant_id));
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. Function privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.notification_effective_pref(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_notification_recipients(text, bigint, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_notification_delegate(text, uuid, uuid, bigint, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_notification_delegate(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.notification_effective_pref(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_notification_recipients(text, bigint, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_notification_delegate(text, uuid, uuid, bigint, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_notification_delegate(uuid) TO authenticated, service_role;
