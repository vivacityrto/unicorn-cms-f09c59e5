-- handle_staff_first_login (fires on every /triage-dashboard load) has been
-- 400ing whenever it finds a staff_provisioning_runs row with
-- status='provisioned' and first_login_detected_at still null (e.g. Carl's
-- own leftover run from an April test provisioning). The function inserts
-- into user_notifications with `ON CONFLICT (dedupe_key) DO NOTHING`, but
-- dedupe_key has never had a unique constraint -- only user_notifications_pkey
-- on id -- so Postgres raises 42P10 (no unique/exclusion constraint matching
-- the ON CONFLICT target) before the insert can even attempt to run.
--
-- Verified safe: 2,978 existing non-null dedupe_key values, all distinct
-- (963 rows have a null dedupe_key, which a unique constraint permits --
-- Postgres treats NULLs as distinct from each other under UNIQUE).

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_dedupe_key_key UNIQUE (dedupe_key);

-- Second bug found while verifying the above live: with the dedupe_key
-- constraint in place, handle_staff_first_login got past the
-- user_notifications insert and then failed on its notification_queue
-- insert with notification_queue_channel_check -- it passes channel =
-- 'in_app', but the check constraint only allows 'inapp' | 'email' |
-- 'both'. Plain naming mismatch (underscore vs none); this is the only
-- function in the schema that uses 'in_app' for this column, so it's an
-- isolated typo, not a wider convention drift.
CREATE OR REPLACE FUNCTION public.handle_staff_first_login(p_user_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_run            public.staff_provisioning_runs%ROWTYPE;
  v_first_name     text;
  v_last_name      text;
  v_full_name      text;
  v_email          text;
  v_link           text;
  v_dedupe         text;
  v_vivacity_tid   bigint := 6372;
  v_admin          record;
BEGIN
  IF p_user_uuid IS NULL THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_run
    FROM public.staff_provisioning_runs
   WHERE target_user_id = p_user_uuid
     AND status = 'provisioned'
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_run.first_login_detected_at IS NOT NULL THEN
    RETURN; -- idempotent
  END IF;

  v_first_name := COALESCE(v_run.first_name, '');
  v_last_name  := COALESCE(v_run.last_name, '');
  v_full_name  := NULLIF(BTRIM(v_first_name || ' ' || v_last_name), '');
  v_email      := v_run.email;
  v_link       := '/admin/team-users/runs/' || v_run.id::text || '/onboarding';
  v_dedupe     := 'first_login_' || COALESCE(v_run.target_user_id::text, v_run.id::text);

  UPDATE public.staff_provisioning_runs
     SET first_login_detected_at = now(),
         updated_at = now()
   WHERE id = v_run.id;

  FOR v_admin IN
    SELECT u.user_uuid
      FROM public.users u
     WHERE u.is_vivacity_internal = true
       AND u.unicorn_role IN ('Super Admin', 'Admin')
       AND COALESCE(u.archived, false) = false
       AND COALESCE(u.disabled, false) = false
       AND u.user_uuid IS NOT NULL
  LOOP
    INSERT INTO public.user_notifications
      (user_id, tenant_id, type, title, message, link, dedupe_key, source_id, metadata)
    VALUES (
      v_admin.user_uuid,
      v_vivacity_tid,
      'staff_onboarding_alert',
      COALESCE(v_full_name, 'A new team member') || ' has logged in for the first time',
      'Their onboarding hub is ready. Send the welcome pack now.',
      v_link,
      v_dedupe || '_' || v_admin.user_uuid::text,
      v_run.id::text,
      jsonb_build_object(
        'provisioning_run_id', v_run.id,
        'target_user_id', v_run.target_user_id,
        'first_name', v_first_name,
        'last_name', v_last_name,
        'email', v_email,
        'role_code', v_run.role_code,
        'start_date', v_run.start_date
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  IF v_run.welcome_email_sent_at IS NULL THEN
    INSERT INTO public.notification_queue
      (user_id, tenant_id, type, payload, scheduled_at, channel, status)
    VALUES (
      v_run.target_user_id,
      v_vivacity_tid,
      'staff_welcome_pack_ready',
      jsonb_build_object(
        'first_name', v_first_name,
        'last_name', v_last_name,
        'email', v_email,
        'role_code', v_run.role_code,
        'start_date', v_run.start_date,
        'provisioning_run_id', v_run.id
      ),
      now(),
      'inapp',
      'pending'
    );
  END IF;
END;
$function$;
