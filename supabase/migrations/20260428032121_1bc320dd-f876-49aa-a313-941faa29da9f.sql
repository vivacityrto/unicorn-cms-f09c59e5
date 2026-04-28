-- ============================================================================
-- Step 1: user_uuid_history (decoupled - no FK to users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_uuid_history (
  id          bigserial PRIMARY KEY,
  old_uuid    uuid        NOT NULL,
  new_uuid    uuid        NOT NULL,
  email       text,
  reason      text        NOT NULL,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_uuid_history_old   ON public.user_uuid_history (old_uuid);
CREATE INDEX IF NOT EXISTS idx_user_uuid_history_new   ON public.user_uuid_history (new_uuid);
CREATE INDEX IF NOT EXISTS idx_user_uuid_history_email ON public.user_uuid_history (LOWER(email));

ALTER TABLE public.user_uuid_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uuh_select_superadmin ON public.user_uuid_history;
CREATE POLICY uuh_select_superadmin ON public.user_uuid_history
  FOR SELECT TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

DROP POLICY IF EXISTS uuh_insert_superadmin ON public.user_uuid_history;
CREATE POLICY uuh_insert_superadmin ON public.user_uuid_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- Step 2: ensure staff_provisioning_runs has the columns the trigger needs
-- ============================================================================
ALTER TABLE public.staff_provisioning_runs
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS status         text,
  ADD COLUMN IF NOT EXISTS error_message  text;

-- ============================================================================
-- Step 3: Convert all FKs referencing users(user_uuid) to ON UPDATE CASCADE
-- Preserve original ON DELETE rule per constraint. NOT VALID for speed.
-- ============================================================================
DO $mig$
DECLARE
  v_user_uuid_attnum smallint;
  v_pre_a int; v_pre_c int; v_pre_n int; v_pre_r int;
  v_post_a int; v_post_c int; v_post_n int; v_post_r int;
  v_bad_update int;
  r record;
  v_child text;
  v_col   text;
  v_del_clause text;
BEGIN
  SELECT attnum INTO v_user_uuid_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass AND attname = 'user_uuid';

  -- Snapshot pre-migration delete-rule distribution
  SELECT
    count(*) FILTER (WHERE confdeltype = 'a'),
    count(*) FILTER (WHERE confdeltype = 'c'),
    count(*) FILTER (WHERE confdeltype = 'n'),
    count(*) FILTER (WHERE confdeltype = 'r')
  INTO v_pre_a, v_pre_c, v_pre_n, v_pre_r
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.users'::regclass
    AND confkey @> ARRAY[v_user_uuid_attnum];

  RAISE NOTICE 'Pre-migration delete rules: NO ACTION=%, CASCADE=%, SET NULL=%, RESTRICT=%',
               v_pre_a, v_pre_c, v_pre_n, v_pre_r;

  FOR r IN
    SELECT
      conname,
      conrelid::regclass::text AS child_table,
      (SELECT attname
         FROM pg_attribute
        WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) AS child_col,
      confdeltype
    FROM pg_constraint c
    WHERE contype = 'f'
      AND confrelid = 'public.users'::regclass
      AND confkey @> ARRAY[v_user_uuid_attnum]
    ORDER BY conrelid::regclass::text, conname
  LOOP
    v_child := r.child_table;
    v_col   := r.child_col;
    v_del_clause := CASE r.confdeltype
                      WHEN 'a' THEN 'NO ACTION'
                      WHEN 'c' THEN 'CASCADE'
                      WHEN 'n' THEN 'SET NULL'
                      WHEN 'r' THEN 'RESTRICT'
                      WHEN 'd' THEN 'SET DEFAULT'
                    END;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',
                   v_child, r.conname);

    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE %s NOT VALID',
      v_child, r.conname, v_col, v_del_clause);
  END LOOP;

  -- Safety check 1: every FK is now ON UPDATE CASCADE
  SELECT count(*) INTO v_bad_update
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.users'::regclass
    AND confkey @> ARRAY[v_user_uuid_attnum]
    AND confupdtype <> 'c';

  IF v_bad_update > 0 THEN
    RAISE EXCEPTION 'Safety check failed: % FK(s) still not ON UPDATE CASCADE', v_bad_update;
  END IF;

  -- Safety check 2: delete-rule distribution unchanged
  SELECT
    count(*) FILTER (WHERE confdeltype = 'a'),
    count(*) FILTER (WHERE confdeltype = 'c'),
    count(*) FILTER (WHERE confdeltype = 'n'),
    count(*) FILTER (WHERE confdeltype = 'r')
  INTO v_post_a, v_post_c, v_post_n, v_post_r
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.users'::regclass
    AND confkey @> ARRAY[v_user_uuid_attnum];

  IF (v_pre_a, v_pre_c, v_pre_n, v_pre_r) IS DISTINCT FROM (v_post_a, v_post_c, v_post_n, v_post_r) THEN
    RAISE EXCEPTION 'Safety check failed: delete-rule distribution changed. pre=(%,%,%,%) post=(%,%,%,%)',
      v_pre_a, v_pre_c, v_pre_n, v_pre_r, v_post_a, v_post_c, v_post_n, v_post_r;
  END IF;

  RAISE NOTICE 'All FKs converted to ON UPDATE CASCADE. Delete rules preserved.';
END
$mig$;

-- ============================================================================
-- Step 4: Harden link_auth_user_to_profile() — fix WHERE clause, add
-- collision detection, never raise (auth insert must always succeed).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.link_auth_user_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_uuid  uuid;
  v_collision_uuid uuid;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_uuid INTO v_existing_uuid
  FROM public.users
  WHERE LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  -- No existing row, or already aligned
  IF v_existing_uuid IS NULL OR v_existing_uuid = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Collision: another row already at NEW.id
  SELECT user_uuid INTO v_collision_uuid
  FROM public.users
  WHERE user_uuid = NEW.id
  LIMIT 1;

  IF v_collision_uuid IS NOT NULL THEN
    BEGIN
      INSERT INTO public.staff_provisioning_runs (email, status, error_message)
      VALUES (
        NEW.email,
        'collision',
        format('relink blocked: row %s already exists at new auth uuid %s while old row %s exists for same email',
               v_collision_uuid, NEW.id, v_existing_uuid)
      );
    EXCEPTION WHEN OTHERS THEN
      -- swallow: never block auth insert
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- Perform the relink (CASCADE propagates to all child FKs)
  BEGIN
    UPDATE public.users
       SET user_uuid = NEW.id,
           updated_at = now()
     WHERE LOWER(email) = LOWER(NEW.email);

    INSERT INTO public.user_uuid_history (old_uuid, new_uuid, email, reason)
    VALUES (v_existing_uuid, NEW.id, NEW.email, 'auth_relink');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.staff_provisioning_runs (email, status, error_message)
      VALUES (
        NEW.email,
        'relink_failed',
        format('SQLSTATE=%s MESSAGE=%s', SQLSTATE, SQLERRM)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.link_auth_user_to_profile() IS
  'AFTER INSERT trigger on auth.users. Re-links public.users by email when a staff auth account is re-provisioned. Never raises — failures are logged to staff_provisioning_runs. Successful re-links are recorded in user_uuid_history. Relies on ON UPDATE CASCADE on all 108 child FKs to propagate the user_uuid change.';