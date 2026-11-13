-- Rollback for 20261113120000_support_tickets_cutover.sql: restores the old
-- write paths exactly as they were. Safe to run more than once.
-- Tickets raised on the new model after cut-over are NOT copied back by this
-- file; copy them to suggest_items first (documented in the audit entry).

GRANT INSERT, UPDATE ON public.suggest_items       TO authenticated, anon;
GRANT INSERT, UPDATE ON public.suggest_attachments TO authenticated, anon;

DROP POLICY IF EXISTS help_threads_insert ON public.help_threads;
CREATE POLICY help_threads_insert ON public.help_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = user_id)
    AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS help_messages_insert ON public.help_messages;
CREATE POLICY help_messages_insert ON public.help_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = sender_id)
    AND EXISTS (
      SELECT 1 FROM public.help_threads t
      WHERE t.id = help_messages.thread_id
        AND (t.user_id = (SELECT auth.uid()) OR is_vivacity_team_safe((SELECT auth.uid())))
    )
  );

DROP TRIGGER IF EXISTS trg_notify_csc_on_support_ticket ON public.help_threads;
CREATE TRIGGER trg_notify_csc_on_support_ticket
  AFTER INSERT ON public.help_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_csc_on_support_ticket();
