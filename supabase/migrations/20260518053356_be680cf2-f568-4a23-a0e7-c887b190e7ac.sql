-- =====================================================================
-- Phase 4D-1: Realign dd_unicorn_roles data with users.unicorn_role labels
-- Data-only migration. No schema/policy/function/enum changes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PRE-FLIGHT ASSERTIONS
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_row_count    integer;
  v_stray_count  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dd_unicorn_roles'
  ) THEN
    RAISE EXCEPTION 'Pre-flight failed: public.dd_unicorn_roles does not exist';
  END IF;

  SELECT count(*) INTO v_row_count FROM public.dd_unicorn_roles;
  IF v_row_count <> 5 THEN
    RAISE EXCEPTION 'Pre-flight failed: dd_unicorn_roles has % rows, expected 5', v_row_count;
  END IF;

  SELECT count(*) INTO v_stray_count
  FROM public.users
  WHERE unicorn_role IS NOT NULL
    AND unicorn_role::text NOT IN (
      'Super Admin','Admin','User','Team Leader','Team Member','Academy User'
    );
  IF v_stray_count > 0 THEN
    RAISE EXCEPTION 'Pre-flight failed: % users have unicorn_role values outside the allowed set', v_stray_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. DATA UPDATES
-- ---------------------------------------------------------------------
UPDATE public.dd_unicorn_roles
   SET value = 'Super Admin', label = 'Super Admin', sort_order = 1
 WHERE value = 'super_admin';

UPDATE public.dd_unicorn_roles
   SET value = 'Admin', label = 'Admin', sort_order = 2
 WHERE value = 'admin';

UPDATE public.dd_unicorn_roles
   SET value = 'User', label = 'User', sort_order = 3
 WHERE value = 'user';

UPDATE public.dd_unicorn_roles
   SET value = 'Team Leader', label = 'Team Leader', sort_order = 4
 WHERE value = 'team_leader';

UPDATE public.dd_unicorn_roles
   SET value = 'Team Member', label = 'Team Member', sort_order = 5
 WHERE value = 'team_member';

-- ---------------------------------------------------------------------
-- 3. INSERT missing Academy User row
-- ---------------------------------------------------------------------
INSERT INTO public.dd_unicorn_roles (value, label, description, sort_order, is_active)
VALUES ('Academy User', 'Academy User', 'Academy-specific client user role', 6, true)
ON CONFLICT (value) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. POST-FLIGHT ASSERTIONS
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_row_count       integer;
  v_expected_count  integer;
  v_orphan_count    integer;
  v_dup_count       integer;
BEGIN
  SELECT count(*) INTO v_row_count FROM public.dd_unicorn_roles;
  IF v_row_count <> 6 THEN
    RAISE EXCEPTION 'Post-flight failed: dd_unicorn_roles has % rows, expected 6', v_row_count;
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM public.dd_unicorn_roles
  WHERE value IN ('Super Admin','Admin','User','Team Leader','Team Member','Academy User');
  IF v_expected_count <> 6 THEN
    RAISE EXCEPTION 'Post-flight failed: only % of 6 expected values found in dd_unicorn_roles', v_expected_count;
  END IF;

  SELECT count(*) INTO v_orphan_count
  FROM public.users u
  WHERE u.unicorn_role IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.dd_unicorn_roles d WHERE d.value = u.unicorn_role::text
    );
  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Post-flight failed: % users have unicorn_role values not present in dd_unicorn_roles', v_orphan_count;
  END IF;

  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT value FROM public.dd_unicorn_roles GROUP BY value HAVING count(*) > 1
  ) dups;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Post-flight failed: % duplicate value(s) detected in dd_unicorn_roles', v_dup_count;
  END IF;
END $$;

-- =====================================================================
-- ROLLBACK (manual; safe only before Phase 4D-2 deploys the FK)
-- =====================================================================
-- /*
-- BEGIN;
--
-- DELETE FROM public.dd_unicorn_roles WHERE value = 'Academy User';
--
-- UPDATE public.dd_unicorn_roles
--    SET value = 'super_admin', label = 'Super Admin', sort_order = 1
--  WHERE value = 'Super Admin';
--
-- UPDATE public.dd_unicorn_roles
--    SET value = 'team_leader', label = 'Team Leader', sort_order = 2
--  WHERE value = 'Team Leader';
--
-- UPDATE public.dd_unicorn_roles
--    SET value = 'team_member', label = 'Team Member', sort_order = 3
--  WHERE value = 'Team Member';
--
-- UPDATE public.dd_unicorn_roles
--    SET value = 'admin', label = 'Admin', sort_order = 4
--  WHERE value = 'Admin';
--
-- UPDATE public.dd_unicorn_roles
--    SET value = 'user', label = 'User', sort_order = 5
--  WHERE value = 'User';
--
-- COMMIT;
-- */
