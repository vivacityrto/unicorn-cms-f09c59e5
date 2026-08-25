-- ============================================================
-- Tenant contact list + reusable contact groups
-- ============================================================
-- Groundwork for automating Teams event registration: a tenant's
-- RTO contacts (not Unicorn users) need to be tracked with the
-- same First/Last/Email/Position Type shape as tenant_users, and
-- combinable with real users into named groups for bulk actions.
--
-- tenant_contacts is deliberately NOT a dd_relationship_role value:
-- that lookup drives RLS/admin gating for seat-holders. A contact
-- has no seat and no relationship_role until promoted.

-- ─────────────────────────────────────────────────────────────
-- SECTION 1 — tenant_contacts
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.tenant_contacts (
  id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           bigint        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  first_name          text          NOT NULL,
  last_name           text          NULL,
  email               text          NOT NULL,
  position_type       text          NULL REFERENCES public.dd_position_type(value)
                                       ON UPDATE CASCADE ON DELETE RESTRICT,
  status              text          NOT NULL DEFAULT 'active'
                                       CONSTRAINT tenant_contacts_status_check
                                       CHECK (status IN ('active','archived')),
  promoted_to_user_id uuid          NULL,
  promoted_at         timestamptz   NULL,
  created_by          uuid          NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_contacts_tenant_id ON public.tenant_contacts(tenant_id);
CREATE INDEX idx_tenant_contacts_status ON public.tenant_contacts(tenant_id, status);

ALTER TABLE public.tenant_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_contacts_select" ON public.tenant_contacts
  FOR SELECT TO authenticated
  USING (
    public.has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  );

CREATE POLICY "tenant_contacts_insert" ON public.tenant_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_parent_safe(tenant_id, (SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  );

CREATE POLICY "tenant_contacts_update" ON public.tenant_contacts
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_parent_safe(tenant_id, (SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_tenant_parent_safe(tenant_id, (SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  );

CREATE POLICY "tenant_contacts_delete" ON public.tenant_contacts
  FOR DELETE TO authenticated
  USING (
    public.is_tenant_parent_safe(tenant_id, (SELECT auth.uid()))
    OR public.is_super_admin_safe((SELECT auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- SECTION 2 — tenant_contact_groups + members (staff-only)
-- ─────────────────────────────────────────────────────────────
-- Named, reusable lists mixing tenant_users and tenant_contacts,
-- built from the cross-tenant Administration directory. Staff-only:
-- this is not a tenant self-service feature.

CREATE TABLE public.tenant_contact_groups (
  id          bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text          NOT NULL,
  description text          NULL,
  created_by  uuid          NULL,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_contact_group_members (
  id          bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id    bigint        NOT NULL REFERENCES public.tenant_contact_groups(id) ON DELETE CASCADE,
  member_type text          NOT NULL CONSTRAINT tenant_contact_group_members_type_check
                               CHECK (member_type IN ('user','contact')),
  member_id   text          NOT NULL,
  tenant_id   bigint        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  added_by    uuid          NULL,
  added_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT tenant_contact_group_members_unique UNIQUE (group_id, member_type, member_id)
);

CREATE INDEX idx_tenant_contact_group_members_group_id ON public.tenant_contact_group_members(group_id);

ALTER TABLE public.tenant_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_contact_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_contact_groups_staff_only" ON public.tenant_contact_groups
  FOR ALL TO authenticated
  USING (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  );

CREATE POLICY "tenant_contact_group_members_staff_only" ON public.tenant_contact_group_members
  FOR ALL TO authenticated
  USING (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- SECTION 3 — mark_tenant_contact_promoted RPC
-- ─────────────────────────────────────────────────────────────
-- Called by the client after the existing `invite-user` edge
-- function successfully creates the invite/tenant_users row for
-- a contact being swapped into an active seat. Kept separate from
-- invite-user (no changes to that function) — this only stamps the
-- contact row so it and any group memberships survive the promotion.

CREATE OR REPLACE FUNCTION public.mark_tenant_contact_promoted(
  p_contact_id bigint,
  p_user_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_tenant_id bigint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_contacts
  WHERE id = p_contact_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_contacts row not found for id %', p_contact_id;
  END IF;

  IF NOT (
    public.is_tenant_parent_safe(v_tenant_id, v_caller)
    OR public.is_super_admin_safe(v_caller)
    OR public.is_vivacity_staff(v_caller)
  ) THEN
    RAISE EXCEPTION 'Not authorized to promote contacts for tenant %', v_tenant_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_contacts
     SET promoted_to_user_id = p_user_id,
         promoted_at = now(),
         status = 'archived',
         updated_at = now()
   WHERE id = p_contact_id;

  RETURN jsonb_build_object('ok', true, 'contact_id', p_contact_id, 'user_id', p_user_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 4 — get_admin_contact_directory RPC (staff-only)
-- ─────────────────────────────────────────────────────────────
-- Cross-tenant combined directory for the Administration page:
-- active tenant_users unioned with tenant_contacts, tagged by
-- source, with tenant name for filtering.

CREATE OR REPLACE FUNCTION public.get_admin_contact_directory()
RETURNS TABLE(
  row_key       text,
  source        text,
  tenant_id     bigint,
  tenant_name   text,
  first_name    text,
  last_name     text,
  email         text,
  position_type text,
  status        text,
  created_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.is_super_admin_safe(auth.uid())
    OR public.is_vivacity_staff(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied: staff only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    'user:' || tu.id::text AS row_key,
    'user' AS source,
    tu.tenant_id,
    t.name AS tenant_name,
    u.first_name,
    u.last_name,
    u.email,
    tu.position_type,
    CASE WHEN COALESCE(u.disabled, false) THEN 'disabled'
         WHEN COALESCE(u.archived, false) THEN 'archived'
         ELSE 'active' END AS status,
    tu.created_at
  FROM public.tenant_users tu
  JOIN public.users u ON u.user_uuid = tu.user_id
  JOIN public.tenants t ON t.id = tu.tenant_id
  WHERE NOT COALESCE(u.is_vivacity_internal, false)

  UNION ALL

  SELECT
    'contact:' || tc.id::text AS row_key,
    'contact' AS source,
    tc.tenant_id,
    t.name AS tenant_name,
    tc.first_name,
    tc.last_name,
    tc.email,
    tc.position_type,
    tc.status,
    tc.created_at
  FROM public.tenant_contacts tc
  JOIN public.tenants t ON t.id = tc.tenant_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK SQL — run in order if migration must be reversed
-- ─────────────────────────────────────────────────────────────
/*
DROP FUNCTION IF EXISTS public.get_admin_contact_directory();
DROP FUNCTION IF EXISTS public.mark_tenant_contact_promoted(bigint, uuid);
DROP TABLE IF EXISTS public.tenant_contact_group_members;
DROP TABLE IF EXISTS public.tenant_contact_groups;
DROP TABLE IF EXISTS public.tenant_contacts;
*/
