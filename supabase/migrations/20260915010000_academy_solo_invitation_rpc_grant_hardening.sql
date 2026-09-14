-- Invitation acceptance is only called after the invited identity is
-- authenticated (or by a trusted service-role Edge Function). Keep the
-- identity-binding RPC out of the anonymous API surface.
REVOKE ALL ON FUNCTION public.accept_invitation_v2(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation_v2(text, uuid) TO authenticated, service_role;
