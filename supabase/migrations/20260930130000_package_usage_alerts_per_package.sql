-- Replace the two per-time-entry "membership utilisation" alert triggers with one
-- per-PACKAGE usage alert that reads the app's canonical burndown.
--
-- Why (see docs/audit-log/entries/2026-09-30-package-usage-alerts-per-package.md):
--   The old alerts (trg_check_membership_utilisation -> utilisation_* and
--   trg_check_membership_usage -> capacity_alert) both called
--   compute_membership_usage(tenant), which
--     * picked ONE package per tenant (the biggest tier) and ignored the rest,
--     * divided ALL of the tenant's time (every package, billable or not) by a
--       hard-coded tier table (Gold 14h, Sapphire 63h, ...) that disagrees with
--       the client's own package for 40 of 50 tier clients,
--     * used the onboarding anniversary as the "year" instead of the package's
--       own renewal period,
--     * sent two duplicate notifications per event, repeated monthly, with
--       generic text ("Client has used 90%") and "approaching" wording even
--       when the client was already over the limit.
--   Example: a client with a membership package plus a second package was alerted
--   at 94% when its membership package was really ~54% used.
--
-- What this does
--   * Adds fn_package_usage_alert_trigger() + trg_package_usage_alert, fired when a
--     package instance's hours_used actually changes. hours_used is already kept in
--     sync by tg_recalc_package_hours_used / ..._from_allocation for every billable
--     time entry or allocation change, so this fires once, for exactly the package
--     affected, and never for non-billable time.
--   * Reads v_package_burndown for that one package - the same numbers the Time tab
--     shows: allowance = included_minutes + hours_added*60 + carried-in minutes,
--     used = billable minutes (allocation-aware, excluding carry_over) inside the
--     package's own renewal period. So an alert can never disagree with the screen.
--   * Thresholds 75 / 90 / 100 (% as displayed, 1 dp). One notification per package
--     per threshold per renewal period (dedupe key includes the period start), so a
--     package no longer re-alerts every month. Only the highest threshold reached is
--     sent when usage jumps across several at once.
--   * Recipient: the tenant's assigned consultant only. No consultant -> no alert.
--   * Skips: packages with no allowance, unlimited packages, paused packages, and
--     tenants whose status is cancelled / disabled / archived / completed / inactive.
--   * The notification names the client and package, gives hours used / included and
--     the renewal date, and links to that package. Existing types are reused
--     (utilisation_warning for 75, utilisation_critical for 90 and 100), so no UI
--     change is needed.
--   * Alerts can NEVER block time logging: any error inside the function is caught
--     and downgraded to a warning (the old functions had no such guard).
--   * Drops the two old triggers and their functions. compute_membership_usage()
--     itself is left alone (still used by rpc_get_membership_usage and
--     rpc_get_consultant_clients).
--
-- Not changed: existing notifications, user_notifications schema, RLS, grants.
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.fn_package_usage_alert_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_burn          record;
  v_pct           numeric;
  v_threshold     int;
  v_consultant    uuid;
  v_tenant_name   text;
  v_tenant_status text;
  v_package_name  text;
  v_period_start  date;
  v_renewal       date;
  v_used_h        numeric;
  v_incl_h        numeric;
  v_over_min      numeric;
  v_type          text;
  v_title         text;
  v_message       text;
  v_detail        text;
BEGIN
  IF NEW.is_complete
     OR COALESCE(NEW.is_unlimited_override, false)
     OR NEW.membership_state = 'paused' THEN
    RETURN NEW;
  END IF;

  -- The app's canonical numbers for exactly this package instance.
  SELECT b.included_minutes, b.used_minutes, b.percent_used
    INTO v_burn
  FROM public.v_package_burndown b
  WHERE b.package_instance_id = NEW.id;

  IF NOT FOUND OR COALESCE(v_burn.included_minutes, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_pct := v_burn.percent_used;
  v_threshold := CASE
    WHEN v_pct >= 100 THEN 100
    WHEN v_pct >= 90  THEN 90
    WHEN v_pct >= 75  THEN 75
    ELSE NULL
  END;
  IF v_threshold IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.assigned_consultant_user_id, t.name, t.status
    INTO v_consultant, v_tenant_name, v_tenant_status
  FROM public.tenants t
  WHERE t.id = NEW.tenant_id;

  IF v_consultant IS NULL
     OR v_tenant_status IN ('cancelled', 'disabled', 'archived', 'completed', 'inactive') THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_package_name
  FROM public.packages p
  WHERE p.id = NEW.package_id;

  v_package_name := COALESCE(v_package_name, 'package');
  v_period_start := COALESCE(NEW.start_renewal_date, NEW.start_date);
  v_renewal      := COALESCE(NEW.next_renewal_date, (NEW.start_date + interval '1 year')::date);
  v_used_h       := v_burn.used_minutes / 60.0;
  v_incl_h       := v_burn.included_minutes / 60.0;

  v_type := CASE WHEN v_threshold = 75 THEN 'utilisation_warning' ELSE 'utilisation_critical' END;

  v_over_min := v_burn.used_minutes - v_burn.included_minutes;

  v_title := CASE
    WHEN v_threshold = 100 AND v_over_min > 0
      THEN format('Over included hours: %s (%s)', v_package_name, v_tenant_name)
    WHEN v_threshold = 100
      THEN format('All included hours used: %s (%s)', v_package_name, v_tenant_name)
    ELSE format('Package at %s%%: %s (%s)', v_threshold, v_package_name, v_tenant_name)
  END;

  v_detail := CASE
    WHEN v_threshold < 100
      THEN format('%s hours remaining.', to_char(round(v_incl_h - v_used_h, 1), 'FM999990.0'))
    WHEN v_over_min <= 0
      THEN 'No hours remaining.'
    WHEN v_over_min < 60
      THEN format('Over by %s minutes.', v_over_min)
    ELSE format('Over by %s hours.', to_char(round(v_over_min / 60.0, 1), 'FM999990.0'))
  END;

  v_message := format(
    '%s has used %s of %s hours (%s%%) of its %s package. %s Renews %s.',
    v_tenant_name,
    to_char(round(v_used_h, 1), 'FM999990.0'),
    to_char(round(v_incl_h, 1), 'FM999990.0'),
    to_char(v_pct, 'FM990.0'),
    v_package_name,
    v_detail,
    to_char(v_renewal, 'FMDD FMMonth YYYY')
  );

  INSERT INTO public.user_notifications (
    user_id, tenant_id, type, title, message, link, dedupe_key, metadata
  ) VALUES (
    v_consultant,
    NEW.tenant_id,
    v_type,
    v_title,
    v_message,
    format('/tenant/%s?tab=packages&packageInstance=%s', NEW.tenant_id, NEW.id),
    format('pkg_usage_%s_%s_%s', NEW.id, v_threshold, v_period_start),
    jsonb_build_object(
      'source', 'package_usage_alert',
      'package_instance_id', NEW.id,
      'package_name', v_package_name,
      'threshold', v_threshold,
      'percent_used', v_pct,
      'used_minutes', v_burn.used_minutes,
      'included_minutes', v_burn.included_minutes,
      'period_start', v_period_start,
      'renewal_date', v_renewal
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- An alert must never stop a consultant logging time.
  RAISE WARNING 'fn_package_usage_alert_trigger failed for package instance %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_package_usage_alert_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_package_usage_alert ON public.package_instances;

CREATE TRIGGER trg_package_usage_alert
AFTER UPDATE OF hours_used ON public.package_instances
FOR EACH ROW
WHEN (OLD.hours_used IS DISTINCT FROM NEW.hours_used)
EXECUTE FUNCTION public.fn_package_usage_alert_trigger();

-- Retire the two old per-time-entry alerts and their functions.
DROP TRIGGER IF EXISTS trg_check_membership_usage ON public.time_entries;
DROP TRIGGER IF EXISTS trg_check_membership_utilisation ON public.time_entries;
DROP FUNCTION IF EXISTS public.fn_check_membership_usage_alerts();
DROP FUNCTION IF EXISTS public.check_membership_utilisation_alerts();
