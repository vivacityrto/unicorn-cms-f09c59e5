-- This project grants execute to anon by default when a function is created.
-- The invitation completer is intentionally browser-callable only after sign
-- in, so make that boundary explicit rather than relying on its auth.uid()
-- runtime guard alone.

REVOKE EXECUTE ON FUNCTION public.complete_claimed_invitation(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_claimed_invitation(text, uuid) TO authenticated;
