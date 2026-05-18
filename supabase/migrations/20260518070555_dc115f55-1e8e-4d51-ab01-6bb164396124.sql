
-- =========================================================================
-- Phase 4D-2 + 4D-3: users.unicorn_role enum -> text (atomic, retry 2)
-- =========================================================================

DO $preflight$
DECLARE v_orphans int; v_canonical int;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.users u
  LEFT JOIN public.dd_unicorn_roles d ON d.value = u.unicorn_role::text
  WHERE d.value IS NULL;
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: % orphan unicorn_role values', v_orphans;
  END IF;

  SELECT count(*) INTO v_canonical FROM public.dd_unicorn_roles
  WHERE value IN ('Super Admin','Admin','User','Team Leader','Team Member','Academy User')
    AND is_active = true;
  IF v_canonical <> 6 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: canonical rows = % (expected 6)', v_canonical;
  END IF;
END $preflight$;

-- Capture all unicorn_role-referencing policies EXCEPT users_update_own (handled manually)
CREATE TEMP TABLE _captured_policies ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies
WHERE (qual ILIKE '%unicorn_role%' OR with_check ILIKE '%unicorn_role%')
  AND NOT (schemaname='public' AND tablename='users' AND policyname='users_update_own');

DO $cnt$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _captured_policies;
  IF n <> 86 THEN
    RAISE EXCEPTION 'CAPTURE FAILED: expected 86 policies, got %', n;
  END IF;
END $cnt$;

DROP VIEW IF EXISTS public.v_dashboard_labour_efficiency;
DROP TRIGGER IF EXISTS trg_set_user_type_from_role ON public.users;
DROP TRIGGER IF EXISTS trg_sync_is_vivacity_internal ON public.users;
DROP TRIGGER IF EXISTS trg_audit_users_update ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;

DO $drop_policies$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM _captured_policies LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $drop_policies$;

DROP FUNCTION IF EXISTS public.user_protected_fields_unchanged_safe(uuid, public.unicorn_role, boolean, text, text, bigint);

CREATE OR REPLACE FUNCTION public.user_protected_fields_unchanged_safe(
  p_user_id uuid,
  p_new_unicorn_role text,
  p_new_is_vivacity_internal boolean,
  p_new_global_role text,
  p_new_superadmin_level text,
  p_new_tenant_id bigint
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = p_user_id
      AND u.unicorn_role::text  IS NOT DISTINCT FROM p_new_unicorn_role
      AND u.is_vivacity_internal IS NOT DISTINCT FROM p_new_is_vivacity_internal
      AND u.global_role          IS NOT DISTINCT FROM p_new_global_role
      AND u.superadmin_level     IS NOT DISTINCT FROM p_new_superadmin_level
      AND u.tenant_id            IS NOT DISTINCT FROM p_new_tenant_id
  );
$func$;

ALTER TABLE public.users ALTER COLUMN unicorn_role DROP DEFAULT;
ALTER TABLE public.users ALTER COLUMN unicorn_role TYPE text USING unicorn_role::text;
ALTER TABLE public.users ALTER COLUMN unicorn_role SET DEFAULT 'User';
ALTER TABLE public.users ALTER COLUMN unicorn_role SET NOT NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_unicorn_role_fk
  FOREIGN KEY (unicorn_role) REFERENCES public.dd_unicorn_roles(value)
  ON UPDATE CASCADE ON DELETE RESTRICT;

DO $recreate_policies$
DECLARE r record; v_qual text; v_check text; v_roles text; v_sql text;
BEGIN
  FOR r IN SELECT * FROM _captured_policies LOOP
    v_qual  := regexp_replace(COALESCE(r.qual, ''),       '::unicorn_role', '', 'g');
    v_check := regexp_replace(COALESCE(r.with_check, ''), '::unicorn_role', '', 'g');
    v_roles := array_to_string(r.roles, ', ');
    v_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd, v_roles
    );
    IF length(v_qual)  > 0 THEN v_sql := v_sql || ' USING (' || v_qual  || ')'; END IF;
    IF length(v_check) > 0 THEN v_sql := v_sql || ' WITH CHECK (' || v_check || ')'; END IF;
    EXECUTE v_sql;
  END LOOP;
END $recreate_policies$;

CREATE POLICY users_update_own ON public.users
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_uuid = (SELECT auth.uid()))
  WITH CHECK (
    user_uuid = (SELECT auth.uid())
    AND public.user_protected_fields_unchanged_safe(
      (SELECT auth.uid()),
      unicorn_role,
      is_vivacity_internal,
      global_role,
      superadmin_level,
      tenant_id
    )
  );

CREATE TRIGGER trg_set_user_type_from_role
  BEFORE INSERT OR UPDATE OF unicorn_role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_user_type_from_role();

CREATE TRIGGER trg_sync_is_vivacity_internal
  BEFORE INSERT OR UPDATE OF unicorn_role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_vivacity_internal();

CREATE TRIGGER trg_audit_users_update
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (
    (old.first_name IS DISTINCT FROM new.first_name)
    OR (old.last_name IS DISTINCT FROM new.last_name)
    OR (old.email IS DISTINCT FROM new.email)
    OR (old.global_role IS DISTINCT FROM new.global_role)
    OR (old.unicorn_role IS DISTINCT FROM new.unicorn_role)
    OR (old.superadmin_level IS DISTINCT FROM new.superadmin_level)
    OR (old.archived IS DISTINCT FROM new.archived)
    OR (old.disabled IS DISTINCT FROM new.disabled)
    OR (old.tenant_id IS DISTINCT FROM new.tenant_id)
    OR (old.is_csc IS DISTINCT FROM new.is_csc)
    OR (old.is_vivacity_internal IS DISTINCT FROM new.is_vivacity_internal)
  )
  EXECUTE FUNCTION public.fn_audit_users();

CREATE VIEW public.v_dashboard_labour_efficiency
WITH (security_invoker = true) AS
SELECT u.user_uuid AS csc_user_id,
    (u.first_name || ' '::text) || u.last_name AS csc_name,
    count(DISTINCT tp.tenant_id) AS client_count,
    COALESCE(ccp.effective_weekly_capacity_hours, 0::numeric) AS weekly_capacity_hours,
    COALESCE(sum(tp.overdue_tasks_count), 0::bigint) AS total_overdue_tasks,
    COALESCE(sum(tp.open_tasks_count), 0::bigint) AS total_open_tasks,
    CASE
      WHEN COALESCE(sum(tp.open_tasks_count), 0::bigint) = 0 THEN 0::numeric
      ELSE round(sum(tp.overdue_tasks_count)::numeric / NULLIF(sum(tp.open_tasks_count), 0)::numeric * 100::numeric, 1)
    END AS overdue_ratio_pct,
    count(DISTINCT tp.tenant_id) FILTER (
      WHERE (tp.worst_stage_health_status = ANY (ARRAY['critical'::text, 'at_risk'::text]))
         OR (tp.risk_status = ANY (ARRAY['high'::text, 'elevated'::text]))
    ) AS intensive_clients,
    count(DISTINCT tp.tenant_id) FILTER (
      WHERE (tp.worst_stage_health_status <> ALL (ARRAY['critical'::text, 'at_risk'::text]))
        AND (tp.risk_status <> ALL (ARRAY['high'::text, 'elevated'::text]))
    ) AS low_touch_clients
FROM public.users u
  LEFT JOIN public.v_dashboard_tenant_portfolio tp ON tp.assigned_csc_user_id = u.user_uuid
  LEFT JOIN public.consultant_capacity_profiles ccp ON ccp.user_id = u.user_uuid
WHERE u.unicorn_role = ANY (ARRAY['Super Admin','Team Leader','Team Member'])
GROUP BY u.user_uuid, u.first_name, u.last_name, ccp.effective_weekly_capacity_hours;

COMMENT ON TYPE public.unicorn_role IS
  'RETENTION NOTICE (4D-2+4D-3, 18 May 2026): Superseded by dd_unicorn_roles. '
  'users.unicorn_role is now text with FK to dd_unicorn_roles(value). '
  '86 RLS policies rewritten to remove ::unicorn_role casts. '
  'DO NOT DROP OR ARCHIVE until: (a) Carl approves archive.backup_users.unicorn_role, '
  '(b) 4D-4 updates ~54 SQL functions. '
  'Requires Carl + Dave sign-off before permanent DROP.';

DO $postflight$
DECLARE
  v_data_type text; v_nullable text;
  v_orphans int; v_nulls int; v_param_type text;
  v_public_count int; v_storage_count int; v_cast_count int;
  v_spotcheck int; v_storage_check int;
BEGIN
  SELECT data_type, is_nullable INTO v_data_type, v_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='unicorn_role';
  IF v_data_type <> 'text' OR v_nullable <> 'NO' THEN
    RAISE EXCEPTION 'POST 1: data_type=%, is_nullable=%', v_data_type, v_nullable;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_unicorn_role_fk' AND conrelid='public.users'::regclass) THEN
    RAISE EXCEPTION 'POST 2: FK missing';
  END IF;

  SELECT count(*) INTO v_orphans FROM public.users u
  LEFT JOIN public.dd_unicorn_roles d ON d.value = u.unicorn_role
  WHERE d.value IS NULL;
  IF v_orphans <> 0 THEN RAISE EXCEPTION 'POST 3: % orphans', v_orphans; END IF;

  SELECT count(*) INTO v_nulls FROM public.users WHERE unicorn_role IS NULL;
  IF v_nulls <> 0 THEN RAISE EXCEPTION 'POST 4: % nulls', v_nulls; END IF;

  SELECT pg_catalog.format_type(p.proargtypes[1], NULL) INTO v_param_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='user_protected_fields_unchanged_safe';
  IF v_param_type <> 'text' THEN RAISE EXCEPTION 'POST 5: param2=%', v_param_type; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_dashboard_labour_efficiency') THEN
    RAISE EXCEPTION 'POST 6: view missing'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_set_user_type_from_role' AND tgrelid='public.users'::regclass) THEN
    RAISE EXCEPTION 'POST 7: trigger missing'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='unicorn_role') THEN
    RAISE EXCEPTION 'POST 8: enum missing'; END IF;

  SELECT count(*) INTO v_public_count FROM pg_policies
  WHERE schemaname='public' AND (qual ILIKE '%unicorn_role%' OR with_check ILIKE '%unicorn_role%');
  SELECT count(*) INTO v_storage_count FROM pg_policies
  WHERE schemaname='storage' AND (qual ILIKE '%unicorn_role%' OR with_check ILIKE '%unicorn_role%');
  IF v_public_count <> 82 OR v_storage_count <> 5 THEN
    RAISE EXCEPTION 'POST 9: public=%, storage=%', v_public_count, v_storage_count;
  END IF;

  SELECT count(*) INTO v_cast_count FROM pg_policies
  WHERE qual ILIKE '%::unicorn_role%' OR with_check ILIKE '%::unicorn_role%';
  IF v_cast_count <> 0 THEN RAISE EXCEPTION 'POST 10: % casts remain', v_cast_count; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_update_own') THEN
    RAISE EXCEPTION 'POST 11: users_update_own missing'; END IF;

  SELECT count(*) INTO v_spotcheck FROM pg_policies
  WHERE policyname IN ('client_timeline_events_vivacity_select',
                       'seat_measurable_entries_owner_insert_own',
                       'usersetup_links_write_superadmin')
    AND NOT (COALESCE(qual,'') ILIKE '%::unicorn_role%' OR COALESCE(with_check,'') ILIKE '%::unicorn_role%');
  IF v_spotcheck <> 3 THEN RAISE EXCEPTION 'POST 12: spot-check=%', v_spotcheck; END IF;

  SELECT count(*) INTO v_storage_check FROM pg_policies
  WHERE schemaname='storage'
    AND policyname IN ('Admin can read compliance packs',
                       'Super Admins can delete SRTO source documents',
                       'Super Admins can update SRTO source documents',
                       'Super Admins can upload SRTO source documents',
                       'srto_source_super_admin_read')
    AND NOT (COALESCE(qual,'') ILIKE '%::unicorn_role%' OR COALESCE(with_check,'') ILIKE '%::unicorn_role%');
  IF v_storage_check <> 5 THEN RAISE EXCEPTION 'POST 13: storage=%', v_storage_check; END IF;
END $postflight$;
