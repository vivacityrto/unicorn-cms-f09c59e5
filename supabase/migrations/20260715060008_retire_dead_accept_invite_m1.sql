-- M1 (14 Jul 2026 Unicorn security audit follow-up): accept_invite(p_token text) is
-- confirmed dead/orphaned code. It references columns that do not exist on the current
-- schema (user_invitations.token, users.id, user_invitations.role -- only token_hash,
-- user_uuid, and unicorn_role exist), so every invocation errors out; it has been
-- non-functional since some earlier schema migration superseded it. Cursor's repo-wide
-- search (15 Jul 2026) confirmed zero frontend or edge-function callers -- the real,
-- live, schema-correct invite acceptance path is accept_invitation_v2 (called from
-- AcceptInvitation.tsx via finalizeInvitation()), which correctly writes tenant_users/
-- tenant_members using token_hash/user_uuid.
--
-- Retiring accept_invite as hygiene (Angela's call, 15 Jul 2026): confirmed authenticated
-- held EXECUTE on it, meaning it was technically callable via PostgREST RPC by any
-- authenticated user even though nothing in the app actually called it and it would only
-- ever error. Dropping removes dead attack surface and audit noise. The companion
-- accept-tenant-invite edge function (live in production, id
-- 0e33b229-c085-497e-b2bd-f1e0945511e6, never in git -- a third orphan-deployment
-- instance alongside admin-reset-user and invite-or-reset-user) must be separately
-- undeployed via the Supabase dashboard; this MCP toolset has no delete_edge_function
-- capability.
drop function if exists public.accept_invite(text);

NOTIFY pgrst, 'reload schema';