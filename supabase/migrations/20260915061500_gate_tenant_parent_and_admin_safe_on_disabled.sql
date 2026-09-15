-- Security fix: is_tenant_parent_safe / has_tenant_admin_safe -- the two
-- functions that gate client-tenant-side authorization (contact swap/
-- promotion RPCs, and user_invitations' own RLS INSERT/UPDATE/DELETE
-- policies) -- never checked whether the calling user's own account was
-- disabled or archived. Found while performing the RBAC/security review
-- TOM's P1.2-c ghost-activation retirement packet requires before the
-- replacement contact/invitation path can be treated as safe (same
-- investigation that led to 20260915053000's fix for
-- is_super_admin_safe/has_permission/check_permission).
--
-- Two distinct gaps:
--   1. is_tenant_parent_safe(tenant_id, uuid): checked only
--      tenant_users.role = 'parent' for the calling user, with no join to
--      public.users at all -- so a disabled/archived tenant-parent
--      account's still-valid session retained full authority to call
--      swap_tenant_user_to_contact / mark_tenant_contact_promoted for
--      their tenant. Confirmed live: 359 tenant_users 'parent' rows
--      currently belong to a disabled-or-archived public.users row.
--   2. has_tenant_admin_safe(tenant_id, uuid): checked only
--      tenant_members.role = 'Admin' AND status = 'active', which is a
--      separate flag from public.users.disabled -- the standard
--      toggle-user-status flow (rpc_set_client_account_status) only ever
--      sets public.users.disabled and never touches tenant_members.status,
--      so disabling a tenant admin never revoked this. This function
--      directly gates user_invitations' INSERT/UPDATE/DELETE RLS policies
--      (a browser-writable table), so a disabled tenant Admin's still-valid
--      session could directly create/edit/delete invitations for their
--      tenant via PostgREST, bypassing the invite-user Edge Function
--      entirely. Confirmed live: 338 tenant_members 'Admin'/'active' rows
--      currently belong to a disabled-or-archived public.users row.
--
-- Fix is purely restrictive (adds a join to public.users requiring
-- disabled=false AND archived=false on the calling user) -- verified zero
-- regression for active accounts before and after.
--
-- Same signatures as the live functions -- CREATE OR REPLACE is safe, no
-- DROP FUNCTION needed.

CREATE OR REPLACE FUNCTION public.is_tenant_parent_safe(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.tenant_users tu
    join public.users u on u.user_uuid = tu.user_id
    where tu.tenant_id = p_tenant_id
      and tu.user_id = p_user_id
      and tu.role = 'parent'
      and COALESCE(u.disabled, false) = false
      and COALESCE(u.archived, false) = false
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_tenant_admin_safe(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT
    public.is_super_admin_safe(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      JOIN public.users u ON u.user_uuid = tm.user_id
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id = p_user_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
        AND COALESCE(u.disabled, false) = false
        AND COALESCE(u.archived, false) = false
    );
$function$;
