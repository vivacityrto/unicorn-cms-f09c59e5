
-- ============================================================
-- PHASE 1: Time Entry Audit Log + Package Summary Views + Backfill
-- ============================================================

-- 1. CREATE AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.time_entry_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL,
  tenant_id integer NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'repost', 'split')),
  old_row jsonb,
  new_row jsonb,
  reason text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_time_entry_audit_log_entry ON public.time_entry_audit_log(time_entry_id);
CREATE INDEX idx_time_entry_audit_log_tenant ON public.time_entry_audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_time_entry_audit_log_actor ON public.time_entry_audit_log(actor_user_id, created_at DESC);

-- RLS
ALTER TABLE public.time_entry_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view audit log"
  ON public.time_entry_audit_log FOR SELECT
  TO authenticated
  USING (public.has_tenant_access_safe(tenant_id::bigint, auth.uid()));

CREATE POLICY "System can insert audit log"
  ON public.time_entry_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. AUDIT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.fn_time_entry_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.time_entry_audit_log (time_entry_id, tenant_id, action, new_row, actor_user_id)
    VALUES (NEW.id, NEW.tenant_id, 'create', to_jsonb(NEW), COALESCE(auth.uid(), NEW.user_id));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.time_entry_audit_log (time_entry_id, tenant_id, action, old_row, new_row, actor_user_id)
    VALUES (NEW.id, NEW.tenant_id, 'update', to_jsonb(OLD), to_jsonb(NEW), COALESCE(auth.uid(), NEW.user_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.time_entry_audit_log (time_entry_id, tenant_id, action, old_row, actor_user_id)
    VALUES (OLD.id, OLD.tenant_id, 'delete', to_jsonb(OLD), COALESCE(auth.uid(), OLD.user_id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_time_entry_audit ON public.time_entries;
CREATE TRIGGER trg_time_entry_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_time_entry_audit();

-- 3. Add composite index on time_entries for package queries
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_package_date 
  ON public.time_entries(tenant_id, package_id, start_at);

-- 4. PACKAGE TIME SUMMARY VIEW
CREATE OR REPLACE VIEW public.v_package_time_summary
WITH (security_invoker = true)
AS
SELECT
  te.tenant_id,
  te.package_id AS package_instance_id,
  SUM(te.duration_minutes) FILTER (
    WHERE date_trunc('month', te.start_at) = date_trunc('month', now())
  ) AS minutes_month,
  SUM(te.duration_minutes) FILTER (
    WHERE te.start_at >= date_trunc('year', now())
  ) AS minutes_ytd,
  SUM(te.duration_minutes) AS minutes_total,
  MAX(te.start_at) AS last_entry_at
FROM public.time_entries te
WHERE te.package_id IS NOT NULL
GROUP BY te.tenant_id, te.package_id;

-- 5. PACKAGE BURNDOWN VIEW
CREATE OR REPLACE VIEW public.v_package_burndown
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  COALESCE(pi.hours_included, 0) * 60 + COALESCE(pi.hours_added, 0) * 60 AS included_minutes,
  COALESCE(ts.used_minutes, 0) AS used_minutes,
  (COALESCE(pi.hours_included, 0) * 60 + COALESCE(pi.hours_added, 0) * 60) - COALESCE(ts.used_minutes, 0) AS remaining_minutes,
  CASE
    WHEN (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(ts.used_minutes, 0)::numeric / ((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) * 60)) * 100,
      1
    )
  END AS percent_used
FROM public.package_instances pi
LEFT JOIN (
  SELECT package_id, SUM(duration_minutes) AS used_minutes
  FROM public.time_entries
  WHERE package_id IS NOT NULL
  GROUP BY package_id
) ts ON ts.package_id = pi.id
WHERE pi.is_complete = false;

-- 6. STALE DRAFTS VIEW
CREATE OR REPLACE VIEW public.v_time_drafts_stale
WITH (security_invoker = true)
AS
SELECT
  ctd.created_by AS user_id,
  ctd.tenant_id,
  COUNT(*) AS count_stale_over_2_days
FROM public.calendar_time_drafts ctd
WHERE ctd.status = 'draft'
  AND ctd.created_at < now() - interval '2 days'
  AND (ctd.snoozed_until IS NULL OR ctd.snoozed_until <= CURRENT_DATE)
GROUP BY ctd.created_by, ctd.tenant_id;

-- 7. BACKFILL: Infer package_id for orphaned time_entries
-- Step A: Infer via stage_id -> stage_instances -> package_instance
UPDATE public.time_entries te
SET package_id = si.packageinstance_id::integer
FROM public.stage_instances si
WHERE te.package_id IS NULL
  AND te.stage_id IS NOT NULL
  AND te.stage_id = si.stage_id
  AND si.packageinstance_id IS NOT NULL;

-- Step B: Infer via closest active package by tenant + date
-- For entries still without package, pick the most recent package_instance for that tenant
-- whose start_date is <= the entry date
UPDATE public.time_entries te
SET package_id = inferred.pi_id::integer
FROM (
  SELECT DISTINCT ON (te2.id)
    te2.id AS entry_id,
    pi.id AS pi_id
  FROM public.time_entries te2
  JOIN public.package_instances pi ON pi.tenant_id = te2.tenant_id
  WHERE te2.package_id IS NULL
    AND pi.start_date <= COALESCE(te2.start_at::date, CURRENT_DATE)
  ORDER BY te2.id, pi.start_date DESC
) inferred
WHERE te.id = inferred.entry_id;
