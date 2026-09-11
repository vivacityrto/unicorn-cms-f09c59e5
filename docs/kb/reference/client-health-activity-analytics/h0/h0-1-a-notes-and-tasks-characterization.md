# Client Health H0.1-a — notes & tasks current-state characterization (bounded first slice)

> **Parent plan:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md) — §10 H0.1
> **Program index:** [Program Index](../../program-index.md)
> **Status:** delivered 2026-09-11 — read-only static + live characterization, bounded to the two candidate files the Phase 4 exit re-audit surfaced. Not the full H0.1 exit criterion (see "What this does not cover").
> **Owner:** Claude Code
> **Evidence:** AST-based static scan + live Supabase MCP read-only queries against production, `origin/main@debe29ee2`, 2026-09-11
> **Audit entry:** none — read-only static analysis and read-only SQL queries only, no schema/RLS/grant/data change

## Why these two files first

The Phase 4 cross-initiative exit re-audit named `ClientStructuredNotesTab.tsx`
and `TasksManagement.tsx` as Client Health H0 candidates (large files with
tenant-scoped activity/task/note data feeding potential health signals).
H0.1 itself asks for "bounded inventory scripts/queries for the dashboard
graph, status dictionaries, scheduled functions, cron/log outcomes, row
coverage, timestamps, ownership and downstream consumers" across the whole
triage-dashboard system — this packet is the first bounded slice of that,
not the whole thing.

## `ClientStructuredNotesTab.tsx` — data surface (22 call sites, AST-verified)

| Table/function | Purpose in this file |
|---|---|
| `notes` | Core read/write — client structured notes (time entries, general notes) |
| `time_entries` | Linked time-tracking entries for notes |
| `dd_note_types` | Note-type dictionary (9 rows) |
| `dd_note_status` | Note-status dictionary (7 rows — see below) |
| `tenant_users`, `users` | Author/assignee resolution |
| `package_instances`, `packages` | Package context for notes |
| `v_clickup_tasks` (view), `clickup_task_comments` | ClickUp integration surface — tasks/comments synced from ClickUp, tenant-scoped |
| Edge Functions: `extract-note-title`, `fetch-clickup-comments` | AI title extraction; live ClickUp comment fetch |

**`dd_note_status` live values** (id, code, label, sort_order, all
`is_active: true`): `attended`, `not_attended`, `late`, `completed`,
`scheduled`, `abandoned`, `noted`. Seven statuses, all currently active —
no historical/deprecated codes found in this dictionary.

## `TasksManagement.tsx` — data surface (24 call sites, AST-verified)

| Table/function | Purpose in this file |
|---|---|
| `tasks_tenants` | Client-tenant-scoped tasks (read/create/update/delete) |
| `client_action_items` | Staff/client action items (read/create/update) |
| `ops_work_items` | Personal staff work items, owner-scoped (see finding below) |
| `package_instances`, `packages`, `tenants` | Tenant/package context |
| `users` | Assignee/owner resolution |
| `get_valid_vivacity_users` (RPC) | Staff user list for assignment |
| `task-files` (storage bucket) | File attachments |
| `user_notifications` | Notification writes on task events |

## Live row counts (production, 2026-09-11)

| Table | Rows |
|---|---:|
| `notes` | 11,524 |
| `client_action_items` | 198 |
| `tasks_tenants` | 20 |
| `ops_work_items` | **0** |

## Real finding: `ops_work_items` is correctly wired but has zero rows

Confirmed via source (`TasksManagement.tsx` lines 162/503/543) that
`ops_work_items` has a full read/update(with a DB trigger stamping
`completed_at` on transition to `done`)/delete implementation, gated by RLS
(`ops_work_staff_*` policies: `is_vivacity_staff` + `can_access_tenant`).
Confirmed via `pg_proc` search that **no Postgres function writes to this
table** — the only write path is the frontend's own insert (not directly
observed in this file's read-heavy code, but the RLS policy explicitly
permits staff INSERT). The table is scoped to `owner_user_uuid`/
`created_by` — a personal, self-created staff work-item list, not a
system-populated queue.

**Disposition: not a defect, just unused.** Zero rows means no staff member
has created a personal ops work item yet, not that the feature is broken or
orphaned. This distinction matters for H0.1's own exit criterion ("known
defect" vs. genuinely-low-usage current state) — worth stating explicitly
rather than either alarming about it or silently omitting it.

## RLS/authorization boundary summary

| Table | Read | Write |
|---|---|---|
| `notes` | Tenant access (`user_has_tenant_access`) OR staff (`is_super_admin_safe`/`is_vivacity_team_safe`/`has_tenant_access_safe`) | Same, plus `created_by` self-ownership for update/delete |
| `client_action_items` | Staff, OR client self-tenant when `item_type='client'` | Staff-only insert; staff or client-self-tenant update |
| `tasks_tenants` | Client-self-tenant (Client Parent/Child only) OR current-tenant-context OR staff | Staff or current-tenant-context insert/update; **delete is Super-Admin-only** |
| `ops_work_items` | Staff only, tenant-scoped via `can_access_tenant` | Staff only, same scope |

No table here uses a `SECURITY DEFINER` RLS-bypass function the way the
dashboard's own `rpc_portfolio_client_health()` does (per §4 of the parent
plan) — these four tables' authorization boundary is enforced by ordinary
per-row RLS, not a bypass RPC.

## What this does not cover

- The actual triage-dashboard query family (`v_dashboard_attention_ranked`
  and siblings) and its attention-score formula — already documented in the
  plan's own §4, not re-verified against live view definitions here.
- Scheduled functions, cron/log outcomes — no cron job touches any of these
  four tables per the `pg_proc` search run here; a full cron/scheduled-job
  inventory across the whole health system is separate, larger H0.1 scope.
- Synthetic characterization fixtures (high activity/healthy, distressed,
  stalled, missing-sources, future-timestamps) — H0.1's own explicit ask,
  not attempted in this bounded slice.
- `dd_note_types`' actual 9 values (only counted, not enumerated here) and
  any status-domain mapping work — that overlaps H0.2a's scope (task
  status-domain ADR), not H0.1's.
- Marking the July dashboard-health KB conclusions historical/superseded —
  a separate H0.1 action item, not touched by this packet.

## Verification

Read-only static AST scan + read-only Supabase MCP SQL queries; no schema,
RLS, grant, or data change. No code changed, so no lint/typecheck/test
suite applies — this is a documentation-only deliverable.
