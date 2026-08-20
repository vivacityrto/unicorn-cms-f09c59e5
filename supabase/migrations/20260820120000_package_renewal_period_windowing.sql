-- Package renewal doesn't reset hours: fn_package_used_minutes() (the
-- canonical calc package_instances.hours_used is kept in sync with, and
-- that the client portal's dashboard independently re-derives) has always
-- summed billable minutes since the package instance's own start_date, with
-- no upper bound - lifetime-since-start, never re-anchored at renewal. That's
-- why a renewed package still shows hours climbing past 100% and stale
-- "Stuck"/overdue-task state right after renewal (the latter untouched here;
-- out of scope for this pass - see docs/audit-log entry for this change).
--
-- v_package_burndown already gets this right (windows to the current
-- renewal year), which is why the Time tab burndown chart and this dialog's
-- own carry-over math were correct while the two "hrs used" displays
-- (package_instances.hours_used / get_client_package_dashboard) were not.
--
-- Also fixes a second, related bug found while investigating: carry-over
-- time entries (work_type = 'carry_over') are excluded from every usage
-- calculation by design (they're accounting adjustments, not logged
-- consultation time) - but nothing ever added that carried amount back onto
-- the *next* period's allowance either. So "Carry Over" in the renewal
-- dialog logged an audit note saying hours were carried over, without ever
-- actually crediting them. This was already flagged, unresolved, in a prior
-- migration comment (20260714071137_exclude_carry_over_from_used_minutes_calc.sql):
-- "flagged to Angela to decide whether these should instead credit
-- hours_added". Decided 2026-08-20: yes, credit them - via the new
-- package_renewal_periods.carried_in_minutes field this migration adds.
--
-- Scope: this is "Phase 1" of a two-phase plan agreed with Angela/Dave.
-- Phase 1 (this migration): fix the renewal-window bug at its one canonical
-- source, and add period-level (not entry-level) history for per-renewal
-- reporting. Phase 2 (not done here): entry-level period tagging on
-- time_entry_allocations, deliberately deferred - it would require changing
-- allocate_time_entry()/fn_reallocate_time_entry(), which already caused one
-- production incident (see 20260730020000_fix_package_burndown_view_allocations.sql)
-- and deserves its own dedicated, tested pass.

-- ─── 1. package_instances.start_renewal_date ───────────────────────────
-- Column already exists in production (added ahead of this migration,
-- unpopulated, unreferenced anywhere in this checkout) - this ADD is just
-- for migration-history completeness; IF NOT EXISTS makes it a no-op here.
-- Marks the start of the CURRENT renewal period only (not historical -
-- package_renewal_periods below covers that). Nullable: every read falls
-- back to start_date so a row that somehow never gets it set behaves
-- exactly as it did before this migration, rather than erroring.
ALTER TABLE public.package_instances
  ADD COLUMN IF NOT EXISTS start_renewal_date date NULL;

COMMENT ON COLUMN public.package_instances.start_renewal_date IS
  'Start date of the CURRENT renewal period only. Set at package creation (= start_date) and at each renewal (= the renewal date just actioned) - never derived by adding an interval to its own previous value, to avoid compounding date drift (see docs/audit-log/entries/2026-07-06-farsta-package-burndown-renewal-date.md). Falls back to start_date when null.';

-- ─── 2. package_renewal_periods ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_renewal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL,
  package_instance_id bigint NOT NULL REFERENCES public.package_instances(id) ON DELETE CASCADE,
  period_number integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  included_minutes integer NOT NULL DEFAULT 0,
  carried_in_minutes integer NOT NULL DEFAULT 0,
  hours_used_at_close numeric NULL,
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_instance_id, period_number),
  UNIQUE (package_instance_id, period_start)
);

COMMENT ON TABLE public.package_renewal_periods IS
  'One row per renewal cycle for a package instance - gives per-period hour history (Option B) without entry-level tagging (deferred Phase 2, see migration header). period_number is a count of periods recorded by this system from 2026-08-20 onward, not necessarily the client''s true lifetime renewal count for instances that predate this migration.';

-- Exactly one open (un-closed) period per package instance at any time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prp_one_open_period
  ON public.package_renewal_periods (package_instance_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prp_tenant_package
  ON public.package_renewal_periods (tenant_id, package_instance_id);

ALTER TABLE public.package_renewal_periods ENABLE ROW LEVEL SECURITY;

-- Mirrors package_instances' actual write-permission model (renewal is
-- already gated to super admins there - package_instances_update requires
-- is_super_admin()) and time_entry_allocations' read model.
CREATE POLICY "prp_select_tenant" ON public.package_renewal_periods
  FOR SELECT USING (public.has_tenant_access_safe(tenant_id::bigint, auth.uid()) OR public.is_super_admin());

CREATE POLICY "prp_insert_sa" ON public.package_renewal_periods
  FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY "prp_update_sa" ON public.package_renewal_periods
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ─── 3. Backfill: one open period per existing package instance ────────
-- Best-effort reconstruction of "the period this instance is in right now"
-- from today's existing (next_renewal_date - 1yr) math - the last time
-- anything needs to trust that derivation, since start_renewal_date is set
-- explicitly (not derived) from every future renewal onward.
INSERT INTO public.package_renewal_periods
  (tenant_id, package_instance_id, period_number, period_start, period_end, included_minutes, carried_in_minutes)
SELECT
  pi.tenant_id,
  pi.id,
  1,
  COALESCE((pi.next_renewal_date - interval '1 year')::date, pi.start_date),
  COALESCE(pi.next_renewal_date, (pi.start_date + interval '1 year')::date),
  COALESCE(pi.included_minutes, 0),
  0
FROM public.package_instances pi
WHERE NOT EXISTS (
  SELECT 1 FROM public.package_renewal_periods prp WHERE prp.package_instance_id = pi.id
);

UPDATE public.package_instances pi
SET start_renewal_date = prp.period_start
FROM public.package_renewal_periods prp
WHERE prp.package_instance_id = pi.id
  AND prp.closed_at IS NULL
  AND pi.start_renewal_date IS NULL;

-- ─── 4. fn_package_used_minutes: window by current renewal period ──────
-- Same allocations-aware structure as before (unchanged) - only the date
-- floor changes (pi.start_date -> pi.start_renewal_date) and a ceiling is
-- added (previously unbounded). Mirrors the pattern v_package_burndown has
-- used since 2026-07-30; this is what makes it apply everywhere at once
-- (package_instances.hours_used via the existing trigger, and the client
-- portal once it's repointed at this same canonical function below).
CREATE OR REPLACE FUNCTION public.fn_package_used_minutes(p_package_instance_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select
    coalesce((
      select sum(tea.allocated_minutes)
      from public.time_entry_allocations tea
      join public.time_entries te on te.id = tea.time_entry_id
      join public.package_instances pi on pi.id = tea.package_instance_id
      where tea.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and te.work_type <> 'carry_over'
        and te.start_at >= coalesce(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
        and te.start_at <  coalesce(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
    ), 0)
    +
    coalesce((
      select sum(te.duration_minutes)
      from public.time_entries te
      join public.package_instances pi on pi.id = te.package_instance_id
      where te.package_instance_id = p_package_instance_id
        and te.is_billable = true
        and te.work_type <> 'carry_over'
        and te.start_at >= coalesce(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
        and te.start_at <  coalesce(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
        and not exists (
          select 1 from public.time_entry_allocations tea2
          where tea2.time_entry_id = te.id
        )
    ), 0);
$function$;

COMMENT ON FUNCTION public.fn_package_used_minutes(bigint) IS
  'Canonical used-minutes calc for a package_instance, windowed to its CURRENT renewal period only (start_renewal_date to next_renewal_date) - not a lifetime total. Do not compute hours_used any other way (e.g. never join time_entries.package_id against package_instances.id - package_id has no FK and is not the same value space).';

-- One-time refresh: existing hours_used values were computed lifetime-since-
-- start_date and won't pick up this fix until their next unrelated write.
-- Same formula tg_recalc_package_hours_used() applies on every future write.
UPDATE public.package_instances pi
SET hours_used = (
  public.fn_package_used_minutes(pi.id)
  + COALESCE((
      SELECT SUM(public.fn_package_used_minutes(child.id))
      FROM public.package_instances child
      WHERE child.parent_instance_id = pi.id
    ), 0)
) / 60.0;

-- ─── 5. Client portal: stop duplicating the calc, read the canonical value ──
-- get_client_package_dashboard/v_client_package_dashboard had their own
-- inline hours_agg sum - independent of fn_package_used_minutes, so it
-- carried both bugs this migration fixes (unwindowed, AND blind to
-- time_entry_allocations splits/reallocations, understating usage for any
-- RTO+CRICOS dual-scope client the same way v_package_burndown did before
-- 2026-07-30). Reading pi.hours_used directly guarantees the portal always
-- matches the staff figure exactly, because it's the same stored value.
CREATE OR REPLACE VIEW public.v_client_package_dashboard AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status IN ('completed','core_complete','na'))::integer AS stages_complete,
         min(si.stage_sortorder) FILTER (WHERE si.status NOT IN ('completed','core_complete','na')) AS current_stage_sortorder,
         max(si.updated_at) AS stage_last_updated
    FROM public.stage_instances si
    JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
   WHERE app.user_can_access_tenant(pi_1.tenant_id)
   GROUP BY si.packageinstance_id
), current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
         COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''), s.name) AS shortname
    FROM public.stage_instances si
    JOIN public.stages s ON s.id = si.stage_id
    JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
   WHERE si.status NOT IN ('completed','core_complete','na')
     AND COALESCE(s.is_archived,false) = false
     AND COALESCE(s.is_audit_workspace,false) = false
     AND app.user_can_access_tenant(pi_1.tenant_id)
   ORDER BY si.packageinstance_id, si.stage_sortorder
), action_items_agg AS (
  SELECT cai.package_instance_id,
         count(*)::integer AS open_count,
         count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
         max(cai.updated_at) AS last_updated
    FROM public.client_action_items cai
   WHERE cai.package_instance_id IS NOT NULL
     AND cai.completed_at IS NULL
     AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     AND app.user_can_access_tenant(cai.tenant_id::bigint)
   GROUP BY cai.package_instance_id
), tasks_agg AS (
  SELECT a.package_instance_id,
         COALESCE(a.open_count,0)    AS open_tasks,
         COALESCE(a.overdue_count,0) AS overdue_tasks,
         a.last_updated              AS tasks_last_updated
    FROM action_items_agg a
), notes_agg AS (
  SELECT n.parent_id AS package_instance_id,
         max(n.updated_at) AS notes_last_updated
    FROM public.notes n
   WHERE n.parent_type = 'package_instance'
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   GROUP BY n.parent_id
), pinned AS (
  SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
         n.title AS pinned_note_title,
         n.note_details AS pinned_note_text,
         n.priority AS pinned_note_priority,
         n.updated_at AS pinned_note_updated_at
    FROM public.notes n
   WHERE n.parent_type = 'package_instance'
     AND n.is_pinned = true
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
), hours_agg AS (
  SELECT te.package_instance_id,
         max(te.start_at) AS max_te_at
    FROM public.time_entries te
    JOIN public.package_instances pi2 ON pi2.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
     AND app.user_can_access_tenant(pi2.tenant_id)
     AND te.is_billable = true
   GROUP BY te.package_instance_id
), current_period AS (
  SELECT DISTINCT ON (prp.package_instance_id) prp.package_instance_id, prp.carried_in_minutes
    FROM public.package_renewal_periods prp
   WHERE prp.closed_at IS NULL
   ORDER BY prp.package_instance_id, prp.period_number DESC
), most_recent_activity AS (
  SELECT pi_1.id AS package_instance_id,
         COALESCE(GREATEST(na_1.notes_last_updated, sa_1.stage_last_updated,
                           ta_1.tasks_last_updated, ha_1.max_te_at),
                  pi_1.start_date::timestamptz) AS last_activity_at
    FROM public.package_instances pi_1
    LEFT JOIN notes_agg na_1 ON na_1.package_instance_id = pi_1.id
    LEFT JOIN stage_agg sa_1 ON sa_1.package_instance_id = pi_1.id
    LEFT JOIN tasks_agg ta_1 ON ta_1.package_instance_id = pi_1.id
    LEFT JOIN hours_agg ha_1 ON ha_1.package_instance_id = pi_1.id
)
SELECT pi.id AS package_instance_id,
       pi.tenant_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
       p.package_type, p.progress_mode, pi.manager_id, pi.is_complete,
       pi.start_date, pi.end_date,
       COALESCE(pi.hours_included,0) AS hours_included,
       COALESCE(pi.hours_added,0)    AS hours_added,
       (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) AS hours_total,
       COALESCE(pi.hours_used,0::numeric) AS hours_used,
       GREATEST((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)
                - COALESCE(pi.hours_used,0::numeric), 0::numeric) AS hours_remaining,
       CASE WHEN (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) = 0 THEN 0::numeric
            ELSE round(COALESCE(pi.hours_used,0::numeric)
                       / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0), 4)
       END AS hours_pct_used,
       COALESCE(sa.stages_total,0)    AS stages_total,
       COALESCE(sa.stages_complete,0) AS stages_complete,
       sa.current_stage_sortorder,
       COALESCE(ta.open_tasks,0)    AS open_tasks,
       COALESCE(ta.overdue_tasks,0) AS overdue_tasks,
       mra.last_activity_at,
       pn.pinned_note_title, pn.pinned_note_text,
       pn.pinned_note_priority, pn.pinned_note_updated_at,
       CASE
         WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL
         WHEN lower(COALESCE(pn.pinned_note_text,'')||' '||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'hold'
         WHEN lower(COALESCE(pn.pinned_note_text,'')||' '||COALESCE(pn.pinned_note_title,'')) ~ '(urgent|overdue)' THEN 'urgent'
         ELSE 'info'
       END AS pinned_note_severity,
       CASE
         WHEN pn.pinned_note_text IS NOT NULL
              AND lower(COALESCE(pn.pinned_note_text,'')||' '||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'on_hold'
         WHEN pi.is_complete = true THEN 'complete'
         WHEN mra.last_activity_at < (now() - interval '30 days')
              OR ((COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0)+COALESCE(cp.carried_in_minutes,0)/60.0) > 0
                  AND (COALESCE(pi.hours_used,0::numeric)
                       / (COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0)+COALESCE(cp.carried_in_minutes,0)/60.0)) >= 0.95) THEN 'stuck'
         WHEN mra.last_activity_at < (now() - interval '14 days')
              OR ((COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0)+COALESCE(cp.carried_in_minutes,0)/60.0) > 0
                  AND (COALESCE(pi.hours_used,0::numeric)
                       / (COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0)+COALESCE(cp.carried_in_minutes,0)/60.0)) >= 0.75)
              OR COALESCE(ta.overdue_tasks,0) > 0 THEN 'drifting'
         ELSE 'on_track'
       END AS status_pill,
       cs.shortname AS current_stage_shortname
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
  LEFT JOIN current_stage cs ON cs.packageinstance_id = pi.id
  LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
  LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
  LEFT JOIN pinned pn ON pn.package_instance_id = pi.id
  LEFT JOIN current_period cp ON cp.package_instance_id = pi.id
  LEFT JOIN most_recent_activity mra ON mra.package_instance_id = pi.id;

CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id bigint,
  p_package_instance_id bigint DEFAULT NULL
)
RETURNS TABLE(
  package_instance_id bigint, tenant_id bigint, package_name text, package_type text,
  progress_mode text, manager_id uuid, is_complete boolean, start_date date, end_date date,
  hours_included integer, hours_added integer, hours_total numeric, hours_used numeric,
  hours_remaining numeric, hours_pct_used numeric, stages_total integer, stages_complete integer,
  current_stage_sortorder integer, open_tasks integer, overdue_tasks integer,
  last_activity_at timestamptz, pinned_note_title text, pinned_note_text text,
  pinned_note_priority text, pinned_note_updated_at timestamptz, pinned_note_severity text,
  status_pill text, current_stage_shortname text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = 'off'
AS $function$
  WITH allowed_packages AS (
    SELECT pi.*
      FROM public.package_instances pi
     WHERE pi.tenant_id = p_tenant_id
       AND (p_package_instance_id IS NULL OR pi.id = p_package_instance_id)
       AND app.user_can_access_tenant(p_tenant_id)
  ),
  stage_agg AS (
    SELECT si.packageinstance_id AS package_instance_id,
           count(*)::integer AS stages_total,
           count(*) FILTER (WHERE si.status IN ('completed','core_complete','na'))::integer AS stages_complete,
           min(si.stage_sortorder) FILTER (WHERE si.status NOT IN ('completed','core_complete','na')) AS current_stage_sortorder,
           max(si.updated_at) AS stage_last_updated
      FROM public.stage_instances si
      JOIN public.stages s ON s.id = si.stage_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND COALESCE(s.is_audit_workspace, false) = false
       AND COALESCE(s.is_archived, false) = false
     GROUP BY si.packageinstance_id
  ),
  current_stage AS (
    SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
           COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''), s.name) AS shortname
      FROM public.stage_instances si
      JOIN public.stages s ON s.id = si.stage_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND si.status NOT IN ('completed','core_complete','na')
       AND COALESCE(s.is_archived, false) = false
       AND COALESCE(s.is_audit_workspace, false) = false
     ORDER BY si.packageinstance_id, si.stage_sortorder
  ),
  action_items_agg AS (
    SELECT cai.package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
           max(cai.updated_at) AS last_updated
      FROM public.client_action_items cai
     WHERE cai.package_instance_id IN (SELECT id FROM allowed_packages)
       AND cai.completed_at IS NULL
       AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     GROUP BY cai.package_instance_id
  ),
  tasks_agg AS (
    SELECT a.package_instance_id,
           COALESCE(a.open_count,0)    AS open_tasks,
           COALESCE(a.overdue_count,0) AS overdue_tasks,
           a.last_updated              AS tasks_last_updated
      FROM action_items_agg a
  ),
  notes_agg AS (
    SELECT n.parent_id AS package_instance_id,
           max(n.updated_at) AS notes_last_updated
      FROM public.notes n
     WHERE n.parent_type = 'package_instance'
       AND n.parent_id IS NOT NULL
       AND n.tenant_id = p_tenant_id
     GROUP BY n.parent_id
  ),
  pinned AS (
    SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
           n.title         AS pinned_note_title,
           n.note_details  AS pinned_note_text,
           n.priority      AS pinned_note_priority,
           n.updated_at    AS pinned_note_updated_at
      FROM public.notes n
     WHERE n.parent_type = 'package_instance'
       AND n.is_pinned = true
       AND n.parent_id IS NOT NULL
       AND n.tenant_id = p_tenant_id
     ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
  ),
  hours_agg AS (
    SELECT te.package_instance_id,
           max(te.start_at) AS max_te_at
      FROM public.time_entries te
      JOIN allowed_packages ap ON ap.id = te.package_instance_id
     WHERE te.duration_minutes IS NOT NULL
       AND te.duration_minutes > 0
       AND te.is_billable = true
     GROUP BY te.package_instance_id
  ),
  current_period AS (
    SELECT DISTINCT ON (prp.package_instance_id) prp.package_instance_id, prp.carried_in_minutes
      FROM public.package_renewal_periods prp
     WHERE prp.package_instance_id IN (SELECT id FROM allowed_packages)
       AND prp.closed_at IS NULL
     ORDER BY prp.package_instance_id, prp.period_number DESC
  ),
  most_recent_activity AS (
    SELECT pi.id AS package_instance_id,
           COALESCE(GREATEST(na.notes_last_updated, sa.stage_last_updated,
                             ta.tasks_last_updated, ha.max_te_at),
                    pi.start_date::timestamptz) AS last_activity_at
      FROM allowed_packages pi
      LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
      LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
      LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
      LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  )
  SELECT pi.id AS package_instance_id,
         pi.tenant_id,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
         p.package_type, p.progress_mode, pi.manager_id, pi.is_complete,
         pi.start_date, pi.end_date,
         COALESCE(pi.hours_included,0) AS hours_included,
         COALESCE(pi.hours_added,0)    AS hours_added,
         (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) AS hours_total,
         COALESCE(pi.hours_used,0::numeric) AS hours_used,
         GREATEST((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)
                  - COALESCE(pi.hours_used,0::numeric), 0::numeric) AS hours_remaining,
         CASE WHEN (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) = 0 THEN 0::numeric
              ELSE round(COALESCE(pi.hours_used,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0), 4)
         END AS hours_pct_used,
         COALESCE(sa.stages_total,0)    AS stages_total,
         COALESCE(sa.stages_complete,0) AS stages_complete,
         sa.current_stage_sortorder,
         COALESCE(ta.open_tasks,0)    AS open_tasks,
         COALESCE(ta.overdue_tasks,0) AS overdue_tasks,
         mra.last_activity_at,
         pn.pinned_note_title, pn.pinned_note_text,
         pn.pinned_note_priority, pn.pinned_note_updated_at,
         CASE
           WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL
           WHEN lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'hold'
           WHEN lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) ~ '(urgent|overdue)' THEN 'urgent'
           ELSE 'info'
         END AS pinned_note_severity,
         CASE
           WHEN pn.pinned_note_text IS NOT NULL
                AND lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'on_hold'
           WHEN pi.is_complete = true THEN 'complete'
           WHEN mra.last_activity_at < (now() - interval '30 days')
                OR ((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) > 0
                    AND (COALESCE(pi.hours_used,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)) >= 0.95) THEN 'stuck'
           WHEN mra.last_activity_at < (now() - interval '14 days')
                OR ((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) > 0
                    AND (COALESCE(pi.hours_used,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)) >= 0.75)
                OR COALESCE(ta.overdue_tasks,0) > 0 THEN 'drifting'
           ELSE 'on_track'
         END AS status_pill,
         cs.shortname AS current_stage_shortname
    FROM allowed_packages pi
    JOIN public.packages p              ON p.id = pi.package_id
    LEFT JOIN stage_agg sa              ON sa.package_instance_id = pi.id
    LEFT JOIN current_stage cs          ON cs.packageinstance_id = pi.id
    LEFT JOIN tasks_agg ta              ON ta.package_instance_id = pi.id
    LEFT JOIN notes_agg na              ON na.package_instance_id = pi.id
    LEFT JOIN pinned pn                 ON pn.package_instance_id = pi.id
    LEFT JOIN current_period cp         ON cp.package_instance_id = pi.id
    LEFT JOIN most_recent_activity mra  ON mra.package_instance_id = pi.id
$function$;

REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated, service_role;

-- ─── 6. v_package_burndown: same window source, plus carry-in credit ────
CREATE OR REPLACE VIEW public.v_package_burndown AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0) AS included_minutes,
  COALESCE(ts.used_minutes, 0) AS used_minutes,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0) - COALESCE(ts.used_minutes, 0) AS remaining_minutes,
  CASE
    WHEN (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0)) = 0 THEN 0::numeric
    ELSE round(COALESCE(ts.used_minutes, 0)::numeric / (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 + COALESCE(cp.carried_in_minutes, 0))::numeric * 100, 1)
  END AS percent_used
FROM public.package_instances pi
LEFT JOIN LATERAL (
  SELECT prp.carried_in_minutes
    FROM public.package_renewal_periods prp
   WHERE prp.package_instance_id = pi.id AND prp.closed_at IS NULL
   ORDER BY prp.period_number DESC
   LIMIT 1
) cp ON true
LEFT JOIN LATERAL (
  SELECT (
    COALESCE((
      SELECT SUM(tea.allocated_minutes)
      FROM public.time_entry_allocations tea
      JOIN public.time_entries te ON te.id = tea.time_entry_id
      WHERE tea.package_instance_id = pi.id
        AND te.is_billable = true
        AND te.work_type <> 'carry_over'
        AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp without time zone, pi.start_date::timestamp without time zone)
        AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + interval '1 year')
    ), 0)
    +
    COALESCE((
      SELECT SUM(te.duration_minutes)
      FROM public.time_entries te
      WHERE te.package_instance_id = pi.id
        AND te.is_billable = true
        AND te.work_type <> 'carry_over'
        AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
        AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp without time zone, pi.start_date::timestamp without time zone)
        AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + interval '1 year')
    ), 0)
  ) AS used_minutes
) ts ON true
WHERE pi.is_complete = false;

SELECT pg_notify('pgrst', 'reload schema');
