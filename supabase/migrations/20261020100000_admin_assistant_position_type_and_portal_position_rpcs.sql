-- ============================================================
-- Admin Assistant position type + client portal Users-table position RPCs
-- ============================================================
-- 1. Adds "Admin Assistant" to the dd_position_type lookup (sort_order 7,
--    after Trainer/Assessor so no existing option moves). Every position
--    type dropdown loads this table live, so no frontend deploy is needed
--    for the option itself. Idempotent (ON CONFLICT DO NOTHING).
--
-- 2. Adds two SECURITY DEFINER RPCs so the client portal Users table can
--    show and edit each user's position type:
--      get_client_tenant_user_position_types(p_tenant_id)
--      set_tenant_user_position_type(p_tenant_id, p_user_id, p_position_type)
--
--    Why RPCs rather than direct table access: the portal gate for managing
--    users (ClientTenantContext.canManagePortalUsers) is a full-scope primary
--    or secondary contact (relationship_role), but RLS on tenant_users only
--    admits role = 'parent' (is_tenant_parent_safe) for UPDATE and only the
--    caller's own row for SELECT. A direct update by a secondary contact
--    would silently change zero rows. set_relationship_role solves the same
--    problem the same way; the gate below mirrors it exactly.
--
--    get_client_tenant_users (the Users table's row source) is deliberately
--    NOT changed: widening its RETURNS TABLE needs DROP + CREATE of a
--    heavily used function.
--
-- Existing-data impact: one INSERT into a 8-row lookup table; two new
-- functions. No existing row, policy, trigger or function is modified.
-- The tenant_users audit trigger (trg_audit_tenant_users) records each
-- position change made through the setter.

-- ─── 1. Admin Assistant ──────────────────────────────────────
INSERT INTO public.dd_position_type (value, label, sort_order)
VALUES ('admin_assistant', 'Admin Assistant', 7)
ON CONFLICT (value) DO NOTHING;

-- ─── 2a. Read: position types for the people in a tenant ─────
-- Same visibility as get_client_tenant_users: staff, or any member of the
-- tenant.
CREATE OR REPLACE FUNCTION public.get_client_tenant_user_position_types(
  p_tenant_id integer
)
RETURNS TABLE (user_id uuid, position_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT tu.user_id, tu.position_type
  FROM public.tenant_users tu
  WHERE tu.tenant_id = p_tenant_id
    AND (
      public.is_super_admin_safe((SELECT auth.uid()))
      OR public.is_vivacity_team_safe((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.tenant_users me
        WHERE me.tenant_id = p_tenant_id
          AND me.user_id = (SELECT auth.uid())
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.get_client_tenant_user_position_types(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_tenant_user_position_types(integer) TO authenticated, service_role;

-- ─── 2b. Write: set (or clear) one user's position type ──────
-- Gate mirrors set_relationship_role: Vivacity staff, or a full-scope primary
-- or secondary contact of the tenant. NULL clears the position type.
CREATE OR REPLACE FUNCTION public.set_tenant_user_position_type(
  p_tenant_id     bigint,
  p_user_id       uuid,
  p_position_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller          uuid := auth.uid();
  v_is_staff        boolean := false;
  v_is_tenant_admin boolean := false;
  v_old             text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'set_tenant_user_position_type: missing required parameters';
  END IF;

  v_is_staff := public.is_super_admin_safe(v_caller)
             OR public.is_vivacity_team_safe(v_caller);

  IF NOT v_is_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = p_tenant_id
        AND user_id = v_caller
        AND relationship_role IN ('primary_contact', 'secondary_contact')
        AND access_scope = 'full'
    ) INTO v_is_tenant_admin;

    IF NOT v_is_tenant_admin THEN
      RAISE EXCEPTION 'Not authorized to change position types for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_position_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dd_position_type
    WHERE value = p_position_type AND is_active = true
  ) THEN
    RAISE EXCEPTION 'set_tenant_user_position_type: invalid position_type value: %',
      p_position_type;
  END IF;

  SELECT position_type INTO v_old
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_users row not found for tenant=% user=%',
      p_tenant_id, p_user_id;
  END IF;

  IF v_old IS NOT DISTINCT FROM p_position_type THEN
    RETURN jsonb_build_object(
      'ok', true,
      'changed', false,
      'tenant_id', p_tenant_id,
      'user_id', p_user_id,
      'position_type', p_position_type
    );
  END IF;

  UPDATE public.tenant_users
     SET position_type = p_position_type
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'position_type', p_position_type,
    'previous_position_type', v_old
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_tenant_user_position_type(bigint, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_user_position_type(bigint, uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK SQL — run in order if migration must be reversed
-- (clear any users set to Admin Assistant first, or the DELETE is blocked
--  by fk_tenant_users_position_type / the tenant_contacts equivalent)
-- ─────────────────────────────────────────────────────────────
/*
DROP FUNCTION IF EXISTS public.set_tenant_user_position_type(bigint, uuid, text);
DROP FUNCTION IF EXISTS public.get_client_tenant_user_position_types(integer);
DELETE FROM public.dd_position_type WHERE value = 'admin_assistant';
*/
