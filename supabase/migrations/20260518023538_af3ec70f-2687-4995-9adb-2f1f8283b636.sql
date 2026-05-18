-- ============================================================
-- PHASE 4C: tenant_user_role enum → dd_relationship_role lookup
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 0 — PRE-FLIGHT SAFETY CHECKS
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dd_relationship_role'
  ) THEN
    RAISE EXCEPTION 'ABORT: dd_relationship_role already exists. Migration may have been partially applied.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE relationship_role::text NOT IN (
      'primary_contact','secondary_contact','user','academy_user'
    )
    AND relationship_role IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ABORT: tenant_users.relationship_role contains unexpected values.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_invitations
    WHERE relationship_role::text NOT IN (
      'primary_contact','secondary_contact','user','academy_user'
    )
    AND relationship_role IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ABORT: user_invitations.relationship_role contains unexpected values.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 1 — CREATE AND SEED dd_relationship_role
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.dd_relationship_role (
  id          serial        NOT NULL,
  value       text          NOT NULL,
  label       text          NOT NULL,
  sort_order  integer       NOT NULL DEFAULT 0,
  is_active   boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT dd_relationship_role_pkey PRIMARY KEY (id),
  CONSTRAINT dd_relationship_role_value_key UNIQUE (value)
);

INSERT INTO public.dd_relationship_role (value, label, sort_order) VALUES
  ('primary_contact',   'Primary Contact',   1),
  ('secondary_contact', 'Secondary Contact', 2),
  ('user',              'User',              3),
  ('academy_user',      'Academy User',      4);

ALTER TABLE public.dd_relationship_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_relationship_role: authenticated read"
  ON public.dd_relationship_role
  FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- SECTION 1b — DROP DEPENDENT OBJECTS BEFORE COLUMN TYPE CHANGE
-- (Policies, view, and unique partial indexes all reference the
--  column with the enum cast; recreated unchanged below.)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "audit_user_events_select_tenant_admin"
  ON public.audit_user_events;

DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant"
  ON public.pdp_cycles;

DROP VIEW IF EXISTS public.v_client_tenant_users;

DROP INDEX IF EXISTS public.uniq_tenant_one_primary_contact;
DROP INDEX IF EXISTS public.uniq_tenant_one_secondary_contact;

-- ─────────────────────────────────────────────────────────────
-- SECTION 2 — MIGRATE tenant_users.relationship_role
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_users
  ALTER COLUMN relationship_role TYPE text
    USING relationship_role::text;

ALTER TABLE public.tenant_users
  ADD CONSTRAINT fk_tenant_users_relationship_role
    FOREIGN KEY (relationship_role)
    REFERENCES public.dd_relationship_role(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────
-- SECTION 3 — MIGRATE user_invitations.relationship_role
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_invitations
  ALTER COLUMN relationship_role TYPE text
    USING relationship_role::text;

ALTER TABLE public.user_invitations
  ADD CONSTRAINT fk_user_invitations_relationship_role
    FOREIGN KEY (relationship_role)
    REFERENCES public.dd_relationship_role(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────
-- SECTION 4 — RECREATE UNIQUE PARTIAL INDEXES (without enum cast)
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX uniq_tenant_one_primary_contact
  ON public.tenant_users (tenant_id)
  WHERE relationship_role = 'primary_contact';

CREATE UNIQUE INDEX uniq_tenant_one_secondary_contact
  ON public.tenant_users (tenant_id)
  WHERE relationship_role = 'secondary_contact';

-- ─────────────────────────────────────────────────────────────
-- SECTION 4b — RECREATE v_client_tenant_users (definition unchanged)
-- ─────────────────────────────────────────────────────────────

CREATE VIEW public.v_client_tenant_users AS
WITH active_users AS (
  SELECT 'active'::text AS row_type,
    u.user_uuid::text AS row_key,
    tu.tenant_id,
    u.user_uuid AS user_id,
    NULLIF(TRIM(BOTH FROM u.first_name), ''::text) AS first_name,
    NULLIF(TRIM(BOTH FROM u.last_name), ''::text) AS last_name,
    COALESCE(
      NULLIF(TRIM(BOTH FROM u.full_name), ''::text),
      NULLIF(TRIM(BOTH FROM (COALESCE(u.first_name, ''::text) || ' '::text) || COALESCE(u.last_name, ''::text)), ''::text),
      NULLIF(TRIM(BOTH FROM u.email), ''::text),
      'Unnamed user'::text
    ) AS display_name,
    NULLIF(TRIM(BOTH FROM u.email), ''::text) AS email,
    u.avatar_path AS avatar_url,
    tu.relationship_role::text AS relationship_role,
    COALESCE(tu.primary_contact, false) AS primary_contact,
    COALESCE(tu.secondary_contact, false) AS secondary_contact,
    tu.access_scope,
    u.last_sign_in_at,
    NULL::timestamp with time zone AS invited_at,
    NULL::timestamp with time zone AS invite_expires_at,
    CASE
      WHEN COALESCE(u.disabled, false) THEN 'disabled'::text
      WHEN COALESCE(u.archived, false) THEN 'archived'::text
      ELSE 'active'::text
    END AS status,
    tu.created_at AS member_since,
    NULL::timestamp with time zone AS last_sent_at,
    NULL::text AS mailgun_message_id
  FROM public.tenant_users tu
    JOIN public.users u ON u.user_uuid = tu.user_id
  WHERE NOT COALESCE(u.archived, false)
    AND NOT COALESCE(u.is_vivacity_internal, false)
), pending_invites AS (
  SELECT 'invited'::text AS row_type,
    ui.id::text AS row_key,
    ui.tenant_id,
    NULL::uuid AS user_id,
    NULLIF(TRIM(BOTH FROM ui.first_name), ''::text) AS first_name,
    NULLIF(TRIM(BOTH FROM ui.last_name), ''::text) AS last_name,
    COALESCE(
      NULLIF(TRIM(BOTH FROM (COALESCE(ui.first_name, ''::text) || ' '::text) || COALESCE(ui.last_name, ''::text)), ''::text),
      NULLIF(TRIM(BOTH FROM ui.email), ''::text),
      'Pending invite'::text
    ) AS display_name,
    NULLIF(TRIM(BOTH FROM ui.email), ''::text) AS email,
    NULL::text AS avatar_url,
    ui.relationship_role::text AS relationship_role,
    NULL::boolean AS primary_contact,
    NULL::boolean AS secondary_contact,
    NULL::text AS access_scope,
    NULL::timestamp with time zone AS last_sign_in_at,
    ui.created_at AS invited_at,
    ui.expires_at AS invite_expires_at,
    'invited'::text AS status,
    ui.created_at AS member_since,
    ui.last_sent_at,
    ui.mailgun_message_id
  FROM public.user_invitations ui
  WHERE COALESCE(ui.status, 'pending'::text) = 'pending'::text
    AND ui.accepted_at IS NULL
    AND ui.revoked_at IS NULL
    AND ui.expires_at > now()
)
SELECT row_type, row_key, tenant_id, user_id, first_name, last_name,
       display_name, email, avatar_url, relationship_role,
       primary_contact, secondary_contact, access_scope, last_sign_in_at,
       invited_at, invite_expires_at, status, member_since,
       last_sent_at, mailgun_message_id
FROM active_users
UNION ALL
SELECT row_type, row_key, tenant_id, user_id, first_name, last_name,
       display_name, email, avatar_url, relationship_role,
       primary_contact, secondary_contact, access_scope, last_sign_in_at,
       invited_at, invite_expires_at, status, member_since,
       last_sent_at, mailgun_message_id
FROM pending_invites;

-- ─────────────────────────────────────────────────────────────
-- SECTION 5 — RECREATE set_relationship_role WITH text PARAMETER
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_relationship_role(
  p_tenant_id          bigint,
  p_user_id            uuid,
  p_relationship_role  text,
  p_reason             text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller         uuid := auth.uid();
  v_is_staff       boolean := false;
  v_is_tenant_admin boolean := false;
  v_tu_id          bigint;
  v_old_role       text;
  v_tu_role        text;
  v_tu_primary     boolean;
  v_tu_secondary   boolean;
  v_tu_access_scope text;
  v_u_unicorn_role public.unicorn_role;
  v_u_user_type    text;
  v_tm_role        text;
  v_tm_status      text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_relationship_role IS NULL THEN
    RAISE EXCEPTION 'set_relationship_role: missing required parameters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dd_relationship_role
    WHERE value = p_relationship_role AND is_active = true
  ) THEN
    RAISE EXCEPTION 'set_relationship_role: invalid relationship_role value: %',
      p_relationship_role;
  END IF;

  v_is_staff := public.is_super_admin_safe(v_caller)
             OR public.is_vivacity_team_safe(v_caller);

  IF NOT v_is_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = p_tenant_id
        AND user_id = v_caller
        AND relationship_role IN ('primary_contact','secondary_contact')
        AND access_scope = 'full'
    ) INTO v_is_tenant_admin;

    IF NOT v_is_tenant_admin THEN
      RAISE EXCEPTION 'Not authorized to change roles for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  CASE p_relationship_role
    WHEN 'primary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := true;  v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'secondary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := false; v_tu_secondary := true;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'active';
    WHEN 'academy_user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'academy_only';
      v_u_unicorn_role := 'Academy User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'inactive';
    ELSE
      RAISE EXCEPTION 'Unsupported relationship_role %', p_relationship_role;
  END CASE;

  SELECT id, relationship_role
    INTO v_tu_id, v_old_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_tu_id IS NULL THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  UPDATE public.tenant_users
     SET relationship_role = p_relationship_role,
         role              = v_tu_role,
         primary_contact   = v_tu_primary,
         secondary_contact = v_tu_secondary,
         access_scope      = v_tu_access_scope
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  UPDATE public.users
     SET unicorn_role = v_u_unicorn_role,
         user_type    = v_u_user_type,
         updated_at   = now()
   WHERE user_uuid = p_user_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (p_tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role       = EXCLUDED.role,
        status     = EXCLUDED.status,
        updated_at = now();

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id,
    p_user_id,
    'tenant_users',
    NULL,
    'relationship_role_changed',
    p_reason,
    jsonb_build_object(
      'tu_id', v_tu_id,
      'old_relationship_role', v_old_role,
      'new_relationship_role', p_relationship_role,
      'tu_role', v_tu_role,
      'tu_primary_contact', v_tu_primary,
      'tu_secondary_contact', v_tu_secondary,
      'tu_access_scope', v_tu_access_scope,
      'tm_role', v_tm_role,
      'tm_status', v_tm_status,
      'changed_by', v_caller
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'relationship_role', p_relationship_role,
    'access_scope', v_tu_access_scope,
    'tm_status', v_tm_status
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 6 — UPDATE accept_invitation_v2 VARIABLE TYPE
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_invitation_v2(
  p_token_hash text,
  p_user_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invitation              record;
  v_existing_uuid           uuid;
  v_existing_accepted       boolean;
  v_relationship_role       text;
  v_tu_role                 text;
  v_tu_primary              boolean;
  v_tu_secondary            boolean;
  v_tu_access_scope         text;
  v_u_unicorn_role          public.unicorn_role;
  v_u_user_type             text;
  v_tm_role                 text;
  v_tm_status               text;
  v_is_internal_fallback    boolean := false;
BEGIN
  IF p_token_hash IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PARAMS',
      'message', 'Missing required parameters');
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token_hash = p_token_hash AND status = 'pending';

  IF v_invitation IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_invitations
      WHERE token_hash = p_token_hash
        AND status IN ('accepted', 'successful')
    ) INTO v_existing_accepted;

    IF v_existing_accepted THEN
      RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_ACCEPTED',
        'message', 'Invitation already accepted');
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TOKEN',
      'message', 'Invalid or expired invitation token');
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.user_invitations
       SET status = 'expired', updated_at = now()
     WHERE id = v_invitation.id;

    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED',
      'message', 'This invitation has expired');
  END IF;

  IF v_invitation.relationship_role IS NOT NULL THEN
    v_relationship_role := v_invitation.relationship_role;
  ELSIF v_invitation.unicorn_role::text = 'Admin' THEN
    v_relationship_role := 'primary_contact';
  ELSE
    v_relationship_role := 'user';
  END IF;

  IF (v_invitation.relationship_role IS NULL
      AND v_invitation.unicorn_role::text NOT IN ('Admin','User'))
     OR v_invitation.tenant_id = 6372 THEN
    v_is_internal_fallback := true;
  END IF;

  CASE v_relationship_role
    WHEN 'primary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := true;  v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'secondary_contact' THEN
      v_tu_role := 'parent'; v_tu_primary := false; v_tu_secondary := true;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'Admin'; v_u_user_type := 'Client Parent';
      v_tm_role := 'Admin'; v_tm_status := 'active';
    WHEN 'user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'full';
      v_u_unicorn_role := 'User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'active';
    WHEN 'academy_user' THEN
      v_tu_role := 'child';  v_tu_primary := false; v_tu_secondary := false;
      v_tu_access_scope := 'academy_only';
      v_u_unicorn_role := 'Academy User'; v_u_user_type := 'Client Child';
      v_tm_role := 'General User'; v_tm_status := 'inactive';
  END CASE;

  IF v_is_internal_fallback THEN
    v_u_user_type := 'Vivacity Team';
    IF v_invitation.unicorn_role IS NOT NULL THEN
      v_u_unicorn_role := v_invitation.unicorn_role::public.unicorn_role;
    END IF;
    v_tm_role := 'Admin';
    v_tm_status := 'active';
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users WHERE email = lower(v_invitation.email);

  IF v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id THEN
    UPDATE public.users
       SET user_uuid    = p_user_id,
           first_name   = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name    = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role,
           user_type    = v_u_user_type,
           tenant_id    = COALESCE(tenant_id, v_invitation.tenant_id),
           is_team      = (v_u_user_type = 'Vivacity Team'),
           updated_at   = now()
     WHERE user_uuid = v_existing_uuid;
  ELSIF v_existing_uuid IS NULL THEN
    INSERT INTO public.users (
      user_uuid, email, first_name, last_name, unicorn_role, user_type,
      tenant_id, is_team, disabled, archived
    ) VALUES (
      p_user_id, lower(v_invitation.email),
      COALESCE(NULLIF(v_invitation.first_name, ''), '-'),
      COALESCE(NULLIF(v_invitation.last_name, ''), '-'),
      v_u_unicorn_role, v_u_user_type, v_invitation.tenant_id,
      (v_u_user_type = 'Vivacity Team'), false, false
    );
  ELSE
    UPDATE public.users
       SET first_name   = COALESCE(NULLIF(v_invitation.first_name, ''), first_name),
           last_name    = COALESCE(NULLIF(v_invitation.last_name, ''), last_name),
           unicorn_role = v_u_unicorn_role,
           user_type    = v_u_user_type,
           tenant_id    = COALESCE(tenant_id, v_invitation.tenant_id),
           updated_at   = now()
     WHERE user_uuid = p_user_id;
  END IF;

  INSERT INTO public.tenant_users (
    user_id, tenant_id, role, primary_contact, secondary_contact,
    access_scope, relationship_role
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_tu_role, v_tu_primary,
    v_tu_secondary, v_tu_access_scope, v_relationship_role
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    relationship_role = EXCLUDED.relationship_role,
    role              = EXCLUDED.role,
    primary_contact   = EXCLUDED.primary_contact,
    secondary_contact = EXCLUDED.secondary_contact,
    access_scope      = EXCLUDED.access_scope;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (v_invitation.tenant_id, p_user_id, v_tm_role, v_tm_status)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    role       = EXCLUDED.role,
    status     = EXCLUDED.status,
    updated_at = now();

  UPDATE public.profiles
     SET active_tenant_id = (
           SELECT id_uuid FROM public.tenants
           WHERE id = v_invitation.tenant_id
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND active_tenant_id IS NULL;

  UPDATE public.user_invitations
     SET status              = 'accepted',
         accepted_at         = now(),
         accepted_by_user_id = p_user_id,
         updated_at          = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_invitation.tenant_id, p_user_id, 'user_invitations', v_invitation.id,
    'invitation_accepted', 'User accepted invitation via self-service',
    jsonb_build_object(
      'email', v_invitation.email,
      'tenant_id', v_invitation.tenant_id,
      'unicorn_role', v_u_unicorn_role::text,
      'user_type', v_u_user_type::text,
      'tenant_users_role', v_tu_role,
      'primary_contact', v_tu_primary,
      'secondary_contact', v_tu_secondary,
      'access_scope', v_tu_access_scope,
      'relationship_role', v_relationship_role,
      'tm_role', v_tm_role,
      'tm_status', v_tm_status,
      'invitation_relationship_role_source',
        CASE WHEN v_invitation.relationship_role IS NOT NULL
             THEN 'invitation_column' ELSE 'unicorn_role_fallback' END,
      'internal_fallback', v_is_internal_fallback,
      'invitation_id', v_invitation.id,
      'relinked_from_uuid',
        CASE WHEN v_existing_uuid IS NOT NULL AND v_existing_uuid <> p_user_id
             THEN v_existing_uuid::text ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'SUCCESS',
    'tenant_id', v_invitation.tenant_id,
    'role', v_tu_role,
    'unicorn_role', v_u_unicorn_role::text,
    'primary_contact', v_tu_primary,
    'secondary_contact', v_tu_secondary,
    'access_scope', v_tu_access_scope,
    'relationship_role', v_relationship_role,
    'message', 'Invitation accepted successfully'
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 7 — RECREATE TWO RLS POLICIES (without enum cast)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "audit_user_events_select_tenant_admin"
  ON public.audit_user_events
  FOR SELECT
  USING (
    (tenant_id IS NOT NULL)
    AND (EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = (SELECT auth.uid())
        AND tu.tenant_id = audit_user_events.tenant_id
        AND tu.access_scope = 'full'::text
        AND tu.relationship_role = ANY (
          ARRAY['primary_contact'::text, 'secondary_contact'::text]
        )
    ))
  );

CREATE POLICY "pdp_cycles: tenant admins view their tenant"
  ON public.pdp_cycles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = (SELECT auth.uid())
        AND tu.tenant_id = pdp_cycles.tenant_id
        AND tu.access_scope = 'full'::text
        AND tu.relationship_role = ANY (
          ARRAY['primary_contact'::text, 'secondary_contact'::text]
        )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- SECTION 8 — RETAIN LEGACY ENUM WITH COMMENT
-- ─────────────────────────────────────────────────────────────

COMMENT ON TYPE public.tenant_user_role IS
  'Superseded by dd_relationship_role (Phase 4C, May 2026). '
  'Retained for rollback safety. Do NOT drop until all referencing archive '
  'tables and rollback paths are confirmed clear. '
  'Requires Carl/Dave sign-off before permanent DROP.';

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK SQL — run in order if migration must be reversed
-- ─────────────────────────────────────────────────────────────
/*
1. Drop dependent objects (required before TYPE revert):
   DROP POLICY IF EXISTS "audit_user_events_select_tenant_admin" ON public.audit_user_events;
   DROP POLICY IF EXISTS "pdp_cycles: tenant admins view their tenant" ON public.pdp_cycles;
   DROP VIEW IF EXISTS public.v_client_tenant_users;
   DROP INDEX IF EXISTS public.uniq_tenant_one_primary_contact;
   DROP INDEX IF EXISTS public.uniq_tenant_one_secondary_contact;

2. Revert tenant_users column:
   ALTER TABLE public.tenant_users
     DROP CONSTRAINT IF EXISTS fk_tenant_users_relationship_role;
   ALTER TABLE public.tenant_users
     ALTER COLUMN relationship_role TYPE public.tenant_user_role
       USING relationship_role::public.tenant_user_role;

3. Revert user_invitations column:
   ALTER TABLE public.user_invitations
     DROP CONSTRAINT IF EXISTS fk_user_invitations_relationship_role;
   ALTER TABLE public.user_invitations
     ALTER COLUMN relationship_role TYPE public.tenant_user_role
       USING relationship_role::public.tenant_user_role;

4. Recreate unique partial indexes with enum cast:
   CREATE UNIQUE INDEX uniq_tenant_one_primary_contact
     ON public.tenant_users (tenant_id)
     WHERE relationship_role = 'primary_contact'::tenant_user_role;
   CREATE UNIQUE INDEX uniq_tenant_one_secondary_contact
     ON public.tenant_users (tenant_id)
     WHERE relationship_role = 'secondary_contact'::tenant_user_role;

5. Recreate v_client_tenant_users (definition is identical — text cast already used).
6. Restore set_relationship_role with original enum parameter type.
7. Restore accept_invitation_v2 with original enum variable type.
8. Recreate RLS policies with ::tenant_user_role casts.
9. Drop dd_relationship_role:
   DROP TABLE IF EXISTS public.dd_relationship_role;
*/
