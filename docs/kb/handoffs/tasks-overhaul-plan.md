# Tasks Feature Overhaul — Implementation Plan

> **Created:** 16 June 2026 · **Status:** ✅ Complete (Phases 1–7 shipped 16–17 June 2026)
>
> Covers the full overhaul of the client portal Tasks feature — unifying stage tasks and action items into a single client-facing model.

---

## Background

Two task systems currently coexist and are disconnected:

- **Stage tasks** (`client_task_instances`) — predefined checklist items attached to a package stage. Hidden from client until `stage_instances.released_client_tasks = true` (all-or-nothing boolean per stage). No assignee.
- **Action items** (`client_action_items`) — free-form tasks created by consultants. Never shown in the client portal (admin/consultant side only). Has `owner_user_id` for Vivacity staff but no client-side assignee.

The client portal `/client/tasks` page only shows stage tasks. Action items are invisible to clients entirely.

---

## Agreed Design Decisions

| Decision | Resolution |
|---|---|
| Unification model | Option B — stage tasks publish as action items. Action item is the client-facing record. |
| Status ownership | Action item owns status after publish. `client_task_instances.status` freezes at publish time. |
| Link between models | `published_action_item_id uuid NULL` on `client_task_instances` → `client_action_items(id)` |
| Client-side assignee | Add `assigned_to_tenant_user_id uuid NULL` to `client_action_items` (separate from `owner_user_id` which stays Vivacity staff) |
| Unassigned visibility | All portal users for the tenant can see all action items |
| Visibility gate | Add `is_visible_to_client boolean NOT NULL DEFAULT true` to `client_action_items` |
| Portal user permissions | Can: update status, add comments, upload attachments, reassign within their team. Cannot: edit title/description/due date/priority, create, delete |
| Existing dashboard views | `v_client_package_dashboard` and `v_client_package_whats_next` must LEFT JOIN to `client_action_items` via `published_action_item_id` to read live status for published tasks |

---

## Phase Overview

| Phase | Description | Migration | DB Protocol | Status |
|---|---|---|---|---|
| 1 | Stage task release UI | No | No | ✅ Done (16 Jun 2026) |
| 2 | Schema changes | Yes | Yes | ✅ Done (16 Jun 2026) |
| 3 | Unified client portal view | No | No | ✅ Done (16 Jun 2026) |
| 4 | Publish flow (RPC + admin UI) | Yes | Yes | ✅ Done (16 Jun 2026) |
| 5 | Legacy deprecation | Yes | Yes | ✅ Done (16 Jun 2026) |

---

## Phase 1 — Stage Task Release UI

**Goal:** Unblock the existing task backlog immediately. No migration risk.

**What to build:**
- "Release tasks to client" button on the admin stage management view
- Shows current release state per stage (released / unreleased)
- On release: `UPDATE stage_instances SET released_client_tasks = true, released_client_tasks_date = now()`
- Include a "Recall" option (set back to false) for safety

**Note:** This is a bridge while Phases 2–4 are built. Phase 4 will replace this toggle with the publish flow.

**Lovable prompt type:** UI only — no migration, no DB protocol needed.

---

## Phase 2 — Schema Changes

**Goal:** Add the columns needed for the unified model and fix the RLS gap.

### `client_task_instances` — add 1 column

```sql
published_action_item_id uuid NULL REFERENCES public.client_action_items(id) ON DELETE SET NULL
```

- `NULL` = task is unreleased (internal only)
- Set = task has been published; action item at that ID is the live client-facing record

### `client_action_items` — add 2 columns

```sql
assigned_to_tenant_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
is_visible_to_client       boolean NOT NULL DEFAULT true
```

- Index: `(tenant_id, assigned_to_tenant_user_id, status)` on `client_action_items`

### RLS rewrite on `client_action_items`

Current RLS is too permissive — portal users can INSERT/UPDATE/DELETE. Must be fixed.

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Vivacity staff (Super Admin / Team Leader) | All items | Yes | All fields | Yes |
| Portal users | `is_visible_to_client = true` items for their tenant | No | `status`, `completed_at`, `completed_by`, `assigned_to_tenant_user_id` only | No |

### RPC update

`rpc_create_action_item` — add `p_assigned_to_tenant_user_id uuid DEFAULT NULL` parameter.

**Lovable prompt type:** Migration + RLS — full DB protocol applies.

---

## Phase 3 — Unified Client Portal View

**Goal:** Client portal shows both legacy tasks and action items in one unified list. Depends on Phase 2.

**`useClientAllTasks` changes:**
- Second query fetching `client_action_items` where `is_visible_to_client = true` for the tenant
- Normalise both into a shared `UnifiedTask` type with a `source` discriminator (`'stage_task' | 'action_item'`)
- Merge and sort together (overdue first, then due soon, then rest)

**Client portal UI (`ClientTasksPage.tsx`):**
- "My Tasks" tab — filtered by `assigned_to_tenant_user_id = current user`
- "All Tasks" tab — all visible items for the tenant
- Inline status update control on action items (portal users only)
- Source badge: stage name (e.g. "Stage 1") for `stage_rule` items, nothing for `manual`
- Assignee column showing tenant user name
- Legacy `client_task_instances` remain read-only in portal (no status update) until Phase 4 replaces them

**Lovable prompt type:** UI only — no migration needed.

---

## Phase 4 — Publish Flow

**Goal:** Replace the Phase 1 boolean toggle with per-task publish. Depends on Phase 2.

### RPC `rpc_publish_stage_tasks`

Parameters: `p_stage_instance_id integer`

Behaviour:
- Reads all `client_task_instances` for the stage
- Creates a `client_action_items` record for each (`source = 'stage_rule'`, `source_task_instance_id` set)
- Sets `published_action_item_id` on each `client_task_instance`
- Idempotent — skips tasks where `published_action_item_id` is already set
- Logs a timeline event per item

### Admin UI

- Replace Phase 1 boolean toggle with a "Publish tasks" panel per stage
- Shows unpublished stage tasks as a checklist
- "Publish selected" and "Publish all" actions
- Published tasks show their current action item status inline (read from `client_action_items` via `published_action_item_id`)

### Dashboard views fix

`v_client_package_dashboard` and `v_client_package_whats_next`:
- LEFT JOIN to `client_action_items` via `published_action_item_id`
- For published tasks: read status from `client_action_items.status`
- For unpublished tasks: fall back to `client_task_instances.status` as before

**Lovable prompt type:** Migration (1 RPC) + UI — full DB protocol applies.

---

## Phase 5 — Legacy Deprecation

**Trigger:** Phase 4 validated in production.

**What shipped:**
- `package_instance_id bigint NULL REFERENCES package_instances(id)` added to `client_action_items` (FK + partial index)
- Existing 4 published action items backfilled with `package_instance_id` via CTI join
- Dashboard views and `get_client_package_dashboard` RPC fixed — now join on `package_instance_id` (not the broken `package_id` template reference)
- `rpc_publish_stage_tasks` updated to populate `package_instance_id`
- `rpc_create_action_item` accepts new optional `p_package_instance_id bigint DEFAULT NULL` parameter
- New staff-gated `rpc_backfill_released_stage_tasks()` — published 127 CTIs across 27 released stages
- `useClientAllTasks` simplified to action-items-only pipeline (legacy CTI branch removed)
- `PackageStagesManager` stripped of Release/Recall UI, dialog, and toggle handler
- `released_client_tasks` column left inert in DB with deprecation COMMENT
- B1 double-timeline bug fixed — removed manual `client_timeline_events` INSERT from `rpc_create_action_item`; trigger handles it

**Phase 6 (partial — shipped 17 June 2026):**
- `package_id` removed from `rpc_publish_stage_tasks` INSERT — `package_instance_id` is now the sole canonical field
- FK `client_action_items.package_id → packages(id)` added and validated (`fk_client_action_items_package_template`)
- `UnifiedTask.source` union narrowed from `'stage_task' | 'action_item'` to `'action_item'`
- Dead `stage_task` branch and `isActionItem`/`getStatusLabel`/`statuses` plumbing removed from `ClientTasksPage`

**Phase 7 (shipped 17 June 2026):**
- `released_client_tasks` and `released_client_tasks_date` dropped from `stage_instances`
- `task_instances_agg` CTE removed from `v_client_package_dashboard` and `get_client_package_dashboard`; `tasks_agg` now reads directly from `action_items_agg`
- CTI UNION ALL branch removed from `v_client_package_whats_next`
- `released_client_tasks*` columns removed from `v_client_package_stages`
- `cti_due_upcoming`, `cti_overdue`, `stages_released_recent` CTEs and legs removed from `v_client_home_feed`
- `stages_released` aggregate and column removed from `v_admin_zero_progress_packages`; `triage_category` pre_release branch simplified to no-completions + no-hours
- `rpc_backfill_released_stage_tasks()` dropped
- Frontend: `use-client-package-stages.ts`, `use-admin-zero-progress-packages.ts`, `AdminZeroProgressPackagesPage.tsx` cleaned up

**Follow-up fix (17 June 2026, migration `20260617022819`):**
- `v_admin_zero_progress_packages.task_counts` CTE updated to use `cai.package_instance_id` — fixes the pre-existing join against the wrong ID space

**Lovable prompt type:** Full DB protocol applied.

---

## Session notes (16 June 2026)

Key findings and deviations discovered during implementation:

- **`tenant_id` / `client_id` on `client_action_items` are both the RTO tenant** — the plan incorrectly assumed `tenant_id` was the Vivacity staff tenant. All existing rows have `tenant_id = client_id::int`. Corrected in Phase 4 audit before the RPC was written.
- **`item_type` ('internal' | 'client') already existed** as the visibility gate — replaced our planned `is_visible_to_client` boolean. `'client'` = portal-visible.
- **`assignee_user_id` already existed** from a prior workboard migration — same role as our planned `assigned_to_tenant_user_id`.
- **Phase 2 Migration 3 comments policy name** — plan had wrong name (`"Comments tenant isolation"`); live DB had `client_action_item_comments_tenant_all`. Handled defensively by dropping both names with `IF EXISTS`.
- **`CREATE INDEX CONCURRENTLY`** was rejected by Supabase migration runner (transaction-wrapped). Used plain `CREATE INDEX` — acceptable for 23K rows.
- **`security_invoker=true`** was reset to false by `CREATE OR REPLACE VIEW` in Phase 2. Fixed with `ALTER VIEW … SET (security_invoker=true)` — a security improvement.
- **Pre-existing bug B1** — `rpc_create_action_item` manually inserts a timeline event AND the `trg_action_item_timeline` trigger fires, producing double timeline events per manual action item create. Flagged in code comment for Phase 5 cleanup.
- **`audit_events` unusable for Phase 4 audit row** — `entity_id uuid NOT NULL` cannot hold a bigint stage_instance_id. Used `client_audit_log` (text `entity_id`) instead.
- **Dashboard double-count fix** — `v_client_package_dashboard`, `v_client_package_whats_next`, and `get_client_package_dashboard` all had `AND cti.published_action_item_id IS NULL` added to the CTI subquery (Phase 2 Migration 2). Without this, published tasks would be counted twice.
- **`package_id` FK mismatch** (Phase 5 finding) — `client_action_items.package_id` had no FK in production (was unconstrained bigint). Dashboard views were comparing template IDs against instance IDs — a silent no-match bug. Fixed in Phase 5 by adding `package_instance_id` and switching dashboard joins.
- **PL/pgSQL loop variable collision** — `rpc_publish_stage_tasks` declared `cti record` as a PL/pgSQL variable AND used `cti` as both the loop variable and SQL table alias. Fixed by renaming loop variable to `r` and removing the explicit declaration.
- **`stage_id` FK violation** — initial publish RPC inserted `stage_id` from `stage_instances.stage_id` which references `stages(id)`, but `client_action_items.stage_id` has a FK to `documents_stages(id)`. Fixed by setting `stage_id = NULL` (relationship preserved via `related_entity_id`).
- **Backfill result** — 127 CTIs across 27 released stages successfully published as action items via `rpc_backfill_released_stage_tasks`.

---

## Key Files

| File | Relevance |
|---|---|
| `src/pages/ClientTasksPage.tsx` | Client portal tasks UI — rewritten in Phase 3 |
| `src/hooks/useClientAllTasks.ts` | Data hook — extended in Phase 3 |
| `src/components/client/ClientActionItemsTab.tsx` | Admin action items UI — updated in Phase 2 (assignee field) |
| `src/components/client/PackageStagesManager.tsx` | Publish + Release/Recall buttons — updated in Phases 1 and 4 |
| `src/hooks/useStageCounts.ts` | Extended in Phase 4 to expose `publishedClientTasks` count |
| `supabase/migrations/20260616024214_*.sql` | `rpc_publish_stage_tasks` — Phase 4 RPC |
| `supabase/migrations/20260616015653_*.sql` | Phase 2 Migration 3 — RLS split + column-guard trigger |
| `supabase/migrations/20260616014229_*.sql` | Phase 2 Migration 1 — `published_action_item_id` column |
| `supabase/migrations/20260616050534_*.sql` | Phase 5 — all migrations A–E bundled (package_instance_id, backfill, RPC updates, dashboard fix, backfill RPC) |
| `supabase/migrations/20260617015409_*.sql` | Phase 6 — `package_id` FK + remove `package_id` write + TypeScript cleanup |
| `supabase/migrations/20260617022252_*.sql` | Phase 7 — drop `released_client_tasks*` columns + rewrite 5 views + `get_client_package_dashboard` + drop backfill RPC |

---

## Cross-references

- DB change protocol: `unicorn-kb/handoffs/lovable-production-db-change.md`
- Module status: `unicorn-kb/codebase-state/module-status.md` (Tasks section)
- Feature matrix: `unicorn-kb/codebase-state/feature-matrix-2026-05-20.md`
