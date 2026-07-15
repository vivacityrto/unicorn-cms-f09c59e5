-- Reconciliation: formalize live get_user_private_contact owner/HR gate
-- (14 Jul 2026 Unicorn security audit follow-up — keeper-repo drift).
-- Live definition verified via pg_get_functiondef; this migration is a no-op
-- against current production behavior (CREATE OR REPLACE of identical body).
-- Out of scope: broader users-table RLS gap (audit finding C2).

CREATE OR REPLACE FUNCTION public.get_user_private_contact(p_user_id uuid)
 RETURNS TABLE(personal_email text, personal_phone text, street_address text, po_box_address text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  SELECT u.personal_email, u.personal_phone, u.street_address, u.po_box_address
  FROM public.users u
  WHERE u.user_uuid = p_user_id
    AND ( p_user_id = (SELECT auth.uid())
          OR public.check_permission((SELECT auth.uid()), 'admin.team_users.manage', 'full') );
$function$;
