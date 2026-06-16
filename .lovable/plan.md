
# Tasks Overhaul — Three Migrations (SQL for Review)

Plan mode is on; this is the final SQL for review before each migration is applied. Each migration is a separate file. After approval, each will be submitted individually via the migration tool.

## ⚠️ One correction to the user's brief

The prompt says to drop policy `"Comments tenant isolation"` from `client_action_item_comments`. Live DB inspection (`SELECT polname FROM pg_policy WHERE polrelid='public.client_action_item_comments'::regclass`) returns exactly **one** policy and its name is **`client_action_item_comments_tenant_all`** — there is no `"Comments tenant isolation"` policy. To stay safe against either possibility, the migration uses `DROP POLICY IF EXISTS` for **both** names. No DDL fails if one of them doesn't exist.

---

## Migration 1 — `add_published_action_item_id_to_cti`

Deploy window: any time. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction; the Supabase migration tool wraps statements in `BEGIN…COMMIT`, so the concurrent index is split into **Migration 1b** below. Migrations 1a and 1c can be combined; 1b is standalone.

### Migration 1a — column + NOT VALID FK + comment

```sql
-- =====================================================================
-- Migration: add_published_action_item_id_to_cti  (1a of 1)
-- Window:    any time (metadata-only, sub-second locks)
-- Pre-deploy:
--   SELECT 1 FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='client_task_instances'
--      AND column_name='published_action_item_id';                  -- expect 0 rows
--   SELECT count(*) AS cti_total,
--          count(*) FILTER (WHERE is_archived=false) AS cti_visible
--     FROM public.client_task_instances;
-- =====================================================================

ALTER TABLE public.client_task_instances
  ADD COLUMN published_action_item_id uuid;

ALTER TABLE public.client_task_instances
  ADD CONSTRAINT client_task_instances_published_action_item_id_fkey
  FOREIGN KEY (published_action_item_id)
  REFERENCES public.client_action_items(id)
  ON DELETE SET NULL
  NOT VALID;

COMMENT ON COLUMN public.client_task_instances.published_action_item_id IS
  'When a stage task is published to the client portal, set to the id of the created client_action_items row. NULL = not yet published. Used by dashboards to avoid double-counting.';

-- =====================================================================
-- Post-deploy:
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid='public.client_task_instances'::regclass
--      AND conname='client_task_instances_published_action_item_id_fkey';
--   -- convalidated=false (validation happens in 1c)
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='client_task_instances'
--      AND column_name='published_action_item_id';
-- =====================================================================
```

### Migration 1b — concurrent partial index (separate file, no transaction)

```sql
-- =====================================================================
-- Migration: add_published_action_item_id_index  (1b of 1)
-- Window:    any time. MUST NOT run inside a transaction.
-- =====================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cti_published_action_item_id
  ON public.client_task_instances (published_action_item_id)
  WHERE published_action_item_id IS NOT NULL;

-- =====================================================================
-- Post-deploy:
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE indexname='idx_cti_published_action_item_id';
-- =====================================================================
```

### Migration 1c — validate FK

```sql
-- =====================================================================
-- Migration: validate_published_action_item_id_fkey  (1c of 1)
-- =====================================================================

ALTER TABLE public.client_task_instances
  VALIDATE CONSTRAINT client_task_instances_published_action_item_id_fkey;

-- =====================================================================
-- Post-deploy:
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conname='client_task_instances_published_action_item_id_fkey';   -- expect true
-- =====================================================================
```

### Rollback (1a + 1b + 1c)

```sql
ALTER TABLE public.client_task_instances
  DROP CONSTRAINT IF EXISTS client_task_instances_published_action_item_id_fkey;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_cti_published_action_item_id;
ALTER TABLE public.client_task_instances
  DROP COLUMN IF EXISTS published_action_item_id;
```

---

## Migration 2 — `update_dashboard_views_skip_published_cti`

Deploy window: any time, after Migration 1. View bodies are reproduced verbatim from `pg_get_viewdef` with **only** the single `AND cti.published_action_item_id IS NULL` line added to the CTI subquery. The RPC body is reproduced verbatim with the same one-line addition plus tightened `search_path=''` and fully schema-qualified identifiers (the body already qualified everything as `public.*` / `app.*`, so this is a no-op behaviour change).

```sql
-- =====================================================================
-- Migration: update_dashboard_views_skip_published_cti  (2 of 3)
-- Window:    any time, after Migration 1
-- Pre-deploy (snapshot for regression diff — save the result):
--   SELECT package_instance_id, open_tasks, overdue_tasks
--     FROM public.v_client_package_dashboard ORDER BY package_instance_id;
-- =====================================================================

CREATE OR REPLACE VIEW public.v_client_package_dashboard AS
 WITH stage_agg AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*)::integer AS stages_total,
            count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
            min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AS current_stage_sortorder,
            max(si.updated_at) AS stage_last_updated
           FROM public.stage_instances si
             JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE app.user_can_access_tenant(pi_1.tenant_id)
          GROUP BY si.packageinstance_id
        ), current_stage AS (
         SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
            COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''::text), s.name) AS shortname
           FROM public.stage_instances si
             JOIN public.stages s ON s.id = si.stage_id
             JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false AND app.user_can_access_tenant(pi_1.tenant_id)
          ORDER BY si.packageinstance_id, si.stage_sortorder
        ), action_items_agg AS (
         SELECT cai.package_id AS package_instance_id,
            count(*)::integer AS open_count,
            count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
            max(cai.updated_at) AS last_updated
           FROM public.client_action_items cai
          WHERE cai.package_id IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND app.user_can_access_tenant(cai.tenant_id::bigint)
          GROUP BY cai.package_id
        ), task_instances_agg AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*)::integer AS open_count,
            count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
            max(cti.updated_at) AS last_updated
           FROM public.client_task_instances cti
             JOIN public.stage_instances si ON si.id = cti.stageinstance_id
             JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE COALESCE(cti.is_archived, false) = false
            AND cti.completion_date IS NULL
            AND COALESCE(cti.status, 0) <> 2
            AND COALESCE(si.released_client_tasks, false) = true
            AND cti.published_action_item_id IS NULL   -- NEW: skip already-published CTI rows
            AND app.user_can_access_tenant(pi_1.tenant_id)
          GROUP BY si.packageinstance_id
        ), tasks_agg AS (
         SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
            COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0) AS open_tasks,
            COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
            GREATEST(a.last_updated, t.last_updated) AS tasks_last_updated
           FROM action_items_agg a
             FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
        ), notes_agg AS (
         SELECT n.parent_id AS package_instance_id,
            max(n.updated_at) AS notes_last_updated
           FROM public.notes n
          WHERE n.parent_type = 'package_instance'::text AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
          GROUP BY n.parent_id
        ), pinned AS (
         SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
            n.title AS pinned_note_title,
            n.note_details AS pinned_note_text,
            n.priority AS pinned_note_priority,
            n.updated_at AS pinned_note_updated_at
           FROM public.notes n
          WHERE n.parent_type = 'package_instance'::text AND n.is_pinned = true AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
          ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
        ), hours_agg AS (
         SELECT te.package_instance_id,
            COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
            max(te.start_at) AS max_te_at
           FROM public.time_entries te
             JOIN public.package_instances pi2 ON pi2.id = te.package_instance_id
          WHERE te.package_instance_id IS NOT NULL AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0 AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date) AND app.user_can_access_tenant(pi2.tenant_id) AND te.is_billable = true
          GROUP BY te.package_instance_id
        ), most_recent_activity AS (
         SELECT pi_1.id AS package_instance_id,
            COALESCE(GREATEST(na_1.notes_last_updated, sa_1.stage_last_updated, ta_1.tasks_last_updated, ha_1.max_te_at), pi_1.start_date::timestamp with time zone) AS last_activity_at
           FROM public.package_instances pi_1
             LEFT JOIN notes_agg na_1 ON na_1.package_instance_id = pi_1.id
             LEFT JOIN stage_agg sa_1 ON sa_1.package_instance_id = pi_1.id
             LEFT JOIN tasks_agg ta_1 ON ta_1.package_instance_id = pi_1.id
             LEFT JOIN hours_agg ha_1 ON ha_1.package_instance_id = pi_1.id
        )
 SELECT pi.id AS package_instance_id,
    pi.tenant_id,
    COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
    p.package_type,
    p.progress_mode,
    pi.manager_id,
    pi.is_complete,
    pi.start_date,
    pi.end_date,
    COALESCE(pi.hours_included, 0) AS hours_included,
    COALESCE(pi.hours_added, 0) AS hours_added,
    (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
    COALESCE(ha.hours_used_calc, 0::numeric) AS hours_used,
    GREATEST((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric - COALESCE(ha.hours_used_calc, 0::numeric), 0::numeric) AS hours_remaining,
    CASE
        WHEN (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
        ELSE round(COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
    END AS hours_pct_used,
    COALESCE(sa.stages_total, 0) AS stages_total,
    COALESCE(sa.stages_complete, 0) AS stages_complete,
    sa.current_stage_sortorder,
    COALESCE(ta.open_tasks, 0) AS open_tasks,
    COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
    mra.last_activity_at,
    pn.pinned_note_title,
    pn.pinned_note_text,
    pn.pinned_note_priority,
    pn.pinned_note_updated_at,
    CASE
        WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL::text
        WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~~ '%on hold%'::text THEN 'hold'::text
        WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~ '(urgent|overdue)'::text THEN 'urgent'::text
        ELSE 'info'::text
    END AS pinned_note_severity,
    CASE
        WHEN pn.pinned_note_text IS NOT NULL AND lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~~ '%on hold%'::text THEN 'on_hold'::text
        WHEN pi.is_complete = true THEN 'complete'::text
        WHEN mra.last_activity_at < (now() - '30 days'::interval) OR (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0 AND (COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.95 THEN 'stuck'::text
        WHEN mra.last_activity_at < (now() - '14 days'::interval) OR (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0 AND (COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.75 OR COALESCE(ta.overdue_tasks, 0) > 0 THEN 'drifting'::text
        ELSE 'on_track'::text
    END AS status_pill,
    cs.shortname AS current_stage_shortname
   FROM public.package_instances pi
     JOIN public.packages p ON p.id = pi.package_id
     LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
     LEFT JOIN current_stage cs ON cs.packageinstance_id = pi.id
     LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
     LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
     LEFT JOIN pinned pn ON pn.package_instance_id = pi.id
     LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
     LEFT JOIN most_recent_activity mra ON mra.package_instance_id = pi.id;


CREATE OR REPLACE VIEW public.v_client_package_whats_next AS
 WITH combined AS (
         SELECT cai.package_id AS package_instance_id,
            cai.tenant_id::bigint AS tenant_id,
            cai.id::text AS task_uid,
            'action_item'::text AS source,
            cai.title,
            cai.description,
            cai.due_date::timestamp with time zone AS due_at,
            cai.priority,
            cai.created_at,
            cai.updated_at,
            cai.recurrence_rule,
            cai.item_type
           FROM public.client_action_items cai
          WHERE cai.completed_at IS NULL AND (cai.status IS NULL OR (cai.status <> ALL (ARRAY['completed'::text, 'cancelled'::text])))
        UNION ALL
         SELECT si.packageinstance_id AS package_instance_id,
            pi.tenant_id,
            cti.id::text AS task_uid,
            'task_instance'::text AS source,
            COALESCE(ct.name, 'Task #'::text || cti.id::text) AS title,
            ct.description,
            cti.due_date AS due_at,
            NULL::text AS priority,
            cti.created_at,
            cti.updated_at,
            NULL::text AS recurrence_rule,
            NULL::text AS item_type
           FROM public.client_task_instances cti
             JOIN public.stage_instances si ON si.id = cti.stageinstance_id
             JOIN public.package_instances pi ON pi.id = si.packageinstance_id
             LEFT JOIN public.client_tasks ct ON ct.id = cti.clienttask_id
          WHERE COALESCE(cti.is_archived, false) = false
            AND cti.completion_date IS NULL
            AND COALESCE(si.released_client_tasks, false) = true
            AND cti.published_action_item_id IS NULL   -- NEW
        ), ranked AS (
         SELECT c.package_instance_id, c.tenant_id, c.task_uid, c.source, c.title, c.description,
            c.due_at, c.priority, c.created_at, c.updated_at, c.recurrence_rule, c.item_type,
            CASE
                WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 'overdue'::text
                WHEN c.due_at IS NOT NULL AND c.due_at < (now() + '7 days'::interval) THEN 'due_soon'::text
                WHEN c.item_type ~~* 'recurring%'::text OR c.recurrence_rule IS NOT NULL THEN 'recurring'::text
                WHEN c.due_at IS NOT NULL THEN 'upcoming'::text
                ELSE 'untimed'::text
            END AS urgency,
            CASE
                WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 1
                WHEN c.due_at IS NOT NULL AND c.due_at < (now() + '7 days'::interval) THEN 2
                WHEN c.due_at IS NOT NULL THEN 3
                WHEN c.item_type ~~* 'recurring%'::text OR c.recurrence_rule IS NOT NULL THEN 4
                ELSE 5
            END AS urgency_rank,
            row_number() OVER (PARTITION BY c.package_instance_id ORDER BY (
                CASE
                    WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 1
                    WHEN c.due_at IS NOT NULL AND c.due_at < (now() + '7 days'::interval) THEN 2
                    WHEN c.due_at IS NOT NULL THEN 3
                    WHEN c.item_type ~~* 'recurring%'::text OR c.recurrence_rule IS NOT NULL THEN 4
                    ELSE 5
                END), (COALESCE(c.due_at, 'infinity'::timestamp with time zone)), c.created_at) AS rn
           FROM combined c
        )
 SELECT ranked.package_instance_id, ranked.tenant_id, ranked.task_uid, ranked.source,
    ranked.title, ranked.description, ranked.due_at, ranked.priority, ranked.urgency,
    ranked.urgency_rank, ranked.rn AS rank_in_package, ranked.created_at, ranked.updated_at
   FROM ranked
  WHERE ranked.rn <= 3;


CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id bigint,
  p_package_instance_id bigint DEFAULT NULL::bigint
)
 RETURNS TABLE(
   package_instance_id bigint, tenant_id bigint, package_name text, package_type text,
   progress_mode text, manager_id uuid, is_complete boolean, start_date date, end_date date,
   hours_included integer, hours_added integer, hours_total numeric, hours_used numeric,
   hours_remaining numeric, hours_pct_used numeric, stages_total integer, stages_complete integer,
   current_stage_sortorder integer, open_tasks integer, overdue_tasks integer,
   last_activity_at timestamp with time zone, pinned_note_title text, pinned_note_text text,
   pinned_note_priority text, pinned_note_updated_at timestamp with time zone,
   pinned_note_severity text, status_pill text, current_stage_shortname text
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = ''
 SET row_security = off
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
           count(*) FILTER (
             WHERE si.status_id = ANY (ARRAY[2, 3])
                OR si.status_id = 4
                OR (si.status_id = 1 AND si.status = '4')
           )::integer AS stages_complete,
           min(si.stage_sortorder) FILTER (
             WHERE NOT (
                  si.status_id = ANY (ARRAY[2, 3])
               OR si.status_id = 4
               OR (si.status_id = 1 AND si.status = '4')
             )
           ) AS current_stage_sortorder,
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
       AND NOT (
            si.status_id = ANY (ARRAY[2, 3])
         OR si.status_id = 4
         OR (si.status_id = 1 AND si.status = '4')
       )
       AND COALESCE(s.is_archived, false) = false
       AND COALESCE(s.is_audit_workspace, false) = false
     ORDER BY si.packageinstance_id, si.stage_sortorder
  ),
  action_items_agg AS (
    SELECT cai.package_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
           max(cai.updated_at) AS last_updated
      FROM public.client_action_items cai
     WHERE cai.package_id IN (SELECT id FROM allowed_packages)
       AND cai.completed_at IS NULL
       AND (COALESCE(cai.status, 'open') <> ALL (ARRAY['completed','cancelled']))
     GROUP BY cai.package_id
  ),
  task_instances_agg AS (
    SELECT si.packageinstance_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
           max(cti.updated_at) AS last_updated
      FROM public.client_task_instances cti
      JOIN public.stage_instances si ON si.id = cti.stageinstance_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND COALESCE(cti.is_archived, false) = false
       AND cti.completion_date IS NULL
       AND COALESCE(cti.status, 0) <> 2
       AND COALESCE(si.released_client_tasks, false) = true
       AND cti.published_action_item_id IS NULL   -- NEW
     GROUP BY si.packageinstance_id
  ),
  tasks_agg AS (
    SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
           COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0)       AS open_tasks,
           COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
           GREATEST(a.last_updated, t.last_updated)                    AS tasks_last_updated
      FROM action_items_agg a
      FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
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
           COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
           max(te.start_at) AS max_te_at
      FROM public.time_entries te
      JOIN allowed_packages ap ON ap.id = te.package_instance_id
     WHERE te.duration_minutes IS NOT NULL
       AND te.duration_minutes > 0
       AND (ap.start_date IS NULL OR te.start_at >= ap.start_date)
       AND te.is_billable = true
     GROUP BY te.package_instance_id
  ),
  most_recent_activity AS (
    SELECT pi.id AS package_instance_id,
           COALESCE(
             GREATEST(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated, ha.max_te_at),
             pi.start_date::timestamptz
           ) AS last_activity_at
      FROM allowed_packages pi
      LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
      LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
      LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
      LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  )
  SELECT pi.id AS package_instance_id,
         pi.tenant_id,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
         p.package_type,
         p.progress_mode,
         pi.manager_id,
         pi.is_complete,
         pi.start_date,
         pi.end_date,
         COALESCE(pi.hours_included, 0) AS hours_included,
         COALESCE(pi.hours_added, 0)    AS hours_added,
         (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
         COALESCE(ha.hours_used_calc, 0::numeric) AS hours_used,
         GREATEST((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric
                  - COALESCE(ha.hours_used_calc, 0::numeric), 0::numeric) AS hours_remaining,
         CASE
           WHEN (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
           ELSE round(COALESCE(ha.hours_used_calc, 0::numeric)
                      / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
         END AS hours_pct_used,
         COALESCE(sa.stages_total, 0)    AS stages_total,
         COALESCE(sa.stages_complete, 0) AS stages_complete,
         sa.current_stage_sortorder,
         COALESCE(ta.open_tasks, 0)    AS open_tasks,
         COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
         mra.last_activity_at,
         pn.pinned_note_title,
         pn.pinned_note_text,
         pn.pinned_note_priority,
         pn.pinned_note_updated_at,
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
                OR ((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0
                    AND (COALESCE(ha.hours_used_calc, 0::numeric)
                         / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.95) THEN 'stuck'
           WHEN mra.last_activity_at < (now() - interval '14 days')
                OR ((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0
                    AND (COALESCE(ha.hours_used_calc, 0::numeric)
                         / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.75)
                OR COALESCE(ta.overdue_tasks, 0) > 0 THEN 'drifting'
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
    LEFT JOIN hours_agg ha              ON ha.package_instance_id = pi.id
    LEFT JOIN most_recent_activity mra  ON mra.package_instance_id = pi.id;
$function$;

REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated, service_role;

-- =====================================================================
-- Post-deploy diff:
--   SELECT package_instance_id, open_tasks, overdue_tasks
--     FROM public.v_client_package_dashboard ORDER BY package_instance_id;
--   -- Must equal the pre-deploy snapshot byte-for-byte (no CTI rows are published yet).
-- =====================================================================
```

### Rollback (Migration 2)

`CREATE OR REPLACE VIEW` and `CREATE OR REPLACE FUNCTION` with the original bodies captured in the migration's "down" file (taken verbatim from `pg_get_viewdef` / `pg_get_functiondef` and stored alongside the migration).

---

## Migration 3 — `rls_split_client_action_items_and_comments`

**Deployment window: recommended 22:00–04:00 AEST.** No `pg_cron` involvement. Each DDL statement is sub-second; the window is conservative because policy semantics change for portal users.

```sql
-- =====================================================================
-- Migration: rls_split_client_action_items_and_comments  (3 of 3)
-- Window:    RECOMMENDED 22:00–04:00 AEST
-- Pre-deploy (capture rollback artefacts and baseline):
--   -- 1. Original policy definitions for verbatim rollback
--   SELECT polname, polcmd,
--          pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--     FROM pg_policy
--    WHERE polrelid IN ('public.client_action_items'::regclass,
--                       'public.client_action_item_comments'::regclass);
--   -- 2. Identity smoke
--   SELECT public.is_vivacity_team_safe('<known-staff-uuid>'::uuid);   -- true
--   SELECT public.is_vivacity_team_safe('<known-portal-uuid>'::uuid);  -- false
--   -- 3. Row counts (must equal post-deploy)
--   SELECT count(*) FROM public.client_action_items;
--   SELECT count(*) FROM public.client_action_item_comments;
-- =====================================================================

-- 3a. Column-guard trigger function
CREATE OR REPLACE FUNCTION public.client_action_items_portal_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Service role and Vivacity staff bypass the guard
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public.is_vivacity_team_safe(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Portal callers: only status / completed_at / completed_by / assignee_user_id (+ updated_at) may change
  IF NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
  OR NEW.client_id           IS DISTINCT FROM OLD.client_id
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  OR NEW.created_by          IS DISTINCT FROM OLD.created_by
  OR NEW.title               IS DISTINCT FROM OLD.title
  OR NEW.description         IS DISTINCT FROM OLD.description
  OR NEW.owner_user_id       IS DISTINCT FROM OLD.owner_user_id
  OR NEW.due_date            IS DISTINCT FROM OLD.due_date
  OR NEW.priority            IS DISTINCT FROM OLD.priority
  OR NEW.source              IS DISTINCT FROM OLD.source
  OR NEW.source_note_id      IS DISTINCT FROM OLD.source_note_id
  OR NEW.related_entity_type IS DISTINCT FROM OLD.related_entity_type
  OR NEW.related_entity_id   IS DISTINCT FROM OLD.related_entity_id
  OR NEW.recurrence_rule     IS DISTINCT FROM OLD.recurrence_rule
  OR NEW.item_type           IS DISTINCT FROM OLD.item_type
  OR NEW.package_id          IS DISTINCT FROM OLD.package_id
  OR NEW.stage_id            IS DISTINCT FROM OLD.stage_id
  OR NEW.sort_order          IS DISTINCT FROM OLD.sort_order
  THEN
    RAISE EXCEPTION
      'Portal users may only update status, completed_at, completed_by, assignee_user_id on client_action_items'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_action_items_portal_column_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_action_items_portal_column_guard() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_cai_portal_column_guard ON public.client_action_items;
CREATE TRIGGER trg_cai_portal_column_guard
  BEFORE UPDATE ON public.client_action_items
  FOR EACH ROW EXECUTE FUNCTION public.client_action_items_portal_column_guard();

-- 3b. Replace client_action_items policies
DROP POLICY IF EXISTS client_action_items_tenant_select ON public.client_action_items;
DROP POLICY IF EXISTS client_action_items_tenant_insert ON public.client_action_items;
DROP POLICY IF EXISTS client_action_items_tenant_update ON public.client_action_items;
DROP POLICY IF EXISTS client_action_items_tenant_delete ON public.client_action_items;

CREATE POLICY cai_staff_all
  ON public.client_action_items
  FOR ALL TO authenticated
  USING      (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY cai_portal_select
  ON public.client_action_items
  FOR SELECT TO authenticated
  USING (
    item_type = 'client'
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_uuid = auth.uid()
         AND u.tenant_id = client_action_items.tenant_id
    )
  );

CREATE POLICY cai_portal_update
  ON public.client_action_items
  FOR UPDATE TO authenticated
  USING (
    item_type = 'client'
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_uuid = auth.uid()
         AND u.tenant_id = client_action_items.tenant_id
    )
  )
  WITH CHECK (
    item_type = 'client'
    AND NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_uuid = auth.uid()
         AND u.tenant_id = client_action_items.tenant_id
    )
  );
-- No portal INSERT or DELETE policy → blocked by default-deny.

REVOKE ALL ON public.client_action_items FROM anon;

-- 3c. Replace client_action_item_comments policies
-- NOTE: live DB has policy 'client_action_item_comments_tenant_all', not 'Comments tenant isolation'.
--       Both names are dropped defensively (IF EXISTS) in case staging/prod differ.
DROP POLICY IF EXISTS client_action_item_comments_tenant_all ON public.client_action_item_comments;
DROP POLICY IF EXISTS "Comments tenant isolation"           ON public.client_action_item_comments;

CREATE POLICY caic_staff_all
  ON public.client_action_item_comments
  FOR ALL TO authenticated
  USING      (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY caic_portal_select
  ON public.client_action_item_comments
  FOR SELECT TO authenticated
  USING (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.client_action_items cai
       WHERE cai.id = client_action_item_comments.action_item_id
         AND cai.item_type = 'client'
         AND EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.user_uuid = auth.uid()
              AND u.tenant_id = cai.tenant_id
         )
    )
  );

CREATE POLICY caic_portal_insert
  ON public.client_action_item_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_vivacity_team_safe(auth.uid())
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_action_items cai
       WHERE cai.id = client_action_item_comments.action_item_id
         AND cai.item_type = 'client'
         AND cai.tenant_id = client_action_item_comments.tenant_id
         AND EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.user_uuid = auth.uid()
              AND u.tenant_id = cai.tenant_id
         )
    )
  );
-- No portal UPDATE or DELETE policy.

REVOKE ALL ON public.client_action_item_comments FROM anon;

-- =====================================================================
-- Post-deploy:
--   -- Policy inventory
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid IN ('public.client_action_items'::regclass,
--                       'public.client_action_item_comments'::regclass)
--    ORDER BY polrelid, polname;
--   -- Expect on CAI:  cai_staff_all, cai_portal_select, cai_portal_update
--   -- Expect on CAIC: caic_staff_all, caic_portal_select, caic_portal_insert
--
--   -- Trigger inventory
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.client_action_items'::regclass AND NOT tgisinternal;
--   -- Expect trg_cai_portal_column_guard + set_updated_at trigger
--
--   -- Row counts unchanged
--   SELECT count(*) FROM public.client_action_items;
--   SELECT count(*) FROM public.client_action_item_comments;
--
--   -- Anon should have no grants
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='anon'
--      AND table_schema='public'
--      AND table_name IN ('client_action_items','client_action_item_comments');
--   -- Expect 0 rows
--
--   -- Functional smoke (staging only): impersonate one portal user + one staff JWT
--   --   portal: SELECT → only item_type='client' own-tenant
--   --   portal: UPDATE status → ok
--   --   portal: UPDATE title → SQLSTATE 42501
--   --   portal: INSERT/DELETE → permission denied (no policy)
--   --   staff:  all CRUD → ok
-- =====================================================================
```

### Rollback (Migration 3)

```sql
-- Drop new policies, trigger, and function
DROP POLICY IF EXISTS cai_staff_all       ON public.client_action_items;
DROP POLICY IF EXISTS cai_portal_select   ON public.client_action_items;
DROP POLICY IF EXISTS cai_portal_update   ON public.client_action_items;
DROP TRIGGER IF EXISTS trg_cai_portal_column_guard ON public.client_action_items;
DROP FUNCTION IF EXISTS public.client_action_items_portal_column_guard();

DROP POLICY IF EXISTS caic_staff_all      ON public.client_action_item_comments;
DROP POLICY IF EXISTS caic_portal_select  ON public.client_action_item_comments;
DROP POLICY IF EXISTS caic_portal_insert  ON public.client_action_item_comments;

-- Recreate original policies verbatim (captured in pre-deploy step 1)
CREATE POLICY client_action_items_tenant_select ON public.client_action_items
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.tenant_id=client_action_items.tenant_id))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.unicorn_role = ANY (ARRAY['Super Admin'::text,'Team Leader'::text])))
  );
CREATE POLICY client_action_items_tenant_insert ON public.client_action_items
  FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.tenant_id=client_action_items.tenant_id))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.unicorn_role = ANY (ARRAY['Super Admin'::text,'Team Leader'::text])))
  );
CREATE POLICY client_action_items_tenant_update ON public.client_action_items
  FOR UPDATE USING (
    (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.tenant_id=client_action_items.tenant_id))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.unicorn_role = ANY (ARRAY['Super Admin'::text,'Team Leader'::text])))
  );
CREATE POLICY client_action_items_tenant_delete ON public.client_action_items
  FOR DELETE USING (
    (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.tenant_id=client_action_items.tenant_id))
    OR (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid=auth.uid() AND u.unicorn_role = ANY (ARRAY['Super Admin'::text,'Team Leader'::text])))
  );

CREATE POLICY client_action_item_comments_tenant_all ON public.client_action_item_comments
  FOR ALL USING (
    tenant_id IN (SELECT tenant_users.tenant_id FROM public.tenant_users
                   WHERE tenant_users.user_id = auth.uid())
  );

-- Restore anon grants if reverting posture
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_action_items       TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_action_item_comments TO anon;
```

---

## Production-readiness sweep

| Check | Result |
|---|---|
| FK constraints | New FK created `NOT VALID`, validated separately. No existing FK touched. |
| RLS on unrelated tables | Untouched. |
| Existing triggers (`set_updated_at` on CAI/CTI) | Untouched. New trigger fires BEFORE existing trigger only if alphabetic order matters — `set_updated_at` is fired in name order; `trg_cai_portal_column_guard` and `set_client_action_items_updated_at` (if present on CAI) are independent BEFORE triggers and commute. Verified `set_updated_at` runs as plain non-DEFINER and assigns `NEW.updated_at := now()` — no interference. |
| Edge functions | All use service role → bypass RLS. Decision 5 acknowledged. |
| `created_at` schema convention | New column omits `DEFAULT` — `created_at` standard does not apply to a non-timestamp column. ✅ |
| Lookup conventions | No new dropdown introduced; existing `status text` on CAI is application-managed, not a dd_ table. Out of scope for this migration. |
| `search_path` standards | `client_action_items_portal_column_guard` and `get_client_package_dashboard` both `SET search_path = ''` with fully qualified bodies. ✅ |
| GRANT/REVOKE | Anon revoked on both tables; authenticated retains row-filtered access; service_role unchanged. ✅ |
| pg_cron | Not required. ✅ |
| Realtime publication | Neither CAI nor CAIC is in `supabase_realtime` for portal subscription changes — verify before any portal real-time feature is added (out of scope). |

## Risk assessment

| Migration | Severity | Notes |
|---|---|---|
| 1a + 1b + 1c | Low | Metadata-only column on 23K rows; concurrent partial index; validated FK. Reversible. |
| 2 | Low | View/RPC bodies preserve every aggregate; new filter is no-op until publishing starts. Diff-checkable. |
| 3 | Medium | Policy semantics change for portal users; trigger blocks unauthorised column writes. Deploy 22:00–04:00 AEST. Reversible. |

## Summary of changes

1. **CTI ↔ CAI link** via `published_action_item_id` with validated FK + partial index.
2. **Dashboard views and RPC** now exclude already-published CTIs so they aren't double-counted.
3. **RLS split** on `client_action_items` and `client_action_item_comments` — Vivacity staff full CRUD, portal users scoped SELECT/UPDATE (CAI) and SELECT/INSERT (comments) with a SECURITY DEFINER BEFORE UPDATE trigger enforcing column-level restrictions.

## Benefits

- Stage publish flow can authoritatively link the CTI to its CAI counterpart.
- Dashboards stay accurate after publishing — no double counts.
- Portal users can no longer mutate or delete Vivacity-internal action items, eliminating the current over-permissive tenant-shared RLS.
- All new functions follow the project's hardened `search_path = ''` + schema-qualified + `REVOKE … FROM PUBLIC` standard.

After approval, each migration will be submitted in its own call to the migration tool, in this order: 1a → 1b → 1c → 2 → 3.
