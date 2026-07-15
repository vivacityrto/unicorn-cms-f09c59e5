-- Task #22 (14 Jul 2026 Unicorn security audit follow-up): users_update_staff
-- (PERMISSIVE) grants any is_vivacity_team_safe(auth.uid()) staff member permission to
-- UPDATE ANY user's row, and the only RESTRICTIVE backstop
-- (users_no_privilege_escalation) only protects the 5 escalation fields
-- (unicorn_role/is_vivacity_internal/global_role/superadmin_level/tenant_id), not
-- personal_email/personal_phone/street_address/po_box_address. Any regular staff member
-- could bypass the update-user-profile edge function's own isSelf/isSuperAdmin gate via
-- a direct authenticated PostgREST UPDATE and rewrite another user's contact fields.
--
-- Investigation (Cursor, 15 Jul 2026) confirmed the edge function's isClientAdmin path is
-- dead/unreachable in the current UI and already silently blocked by RLS today, so this
-- fix does not need to preserve it. The edge function's own app-level logic already
-- requires isSelf OR check_permission(auth.uid(),'admin.team_users.manage','full') before
-- allowing an edit to someone else's row -- this migration makes the database enforce the
-- same rule the edge function already intends, closing the direct-API bypass without
-- changing any legitimate existing behavior.
-- Applied directly to production 15 Jul 2026 and persona-verified (4 cases); this
-- migration is a no-op against current live behavior.
CREATE OR REPLACE FUNCTION public.user_contact_fields_change_authorized_safe(
  p_user_uuid uuid,
  p_personal_email text,
  p_personal_phone text,
  p_street_address text,
  p_po_box_address text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security TO 'off'
AS $function$
  SELECT
    (
      p_personal_email IS NOT DISTINCT FROM u.personal_email
      AND p_personal_phone IS NOT DISTINCT FROM u.personal_phone
      AND p_street_address IS NOT DISTINCT FROM u.street_address
      AND p_po_box_address IS NOT DISTINCT FROM u.po_box_address
    )
    OR (
      p_user_uuid = (SELECT auth.uid())
      OR public.check_permission((SELECT auth.uid()), 'admin.team_users.manage', 'full')
    )
  FROM public.users u
  WHERE u.user_uuid = p_user_uuid;
$function$;

REVOKE ALL ON FUNCTION public.user_contact_fields_change_authorized_safe(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_contact_fields_change_authorized_safe(uuid, text, text, text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS users_contact_fields_protected ON public.users;
CREATE POLICY users_contact_fields_protected
ON public.users
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  public.user_contact_fields_change_authorized_safe(
    user_uuid, personal_email, personal_phone, street_address, po_box_address
  )
);

NOTIFY pgrst, 'reload schema';
