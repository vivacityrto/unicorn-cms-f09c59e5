-- Reconcile H1: drop stale world-readable policy on public.emails
DROP POLICY IF EXISTS "emails_authenticated_select" ON public.emails;
NOTIFY pgrst, 'reload schema';