-- Support tickets: a reporter keeps access to their own ticket when staff
-- reclassify it. The product is a category, so the reporter rules no longer
-- require product = 'unicorn'. Tenant access and reporter identity still apply,
-- and staff keep full access through is_vivacity_team_safe().
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Rollback: restore the product = 'unicorn' predicate in the three definitions
-- (see supabase/migrations/20261113100000_support_tickets_model.sql).

CREATE OR REPLACE FUNCTION public.can_view_support_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = p_ticket_id
        AND t.deleted_at IS NULL
        AND t.reporter_id = auth.uid()
        AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_read_support_file(p_bucket text, p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    public.is_vivacity_team_safe(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.support_ticket_attachments a
      JOIN public.support_tickets t ON t.id = a.ticket_id
      LEFT JOIN public.support_ticket_messages m ON m.id = a.message_id
      WHERE a.bucket = p_bucket
        AND a.storage_path = p_path
        AND t.deleted_at IS NULL
        AND t.reporter_id = auth.uid()
        AND public.has_tenant_access_safe(t.tenant_id, auth.uid())
        AND (m.id IS NULL OR NOT m.staff_only)
    );
$function$;

DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR (
      deleted_at IS NULL
      AND reporter_id = (SELECT auth.uid())
      AND public.has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
    )
  );
