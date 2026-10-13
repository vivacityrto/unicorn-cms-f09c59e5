-- =====================================================================
-- Contact Directory: return the client's status
--
-- get_admin_contact_directory() reported only the PERSON's own status
-- (user disabled/archived flag, or the contact's status), so a contact at a
-- cancelled client still read as "active". Adds one column, tenant_status
-- (tenants.status), at the end so the directory can default to people at
-- active clients and filter by client status.
--
-- Read-only. No data is changed. The body is otherwise identical to the
-- previous version (same staff-only gate, same two sources, same filters).
--
-- A function whose RETURNS TABLE changes cannot be CREATE OR REPLACEd, so it
-- is dropped first. Checked before writing: no other function body and no
-- view references it; the only callers are the Contact Directory page and
-- the walk-in lookup in the Events registry, both through supabase.rpc.
--
-- ROLLBACK: re-create the previous version without the tenant_status column
-- (see 20260825060000_tenant_contacts_and_groups.sql).
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_admin_contact_directory();

CREATE FUNCTION public.get_admin_contact_directory()
 RETURNS TABLE(
   row_key text,
   source text,
   tenant_id bigint,
   tenant_name text,
   first_name text,
   last_name text,
   email text,
   position_type text,
   status text,
   created_at timestamp with time zone,
   tenant_status text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    tu.created_at,
    t.status::text AS tenant_status
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
    tc.created_at,
    t.status::text AS tenant_status
  FROM public.tenant_contacts tc
  JOIN public.tenants t ON t.id = tc.tenant_id;
END;
$function$;

-- Same callers as before: signed-in staff (the function itself rejects
-- anyone who is not staff) and the service role.
GRANT EXECUTE ON FUNCTION public.get_admin_contact_directory() TO authenticated, service_role;
