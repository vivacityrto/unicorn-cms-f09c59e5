# Audit: 2026-06-16 — tasks-overhaul

**Trigger:** Lovable production DB change session — Tasks feature overhaul (all phases complete)
**Scope:** All schema, RLS, view, RPC, and UI changes for the client portal Tasks feature unification, including Phase 5 legacy deprecation and bug fixes.

---

## Findings

- Two task models coexisted and were entirely disconnected: `client_task_instances` (legacy, stage-gated) never appeared in the client portal alongside `client_action_items` (admin-side only). The client portal `/client/tasks` page showed only legacy tasks; action items were invisible to clients.
- `client_action_items` RLS was over-permissive: all four policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) allowed any user sharing the same `tenant_id`, meaning portal users (RTO staff) had unintended full CRUD on Vivacity-internal action items.
- `client_action_item_comments` had a single `FOR ALL` policy via `tenant_users` — same conflation of staff and portal access.
- `audit_events.entity_id` is strict `uuid NOT NULL`; cannot hold a bigint `stage_instance_id`. Switched audit row to `client_audit_log` (text `entity_id`, staff-only RLS).
- Pre-existing bug B1: `rpc_create_action_item` manually inserts a `client_timeline_events` row AND the `trg_action_item_timeline` trigger fires on the same INSERT — producing two timeline events per manual action item create. **Fixed in Phase 5** — manual INSERT removed; trigger handles it exclusively.
- `client_action_items.package_id` had no FK in production (unconstrained bigint despite the plan assuming a FK). Dashboard views were comparing template IDs (`packages.id`) against instance IDs (`package_instances.id`) — a silent zero-match bug. Fixed in Phase 5 by adding `package_instance_id` column and switching dashboard joins.
- PL/pgSQL loop variable collision in `rpc_publish_stage_tasks` — `cti record` declared as a variable AND used as SQL alias causing "record not assigned yet" error. Fixed by renaming loop variable to `r`.
- `stage_id` FK violation in publish RPC — `client_action_items.stage_id` references `documents_stages(id)` not `stages(id)`. Fixed by setting `stage_id = NULL` (relationship preserved via `related_entity_id`).
- `client_action_items.tenant_id` is the RTO tenant (not Vivacity staff tenant) — both `tenant_id` and `client_id` refer to the same RTO tenant, one as int and one as text. Plan had this wrong; corrected during Phase 4 audit.
- Dashboard views `v_client_package_dashboard`, `v_client_package_whats_next`, and `get_client_package_dashboard` would double-count tasks once publishing began (CTI counted + CAI counted for the same logical task). Fixed by adding `AND cti.published_action_item_id IS NULL` to CTI subqueries.
- `CREATE INDEX CONCURRENTLY` rejected by Supabase migration runner (transaction-wrapped). Used plain `CREATE INDEX` on a 23K-row table — acceptable lock duration.
- `CREATE OR REPLACE VIEW` reset `security_invoker` to false. Fixed with `ALTER VIEW … SET (security_invoker=true)` on both dashboard views — net security improvement vs prior state.
- Comments policy live name was `client_action_item_comments_tenant_all` (not `"Comments tenant isolation"` as the plan assumed). Handled defensively by dropping both names with `IF EXISTS`.

---

## Migrations shipped (all 16 June 2026, final codebase SHA `b082f30e`)

| Migration timestamp | Purpose |
|---|---|
| `20260616014229` | Phase 2 — `published_action_item_id uuid NULL` + FK (`NOT VALID`) on `client_task_instances` |
| `20260616015253` | Phase 2 — `CREATE INDEX idx_cti_published_action_item_id` (partial) |
| `20260616015444` | Phase 2 — `VALIDATE CONSTRAINT client_task_instances_published_action_item_id_fkey` |
| `20260616015653` | Phase 2 — Views + RPC update (skip published CTIs in dashboard aggregation) + `security_invoker=true` fix |
| `20260616020045` | Phase 2 — `security_invoker=true` lint fix on both views |
| `20260616020318` | Phase 2 — RLS split on `client_action_items` + column-guard trigger + comments policy split |
| `20260616024214` | Phase 4 — `rpc_publish_stage_tasks(integer)` SECURITY DEFINER RPC (initial) |
| `20260616031522` | Phase 4 fix — loop variable rename (`cti` → `r`), `FOR UPDATE OF cti` → `FOR UPDATE` |
| `20260616033237` | Phase 4 fix — remove `stage_id` from publish INSERT (FK mismatch with `documents_stages`) |
| `20260616043557` | Bug fixes — remove manual timeline INSERT from `rpc_create_action_item`; fix priority validation (`normal` → `medium`) |
| `20260616050534` | Phase 5 — `package_instance_id` column + backfill + dashboard fixes + `rpc_backfill_released_stage_tasks`; 127 CTIs published across 27 stages |

---

## KB changes shipped

- `unicorn-kb` @ `cad1908` — `handoffs/tasks-overhaul-plan.md` created (design decisions, 5-phase plan, session notes); `handoffs/README.md` updated with lookup entry

---

## Codebase observations

- `unicorn-cms-f09c59e5` @ `4f937364` — Phase 1 release/recall UI, Phase 3 unified portal view (`useClientAllTasks` extended, `ClientTasksPage` rebuilt with My/All tabs + inline status updates), Phase 4 Publish button in `PackageStagesManager.tsx` + `useStageCounts` extended

---

## Decisions

- **Unification model:** Stage tasks publish as action items (Option B). `client_action_items` is the single client-facing task record. `client_task_instances.published_action_item_id` is the link.
- **Portal user permissions:** SELECT + status UPDATE + reassign `assignee_user_id` + INSERT comments on `item_type='client'` items. No CREATE, no DELETE, no edit of title/description/due date/priority.
- **Staff predicate:** `is_vivacity_team_safe(auth.uid())` used consistently across all new RLS policies and the column-guard trigger — broader than the old `unicorn_role IN ('Super Admin', 'Team Leader')` which was too narrow.
- **Publish mechanism:** `rpc_publish_stage_tasks` — staff-only SECURITY DEFINER, `FOR UPDATE OF cti` for race safety, idempotent via `published_action_item_id IS NULL` check.
- **Audit row:** `client_audit_log` (not `audit_events`) — one row per publish call.
- **Phase 5 (legacy deprecation):** Shipped same session. `useClientAllTasks` simplified to action-items-only. Release/Recall UI removed from `PackageStagesManager`. `released_client_tasks` column left inert with deprecation COMMENT. `package_instance_id` added to `client_action_items`; dashboard joins fixed.

---

## Open questions parked (Phase 6)

- **Drop `released_client_tasks` column** — left inert with deprecation COMMENT. Remove in Phase 6 after confirming no consumers.
- **Drop `package_id` write from `rpc_publish_stage_tasks`** — kept for back-compat in Phase 5. Remove once confirmed no consumers.
- **Add FK on `client_action_items.package_id` → `packages(id)`** — deferred (D3). Column is currently unconstrained bigint.
- **Narrow `UnifiedTask.source` union** — `'stage_task'` variant is now dead code. Remove in Phase 6.

---

## Tag

`audit-2026-06-16-tasks-overhaul`
