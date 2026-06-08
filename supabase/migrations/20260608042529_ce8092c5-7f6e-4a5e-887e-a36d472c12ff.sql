
-- 1. New columns on staff_provisioning_runs
ALTER TABLE public.staff_provisioning_runs
  ADD COLUMN IF NOT EXISTS first_login_detected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_complete_at  timestamptz NULL;

-- 2. handle_staff_first_login(uuid)
CREATE OR REPLACE FUNCTION public.handle_staff_first_login(p_user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Find a provisioned run for this user that hasn't yet been first-login flagged
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

  -- Stamp the run
  UPDATE public.staff_provisioning_runs
     SET first_login_detected_at = now(),
         updated_at = now()
   WHERE id = v_run.id;

  -- Notify admins (idempotent via dedupe_key unique index)
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

  -- Queue welcome pack for manual review (only if not already sent)
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
      'in_app',
      'pending'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_staff_first_login(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_staff_first_login(uuid) TO authenticated, service_role;

-- 3. Trigger: stamp onboarding_complete_at when all instances are completed
CREATE OR REPLACE FUNCTION public.tg_staff_onboarding_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id      bigint;
  v_total       int;
  v_done        int;
BEGIN
  v_run_id := COALESCE(NEW.provisioning_run_id, OLD.provisioning_run_id);
  IF v_run_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.lifecycle_type, OLD.lifecycle_type) <> 'staff_onboarding' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completed = true)
    INTO v_total, v_done
    FROM public.lifecycle_checklist_instances
   WHERE provisioning_run_id = v_run_id
     AND lifecycle_type = 'staff_onboarding';

  IF v_total > 0 AND v_done = v_total THEN
    UPDATE public.staff_provisioning_runs
       SET onboarding_complete_at = COALESCE(onboarding_complete_at, now()),
           updated_at = now()
     WHERE id = v_run_id
       AND onboarding_complete_at IS NULL;
  ELSE
    UPDATE public.staff_provisioning_runs
       SET onboarding_complete_at = NULL,
           updated_at = now()
     WHERE id = v_run_id
       AND onboarding_complete_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_onboarding_complete ON public.lifecycle_checklist_instances;
CREATE TRIGGER trg_staff_onboarding_complete
AFTER INSERT OR UPDATE OR DELETE ON public.lifecycle_checklist_instances
FOR EACH ROW
EXECUTE FUNCTION public.tg_staff_onboarding_complete();
