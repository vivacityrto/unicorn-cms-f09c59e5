-- Reconcile H1: drop stale world-readable policy on public.emails
DROP POLICY IF EXISTS "emails_authenticated_select" ON public.emails;
NOTIFY pgrst, 'reload schema';
-- sync-nudge 2026-07-22: file present in working tree; awaiting Lovable→GitHub flush
