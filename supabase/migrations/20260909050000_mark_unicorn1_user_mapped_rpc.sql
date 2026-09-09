-- L10 #33: "Import from Unicorn 1" never actually marked the legacy record
-- as mapped. InviteUserDialog.tsx's final import step called
-- `supabase.schema('unicorn1').from('users').update({ mapped_user_uuid })`
-- directly from the browser client, which always fails at the PostgREST
-- layer ("The schema must be one of the following: public, graphql_public")
-- -- this project's PostgREST config never exposed the unicorn1 schema, so
-- that call could never succeed regardless of typing or RLS grants. The
-- read-side equivalent (search_unicorn1_users) already works around the
-- identical constraint via a SECURITY DEFINER function in the public
-- schema that queries unicorn1 internally in plain SQL, bypassing
-- PostgREST's schema restriction entirely. This migration adds the
-- missing write-side counterpart using the same pattern.
CREATE OR REPLACE FUNCTION public.mark_unicorn1_user_mapped(
  p_legacy_id bigint,
  p_mapped_user_uuid uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE unicorn1.users
  SET mapped_user_uuid = p_mapped_user_uuid
  WHERE "ID" = p_legacy_id;
$$;

-- Same security posture as search_unicorn1_users (see
-- 20260818090000_security_definer_full_sweep_fixes.sql line 87): reachable
-- only via the mark-unicorn1-user-mapped Edge Function's service-role
-- client, which gates on FeatureKeys.adminUnicorn1 via requireCaller. No
-- legitimate direct-authenticated-caller path exists.
REVOKE EXECUTE ON FUNCTION public.mark_unicorn1_user_mapped(bigint, uuid) FROM authenticated, anon;
