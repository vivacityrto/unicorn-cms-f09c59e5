-- Harden pg_cron: remove the default SELECT grant on cron.job that Supabase
-- installs for API-facing roles on project creation, and assert no other
-- non-superuser role holds an explicit SELECT grant on it.
--
-- Scheduled jobs still run as the job owner (typically postgres), not as the
-- revoked roles, so pg_cron execution is unaffected.

BEGIN;

REVOKE SELECT ON cron.job FROM authenticated;
REVOKE SELECT ON cron.job FROM anon;
-- PUBLIC is the usual source of the default grant; revoke it so inherited
-- SELECT cannot reappear via PUBLIC for any role.
REVOKE SELECT ON cron.job FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- Confirm the revoke took effect before committing.
-- Note: has_table_privilege() cannot be called with the pseudo-role 'public'
-- (it raises 'role "public" does not exist'). The authenticated/anon checks
-- already cover PUBLIC inheritance, because has_table_privilege() returns true
-- if the role holds the privilege directly OR via PUBLIC. The ACL scan below
-- additionally confirms no other non-superuser grantee (besides the table
-- owner) holds SELECT.
DO $$
DECLARE
  leftover_grantees text[];
BEGIN
  -- expect false
  IF has_table_privilege('authenticated', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(authenticated, cron.job, SELECT) = false';
  END IF;

  -- expect false
  IF has_table_privilege('anon', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(anon, cron.job, SELECT) = false';
  END IF;

  SELECT coalesce(array_agg(grantee_name ORDER BY grantee_name), ARRAY[]::text[])
  INTO leftover_grantees
  FROM (
    SELECT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee_role.rolname
      END AS grantee_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE n.nspname = 'cron'
      AND c.relname = 'job'
      AND acl.privilege_type = 'SELECT'
      AND acl.grantee <> c.relowner
      AND (
        acl.grantee = 0 -- PUBLIC
        OR (grantee_role.oid IS NOT NULL AND NOT grantee_role.rolsuper)
      )
  ) grants;

  IF cardinality(leftover_grantees) > 0 THEN
    RAISE EXCEPTION
      'expected no non-superuser SELECT grant on cron.job; found: %',
      array_to_string(leftover_grantees, ', ');
  END IF;
END $$;

COMMIT;
