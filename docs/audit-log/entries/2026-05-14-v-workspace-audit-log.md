# Audit: 2026-05-14 — v_workspace_audit_log (federated audit view)

**Trigger:** Lovable production DB change session — P1 canonical audit ledger (Phase 1 + Phase 2 of `unicorn-kb/codebase-state/audit-log-inventory.md`)
**Author:** Carl
**Scope:** Supabase project `yxkgdalkbrriasiyyrwk`. All changes are additive (new column, new indexes, new view). No existing tables, RLS policies, FK constraints, or write paths modified.

---

## Background

The audit log inventory KB doc (`unicorn-kb/codebase-state/audit-log-inventory.md`) was rewritten on 13 May 2026 from a live DB query that revealed ~42 audit-related tables (vs. the 15 previously documented). The doc classified them into three categories: RTO compliance audit module tables (domain data, not logs), domain-specific event log tables, and security/behaviour event tables.

The gap: none of the tenanted event log tables were queryable together. This session ships the federated view that surfaces them as a single cross-module feed.

---

## Findings

- `package_builder_audit_log` had no `tenant_id` column and no FK to `packages`. The original plan to backfill from `packages.tenant_id` was blocked — `packages` is a global catalog table with no `tenant_id`. Decision: add nullable `tenant_id`, no backfill (all 4 existing rows are global SuperAdmin catalog edits). Table excluded from view until tenant-scoped writes are added.
- 12 of the 20 contributing tables lacked a composite `(tenant_id, <ts> DESC)` index — only single-column tenant indexes existed. These were added in Phase 2.
- `audit_events` (1,202 rows, no `tenant_id`) was confirmed as application instrumentation noise — error boundary crashes, message reads, SharePoint settings telemetry. Not included in the view and not suitable as a compliance spine.
- `audit_dashboard_events` (2,739 rows) was confirmed as 95% `dashboard_viewed` telemetry. Excluded from view.
- The 8 domains with 0 rows (`ai`, `document`, `engagement`, `eos_minutes`, `eos_template`, `meeting_sync`, `restricted_action`, `user`) are live tables that will populate as features are used — view compiles correctly across all 20 branches.
- `audit_invites.actor_user_id` is stored as `text` (not uuid). A regex-guarded cast was applied in the view — non-UUID values resolve to NULL rather than erroring.
- `audit_client_impersonation` has no `action` column. A synthetic `'impersonation_started'` literal is used; `ended_at` is packed into the metadata jsonb.
- `assistant_audit_log` uses `client_tenant_id` (non-standard) instead of `tenant_id`.
- `ai_events` uses `ai_event_id` as PK (not `id`) — aliased in the view.
- Initial grant was `authenticated` (all logged-in users). Corrected to `service_role` only — the view is an ops tool, not a client-facing surface.

---

## DB changes shipped

All applied via Lovable migration tool to `yxkgdalkbrriasiyyrwk`:

| Migration | Description |
|---|---|
| `pbal_add_tenant_id` | `ALTER TABLE package_builder_audit_log ADD COLUMN tenant_id bigint NULL` |
| `pbal_tenant_created_index` | `CREATE INDEX idx_pbal_tenant_created ON package_builder_audit_log (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL` |
| `idx_assistant_audit_log_tenant_created` | Composite index on `assistant_audit_log (client_tenant_id, created_at DESC)` |
| `idx_audit_client_impersonation_tenant_started` | Composite index on `audit_client_impersonation (tenant_id, started_at DESC)` |
| `idx_audit_eos_events_tenant_created` | Composite index on `audit_eos_events (tenant_id, created_at DESC)` |
| `idx_audit_invites_tenant_created` | Composite index on `audit_invites (tenant_id, created_at DESC)` |
| `idx_audit_restricted_actions_tenant_created` | Composite index on `audit_restricted_actions (tenant_id, created_at DESC)` |
| `idx_client_audit_log_tenant_created` | Composite index on `client_audit_log (tenant_id, created_at DESC)` |
| `idx_consultant_assignment_audit_log_tenant_created` | Composite index on `consultant_assignment_audit_log (tenant_id, created_at DESC)` |
| `idx_eos_minutes_audit_log_tenant_created` | Composite index on `eos_minutes_audit_log (tenant_id, created_at DESC)` |
| `idx_eos_template_audit_log_tenant_created` | Composite index on `eos_template_audit_log (tenant_id, created_at DESC)` |
| `idx_meeting_sync_audit_tenant_created` | Composite index on `meeting_sync_audit (tenant_id, created_at DESC)` |
| `idx_portal_document_audit_tenant_occurred` | Composite index on `portal_document_audit (tenant_id, occurred_at DESC)` |
| `idx_sharepoint_access_log_tenant_created` | Composite index on `sharepoint_access_log (tenant_id, created_at DESC)` |
| `v_workspace_audit_log` | `CREATE VIEW public.v_workspace_audit_log WITH (security_invoker = true)` — 20-branch UNION ALL |
| `v_workspace_audit_log_service_role` | `REVOKE SELECT FROM authenticated; GRANT SELECT TO service_role` |

**Final verification (live DB):**

```sql
-- Domain row counts
SELECT domain, count(*) FROM v_workspace_audit_log GROUP BY domain ORDER BY row_count DESC;
-- 12 domains with data; 8 zero-row domains included (will populate as features are used)

-- Access control
SELECT
  has_table_privilege('authenticated', 'public.v_workspace_audit_log', 'SELECT'), -- false
  has_table_privilege('service_role',  'public.v_workspace_audit_log', 'SELECT'), -- true
  has_table_privilege('anon',          'public.v_workspace_audit_log', 'SELECT'); -- false

-- security_invoker confirmed
SELECT reloptions FROM pg_class WHERE relname = 'v_workspace_audit_log';
-- {security_invoker=true}
```

---

## View output shape

```
id            uuid
tenant_id     bigint        -- nullable (5 platform-level tables have nullable tenant_id)
actor_id      uuid          -- nullable
action        text
domain        text          -- hardcoded per source table
entity_type   text
entity_id     text
old_val       jsonb
new_val       jsonb
metadata      jsonb
created_at    timestamptz
```

---

## Active domains and source tables

| Domain | Source table | Rows (at deploy) |
|---|---|---|
| `eos_event` | `audit_eos_events` | 2,792 |
| `time_entry` | `time_entry_audit_log` | 1,289 |
| `client` | `client_audit_log` | 1,125 |
| `impersonation` | `audit_client_impersonation` | 225 |
| `sharepoint` | `sharepoint_access_log` | 180 |
| `tga_import` | `tga_import_audit` | 37 |
| `portal_document` | `portal_document_audit` | 37 |
| `process` | `process_audit_log` | 36 |
| `assistant` | `assistant_audit_log` | 28 |
| `consultant_assignment` | `consultant_assignment_audit_log` | 16 |
| `consultant_capacity` | `consultant_capacity_audit_log` | 8 |
| `invite` | `audit_invites` | 2 |
| `ai` | `ai_events` | 0 |
| `document` | `document_activity_log` | 0 |
| `engagement` | `engagement_audit_log` | 0 |
| `eos_minutes` | `eos_minutes_audit_log` | 0 |
| `eos_template` | `eos_template_audit_log` | 0 |
| `meeting_sync` | `meeting_sync_audit` | 0 |
| `restricted_action` | `audit_restricted_actions` | 0 |
| `user` | `audit_user_events` | 0 |

---

## KB changes shipped

- `unicorn-kb @ c570c40`: `codebase-state/audit-log-inventory.md` rewritten from live DB query on 13 May 2026 — complete table inventory, design decisions, Phase 1/2/3 plan. Phase 1 + 2 status updated to "complete" as of this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ a171ca97`: No codebase changes in this session. All DB changes applied via Lovable migration tool directly to Supabase. The view is accessible server-side only — no frontend code queries it yet.

---

## Decisions

- **Option A1 confirmed**: `package_builder_audit_log.tenant_id` added as nullable with no backfill. Table excluded from view. Rationale: `packages` is a global catalog table; existing rows are SuperAdmin global edits with no tenant context.
- **View access**: `service_role` only (not `authenticated`). Rationale: ops tool, not a client-facing surface. Client-facing audit UI (Scenario C) to be exposed via a controlled edge function when built.
- **`audit_events` excluded**: confirmed as instrumentation noise (error boundaries, message reads, SharePoint telemetry). Not a compliance-grade source.
- **`audit_dashboard_events` excluded**: 95% `dashboard_viewed` telemetry. Not an audit event.

---

## Open questions parked

- **Phase 3 (trigger logging)**: `tenant_users`, `users`, `client_audit_responses`, `client_audit_findings`, `tenant_settings` — no write path to any audit table. Separate session required. `audit_user_events` table exists and is in the view; triggers are the remaining work.
- **`package_builder_audit_log` future inclusion**: requires tenant-scoped write paths to be added to the package builder before the column has useful data.
- **`audit_invites` actor_id NULLs**: both existing rows have NULL actor_id due to non-UUID text in `actor_user_id`. Worth investigating whether the invite edge function populates a UUID or a display name — if the latter, the field semantics are wrong upstream.
- **`addin_audit_log` missing table**: 7 components silently failing (`NoteFormDialog.tsx`, `notifyClient.ts`, `ClientActionItemsTab.tsx`, `AddTimeDialog.tsx`, `EditTimeDialog.tsx`, `ClientStructuredNotesTab.tsx`, `CreateActionDialog.tsx`). Self-contained fix — separate session.
- **Scenario C (UI dashboard)**: expose audit feed to staff via a controlled edge function rather than direct table access.

---

## Tag

`audit-2026-05-14-v-workspace-audit-log`
