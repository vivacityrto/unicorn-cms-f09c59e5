-- `_apply_relationship_role_row` is an implementation helper called only by
-- `set_relationship_role`, which performs its own caller authorization.
-- A historical direct grant left this SECURITY DEFINER function reachable
-- through PostgREST by unauthenticated and authenticated callers.
REVOKE EXECUTE ON FUNCTION public._apply_relationship_role_row(
  bigint, uuid, text, text, uuid, boolean, text
) FROM anon, authenticated;
