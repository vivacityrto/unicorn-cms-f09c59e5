-- Support tickets: cut-over. Run ONLY after the frontend that reads the new
-- model is deployed, and after re-running the backfill (20261113110000) as a
-- delta, in the off-peak window (22:00 to 04:00 AEST).
--
--   * suggest_items / suggest_attachments become read-only archives for 30
--     days (they are dropped later under a separate, explicit approval). This
--     also closes the old "any tenant user can UPDATE any ticket in their
--     tenant" gap in the interim.
--   * The browser can no longer create Help Centre "support" threads
--     (the client panel now calls create_support_ticket). The chat-bot tab
--     writes through the help-center-chat edge function with the service role
--     and is unaffected; SELECT and UPDATE policies on help_threads stay.
--   * trg_notify_csc_on_support_ticket is dropped: ticket triggers replace it.
--     The 252 existing support_ticket notifications are left as they are.
--
-- migration-target-project: qfpxvumcrnzrjyvqkicq
-- Rollback: supabase/migrations/rollback/20261113120000_support_tickets_cutover.down.sql

REVOKE INSERT, UPDATE, DELETE ON public.suggest_items       FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.suggest_attachments FROM authenticated, anon;

DROP POLICY IF EXISTS help_threads_insert  ON public.help_threads;
DROP POLICY IF EXISTS help_messages_insert ON public.help_messages;

DROP TRIGGER IF EXISTS trg_notify_csc_on_support_ticket ON public.help_threads;
