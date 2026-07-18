-- Harden pg_cron: stop exposing cron.job to API-facing roles.
-- Scheduled jobs still run as the job owner (typically postgres), not as
-- the revoked roles, so pg_cron execution is unaffected.
BEGIN;

revoke select on cron.job from public;
revoke select on cron.job from authenticated;
revoke select on cron.job from anon;

NOTIFY pgrst, 'reload schema';

-- Confirm the revoke took effect before committing.
-- Note: has_table_privilege() cannot be called with the pseudo-role 'public'
-- (it raises 'role "public" does not exist'). The authenticated/anon checks
-- already cover the PUBLIC grant, because has_table_privilege() returns true
-- if the role holds the privilege directly OR via PUBLIC. So if PUBLIC still
-- granted SELECT, these checks would fail. The PUBLIC grant itself is verified
-- separately by inspecting cron.job's ACL.
DO $
BEGIN
  IF has_table_privilege('authenticated', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(authenticated, cron.job, SELECT) = false';
  END IF;
  IF has_table_privilege('anon', 'cron.job', 'SELECT') THEN
    RAISE EXCEPTION 'expected has_table_privilege(anon, cron.job, SELECT) = false';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
    WHERE n.nspname = 'cron'
      AND c.relname = 'job'
      AND acl.grantee = 0 -- 0 is the OID used to represent PUBLIC in ACLs
      AND acl.privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'expected PUBLIC to not hold SELECT on cron.job';
  END IF;
END $;

COMMIT;
