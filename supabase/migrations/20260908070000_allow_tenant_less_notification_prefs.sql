-- L10 #18 (docs/kb/reference/l10-real-bugs-found-2026-09-04.md): notification
-- preferences have always 400'd for the 72 users with no single tenant_id
-- (get_user_notification_prefs/update_user_notification_prefs resolve
-- tenant_id via `SELECT tenant_id FROM users WHERE user_uuid = auth.uid()`,
-- which is NULL for these accounts, and user_notification_prefs.tenant_id is
-- NOT NULL). This migration only changes how a NULL tenant_id is handled -
-- it does not decide which real tenant any of those 72 users should belong
-- to (parked separately: docs/kb/reference/tenant-operating-model-data-
-- architecture-plan-2026-09-02.md §18 item 14).

-- 1. Allow NULL - a tenant-less user gets one global preferences row.
ALTER TABLE public.user_notification_prefs ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. The existing UNIQUE (user_id, tenant_id) constraint never catches
-- duplicate NULL-tenant rows for the same user (standard SQL NULL <> NULL
-- semantics), so a second first-time save would silently create a second
-- row instead of updating the first. Close that gap with a partial unique
-- index scoped to exactly the NULL case; the original constraint is
-- untouched and still governs every tenant-scoped row.
CREATE UNIQUE INDEX user_notification_prefs_user_id_null_tenant_key
  ON public.user_notification_prefs (user_id)
  WHERE tenant_id IS NULL;

-- 3. get_user_notification_prefs: `tenant_id = v_tenant_id` is never TRUE
-- when v_tenant_id is NULL (NULL = NULL evaluates to NULL, not TRUE) - a
-- tenant-less user's own row would never be found even after step 1, and
-- the function would try to INSERT a fresh default row on every single
-- read. Fixed with IS NOT DISTINCT FROM, which correctly treats NULL = NULL
-- as a match. No parameter/return-type change, so CREATE OR REPLACE is
-- sufficient (no DROP FUNCTION needed).
CREATE OR REPLACE FUNCTION public.get_user_notification_prefs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefs RECORD;
  v_tenant_id bigint;
BEGIN
  -- Get user's tenant_id (NULL for staff/SuperAdmin accounts with no single
  -- tenant assignment - a real, deliberately-supported case, not an error)
  SELECT tenant_id INTO v_tenant_id
  FROM users WHERE user_uuid = auth.uid();

  -- Get or create preferences
  SELECT * INTO v_prefs
  FROM user_notification_prefs
  WHERE user_id = auth.uid() AND tenant_id IS NOT DISTINCT FROM v_tenant_id;

  IF NOT FOUND THEN
    -- Create default preferences
    INSERT INTO user_notification_prefs (user_id, tenant_id)
    VALUES (auth.uid(), v_tenant_id)
    RETURNING * INTO v_prefs;
  END IF;

  RETURN jsonb_build_object(
    'email_enabled', v_prefs.email_enabled,
    'inapp_enabled', v_prefs.inapp_enabled,
    'digest_enabled', v_prefs.digest_enabled,
    'quiet_hours', v_prefs.quiet_hours,
    'event_settings', v_prefs.event_settings
  );
END;
$function$;

-- 4. update_user_notification_prefs: `ON CONFLICT (user_id, tenant_id)`
-- only arbitrates against the original UNIQUE(user_id, tenant_id)
-- constraint, which (same NULL semantics as above) never recognizes a
-- second NULL-tenant row as a conflict. A NULL-tenant user's second save
-- would silently INSERT a duplicate row instead of updating the first one,
-- even after steps 1-2. Branch on whether the user has a tenant so each
-- path names the correct conflict arbiter - the new partial unique index
-- from step 2 for a NULL tenant, the original constraint otherwise. No
-- parameter/return-type change, so CREATE OR REPLACE is sufficient.
CREATE OR REPLACE FUNCTION public.update_user_notification_prefs(p_prefs jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pref_id UUID;
  v_tenant_id BIGINT;
BEGIN
  -- Get user's tenant_id (NULL for staff/SuperAdmin accounts with no single
  -- tenant assignment - a real, deliberately-supported case, not an error)
  SELECT tenant_id INTO v_tenant_id
  FROM users WHERE user_uuid = auth.uid();

  IF v_tenant_id IS NULL THEN
    INSERT INTO user_notification_prefs (
      user_id, tenant_id, email_enabled, inapp_enabled, digest_enabled, quiet_hours, event_settings
    ) VALUES (
      auth.uid(),
      NULL,
      COALESCE((p_prefs->>'email_enabled')::boolean, true),
      COALESCE((p_prefs->>'inapp_enabled')::boolean, true),
      COALESCE((p_prefs->>'digest_enabled')::boolean, false),
      COALESCE(p_prefs->'quiet_hours', '{"start": "22:00", "end": "07:00", "timezone": "Australia/Sydney"}'::jsonb),
      COALESCE(p_prefs->'event_settings', '{}'::jsonb)
    )
    ON CONFLICT (user_id) WHERE tenant_id IS NULL
    DO UPDATE SET
      email_enabled = COALESCE((p_prefs->>'email_enabled')::boolean, user_notification_prefs.email_enabled),
      inapp_enabled = COALESCE((p_prefs->>'inapp_enabled')::boolean, user_notification_prefs.inapp_enabled),
      digest_enabled = COALESCE((p_prefs->>'digest_enabled')::boolean, user_notification_prefs.digest_enabled),
      quiet_hours = COALESCE(p_prefs->'quiet_hours', user_notification_prefs.quiet_hours),
      event_settings = COALESCE(p_prefs->'event_settings', user_notification_prefs.event_settings),
      updated_at = now()
    RETURNING id INTO v_pref_id;
  ELSE
    INSERT INTO user_notification_prefs (
      user_id, tenant_id, email_enabled, inapp_enabled, digest_enabled, quiet_hours, event_settings
    ) VALUES (
      auth.uid(),
      v_tenant_id,
      COALESCE((p_prefs->>'email_enabled')::boolean, true),
      COALESCE((p_prefs->>'inapp_enabled')::boolean, true),
      COALESCE((p_prefs->>'digest_enabled')::boolean, false),
      COALESCE(p_prefs->'quiet_hours', '{"start": "22:00", "end": "07:00", "timezone": "Australia/Sydney"}'::jsonb),
      COALESCE(p_prefs->'event_settings', '{}'::jsonb)
    )
    ON CONFLICT (user_id, tenant_id)
    DO UPDATE SET
      email_enabled = COALESCE((p_prefs->>'email_enabled')::boolean, user_notification_prefs.email_enabled),
      inapp_enabled = COALESCE((p_prefs->>'inapp_enabled')::boolean, user_notification_prefs.inapp_enabled),
      digest_enabled = COALESCE((p_prefs->>'digest_enabled')::boolean, user_notification_prefs.digest_enabled),
      quiet_hours = COALESCE(p_prefs->'quiet_hours', user_notification_prefs.quiet_hours),
      event_settings = COALESCE(p_prefs->'event_settings', user_notification_prefs.event_settings),
      updated_at = now()
    RETURNING id INTO v_pref_id;
  END IF;

  RETURN v_pref_id;
END;
$function$;
