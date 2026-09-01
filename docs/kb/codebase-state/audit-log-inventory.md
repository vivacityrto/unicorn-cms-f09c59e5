# Audit Log Inventory & Canonical Ledger Gap

> **Last updated:** 2026-09-01 (row counts + table existence re-verified via a live read-only query against `yxkgdalkbrriasiyyrwk`; structural content — schema decisions, Phase 1-3 plan, design decisions — not re-derived, only re-checked) · **Reconsider by:** 2026-12-01 · **Confidence:** high on what's in this pass (existence + row counts, checked directly); the rest carries forward the 13-14 May 2026 verification's confidence. Phases 1, 2, and 3 complete and **`v_workspace_audit_log` is confirmed still live** (checked via `information_schema.views`, since `list_tables` doesn't return views).
>
> **Reflects commit:** `unicorn-cms-f09c59e5@5782860e` (2026-09-01) for this refresh; `<codebase>@a171ca97` (2026-05-13) for the original schema-decision content.
>
> **Priority:** P1 (downgraded from P0 on 13 May 2026). Original P0 classification was based on a mistaken assumption that `audit_log` was the canonical ledger with broken writes. `audit_log` had 0 rows in May and **has since been dropped entirely** (confirmed absent from `information_schema.tables` in this pass) — see the Inactive/excluded table below. The real gap was the absence of a federated view and trigger-based logging — both now shipped and confirmed still live.

---

## What this enables — four scenarios (build order: A → B → C → D)

| Scenario | Description | Prerequisite |
|----------|-------------|--------------|
| **A — Incident lookup** | Client reports something changed. One query in Studio or MCP gives the full cross-module picture. | Phase 2 view |
| **B — Compliance export** | Regulator requests a change log for a client workspace over 12 months. | Phase 2 + fixing no-tenant-id tables |
| **C — Activity dashboard in UI** | Staff or Angela sees "all activity on Client X this week" on the tenant detail page. | Phase 2 + Lovable frontend session |
| **D — Security pattern detection** | Detect unusual patterns — off-hours access, bulk exports, repeated permission denials. | Phase 2 + pg_cron or scheduled query |

---

## Background

Unicorn has approximately **42 tables** with "audit", "log", or "events" in their name. They fall into three distinct categories — only one of which is relevant to the canonical ledger gap.

**Category 1 — RTO compliance audit module (not event logs)**
These tables store the actual RTO audit work delivered to clients: templates, sections, questions, responses, findings, actions. They are domain data, not system event history. Examples: `audit`, `audit_section`, `audit_question`, `audit_response`, `audit_finding`, `audit_action`, `audit_templates`, `reusable_audit_templates`, `audit_intelligence_packs`. Not in scope for this document.

**Category 2 — Domain-specific event log tables**
Operational logs created by Lovable across different modules as features were built. No shared schema contract.

**Category 3 — Security and behaviour event tables**
Tables explicitly tracking who did what at the security and access layer: impersonation sessions, restricted-action attempts, invitation outcomes, access denials.

The gap: none of the tables across Categories 2 and 3 are queryable together. There is no single surface for "what happened to Tenant X this week" or "who changed this record."

---

## Complete event log inventory — live DB state (row counts re-verified 2026-09-01; schema/column details carry forward from the 13-14 May 2026 pass, not re-checked column-by-column in this refresh)

### Active event log tables

| Table | Rows (13-14 May 2026) | Rows (2026-09-01) | `tenant_id` | Type | Actor column | Notes |
|-------|---:|---:|-------------|------|--------------|-------|
| `audit_eos_events` | 2,791 | 7,198 | ✅ | bigint NOT NULL | `user_id` | Most active event log; EOS + invitation flow writes here |
| `audit_dashboard_events` | 2,739 | 3,958 | ✅ | bigint | `actor_user_id` | Staff dashboard interactions |
| `time_entry_audit_log` | 1,286 | 2,310 | ✅ | **integer** ⚠️ | `actor_user_id` | Trigger-based; old/new row capture; `action` CHECK constraint |
| `audit_events` | 1,202 | **447,622** | ❌ | — | `user_id` | **Instrumentation only** — errors, message reads, SharePoint settings noise; not a compliance log. Row count grew ~372x since May; still excluded on the same grounds (no `tenant_id`, not compliance-grade) — that exclusion wasn't re-litigated in this pass, only the count re-verified. |
| `client_audit_log` | 1,125 | 21,268 | ✅ | bigint | `actor_user_id` | AI finding + exec summary draft decisions |
| `audit_client_impersonation` | active | 785 | ✅ | **integer** ⚠️ | `actor_user_id` | Staff-impersonates-client sessions; has `started_at`/`ended_at` |
| `process_audit_log` | active | 36 | ✅ | bigint **NULLABLE** ⚠️ | `actor_user_id` | Process changes; `before_data`/`after_data` jsonb; `tenant_id` nullable |
| `tga_import_audit` | active | 37 | ✅ | bigint | `triggered_by` | TGA import runs per tenant |
| `audit_invites` | active | 2 | ✅ | bigint | `actor_user_id` (text) | Invitation send/accept outcomes; `actor_user_id` is `text` not `uuid` ⚠️ |
| `sharepoint_access_log` | active | 4,336 | ✅ | bigint | `user_id` | SharePoint file access events |
| `document_activity_log` | active | 10,851 | ✅ | bigint | `actor_user_id` | Document view/download/upload with `actor_role` |
| `portal_document_audit` | active | 95 | ✅ | bigint | `actor_user_id` | Portal document actions with `actor_role` |
| `meeting_sync_audit` | active | 0 | ✅ | bigint | `user_id` | Outlook calendar sync results |
| `engagement_audit_log` | active | 0 | ✅ | bigint | `actor_user_uuid` | Package engagement; uses `event_type` not `action` ⚠️ |
| `ai_events` | active | 0 | ✅ | bigint | `actor_user_id` | AI feature performance metrics (latency, confidence, model) |
| `eos_minutes_audit_log` | active | 0 | ✅ | bigint | `user_id` | Governance meeting minutes lifecycle |
| `consultant_assignment_audit_log` | active | 28 | ✅ | bigint | `created_by` (nullable) | Consultant assignment decisions with capacity snapshot |
| `assistant_audit_log` | active | 30 | ✅ | bigint **as `client_tenant_id`** ⚠️ | `viewer_user_id` | AI assistant queries, refusals; column name non-standard |
| `audit_restricted_actions` | active | 0 | ✅ | bigint | `user_id` | Attempted actions the user lacked permission for |
| `consultant_capacity_audit_log` | active | 20 | ✅ | bigint **NULLABLE** ⚠️ | `created_by` (nullable) | Capacity calculation snapshots |
| `audit_user_events` | active | 1,137 | ✅ | bigint NULLABLE | `actor_user_uuid` | Write path wired — triggers on `tenant_users` (user_joined) and `users` (profile_created/updated/deleted) shipped 14 May 2026 |
| `addin_audit_log` | active | 0 | ✅ | bigint NULLABLE | `user_uuid` | M365 add-in surface; created 14 May 2026; federated as 21st branch of `v_workspace_audit_log` |
| `package_builder_audit_log` | active | 4 | ✅ bigint NULLABLE (corrected 2026-09-01 — confirmed present via `information_schema.columns`; the row previously said "MISSING" despite the doc's own Phase 1 section already saying this column was added) | — | `user_id` | Package builder CRUD; `before_data`/`after_data` jsonb. Still excluded from `v_workspace_audit_log` (confirmed via live view definition) — has the column but no federated read path yet. |

**`eos_template_audit_log` — dropped since May, confirmed absent from `information_schema.tables` in this pass.** It was in the "active" list above at the May snapshot. **Confirmed via the live view definition (`pg_get_viewdef`) that `v_workspace_audit_log` no longer references it** — the view is now 20 branches, not 21 (see Phase 2 below, corrected in this pass).

### Inactive / excluded tables

| Table | Rows | Reason for exclusion |
|-------|------|----------------------|
| `audit_log` | **table dropped** (was 0 rows in May) | Unicorn 1.0 legacy (field-level diffs: `field_name`, `old_value`, `new_value`, `editor_name`). Confirmed absent from `information_schema.tables` 2026-09-01 — this one is now fully gone, not just empty. |
| `audit_events` | 447,622 (see Active table above — kept here too since it's excluded, not because it's low-volume) | Application instrumentation noise (error boundaries, profile prompts, message reads). No `tenant_id`. Not a compliance-grade source. |
| `sch_audit_log` | 0 | Scheduling module; uses `org_id uuid` not `tenant_id` — incompatible join key |
| `knowledge_item_audit_log` | 0 | No `tenant_id` |
| `eos_process_audit_log` | 0 | No `tenant_id` |
| `exec_weekly_review_audit_log` | 23 | No `tenant_id` |
| `notification_audit_log` | 0 | No `tenant_id` |
| `research_audit_log` | 32 | No `tenant_id` |
| `document_link_audit` | 0 | No `tenant_id` |
| `document_ai_audit` | 0 | No `tenant_id` |
| `meeting_capture_audit` | 0 | No `tenant_id` |
| `stage_state_audit_log` | 0 | No `tenant_id` |
| `package_instance_state_log` | 55 | No `tenant_id` |
| `strategic_decision_log` | 0 | No `tenant_id` |

---

## Schema inconsistencies (updated — live DB verified)

**Actor column has six different names**
`actor_user_id`, `actor_user_uuid`, `user_id`, `viewer_user_id`, `created_by`, `triggered_by`

**`tenant_id` type inconsistencies**
- `integer`: `time_entry_audit_log`, `audit_client_impersonation` — need `CAST(tenant_id AS bigint)` in the view
- `bigint NULLABLE`: `process_audit_log`, `consultant_capacity_audit_log` — rows with NULL tenant_id exist
- `client_tenant_id` (non-standard column name): `assistant_audit_log`

**Action vs event_type**
`engagement_audit_log` uses `event_type` rather than `action`

**`audit_invites.actor_user_id` is `text` not `uuid`**
Edge function writes the actor UUID as a text string. Cannot directly JOIN to `auth.users(id)` without `::uuid` cast.

**`package_builder_audit_log` has no `tenant_id`**
Cannot be included in the federated view until Phase 1 fix is applied.

---

## The gap — what a canonical ledger would add

Phase 3 (14 May 2026) closed the main gaps. Remaining unlogged:

- `tenant_users` DELETE — `user_left` event not logged (INSERT/join only)
- `tenant_engagement_settings` UPDATE fired but table currently has 0 rows — will populate as features are used
- `package_builder_audit_log` — `tenant_id` column added but no write path yet; excluded from view until tenant-scoped writes exist
- `tenant_settings` (other configuration tables) — still not logged; separate session if needed

---

## Design decisions — confirmed 13 May 2026

| # | Question | Decision |
|---|---|---|
| 1 | **Primary use case?** | **Compliance-grade export** — Option A (central table) is the long-term destination; Option C (federated view) is the first step |
| 2 | **Trigger entities for medium-term?** | `tenant_users`, `users`, `client_audit_responses` + `client_audit_findings`, `tenant_settings` — all four confirmed |
| 3 | **Fix `package_builder_audit_log` now?** | **Yes** — Phase 1 of current session |
| 4 | **Retention policy** | Open — Angela to confirm. 7-year ASQA standard likely applies |
| 5 | **`audit_user_events` — build now?** | Already exists with `tenant_id`. INSERT policy + trigger writes in Phase 3 |

---

## Implementation plan — Option C (hybrid)

### Phase 1 — Fix `package_builder_audit_log` ✅ complete (14 May 2026)

`tenant_id bigint NULLABLE` added. Backfill was not possible — `packages` is a global catalog table with no `tenant_id`; existing rows are SuperAdmin global edits with no tenant context. Table excluded from view until tenant-scoped writes exist.

### Phase 2 — Create `v_workspace_audit_log` ✅ complete (14 May 2026)

`SECURITY INVOKER` view, `service_role` only. Initially 20-branch UNION ALL; extended to 21 branches on the same day when `addin_audit_log` was created. See audit entries `audit-2026-05-14-v-workspace-audit-log` and `audit-2026-05-14-addin-audit-log`. **As of 2026-09-01, confirmed via `pg_get_viewdef` to be back down to 20 branches** — `eos_template_audit_log` (below) was removed from the UNION at some point after its source table was dropped; no other branch changes detected.

`UNION ALL`-ing the following tables (confirmed live via `pg_get_viewdef` 2026-09-01 — this list replaces the May "20 tables plus addin_audit_log as 21st" framing, since one has since dropped out):
`audit_eos_events`, `client_audit_log`, `time_entry_audit_log`, `audit_client_impersonation`, `tga_import_audit`, `sharepoint_access_log`, `document_activity_log`, `portal_document_audit`, `meeting_sync_audit`, `engagement_audit_log`, `ai_events`, `eos_minutes_audit_log`, `consultant_assignment_audit_log`, `assistant_audit_log`, `audit_restricted_actions`, `audit_user_events`, `process_audit_log`, `consultant_capacity_audit_log`, `audit_invites`, `addin_audit_log` (20 total). **Note `audit_dashboard_events` was never in this view** despite appearing in the "active tables" list above — that's consistent with the original May documentation, not a new gap introduced by this pass.

**Straight includes** (bigint tenant_id, standard actor column):
`audit_eos_events`, `client_audit_log`, `tga_import_audit`, `sharepoint_access_log`, `document_activity_log`, `portal_document_audit`, `meeting_sync_audit`, `ai_events`, `eos_minutes_audit_log`, `consultant_assignment_audit_log`, `audit_restricted_actions`, `audit_user_events`, `engagement_audit_log`

**Requires special handling:**
- `time_entry_audit_log` — `CAST(tenant_id AS bigint)`
- `audit_client_impersonation` — `CAST(tenant_id AS bigint)`
- `assistant_audit_log` — `client_tenant_id` aliased as `tenant_id`
- `process_audit_log` — `tenant_id` nullable; include with NULL (platform-level events)
- `consultant_capacity_audit_log` — `tenant_id` nullable; same treatment
- `audit_invites` — `actor_user_id::uuid` cast needed
- `package_builder_audit_log` — include only after Phase 1 is applied

**Excluded from view** (no tenant_id or incompatible schema):
See "Inactive / excluded tables" section above.

Normalised output shape:
```
id uuid, tenant_id bigint, actor_id uuid, action text,
domain text, entity_type text, entity_id text,
old_val jsonb, new_val jsonb, metadata jsonb, created_at timestamptz
```

### Phase 3 — Trigger-based logging ✅ complete (14 May 2026)

Five SECURITY DEFINER trigger functions shipped. All verified — trigger enabled, `search_path=''`, smoke test count=1. See audit entry `audit-2026-05-14-phase3-trigger-logging`.

| Entity | Target | Actions |
|---|---|---|
| `tenant_users` | `audit_user_events` | `user_joined` (INSERT only) |
| `users` | `audit_user_events` | `profile_created`, `profile_updated`, `profile_deleted` |
| `client_audit_responses` | `client_audit_log` | `create`, `update`, `delete` |
| `client_audit_findings` | `client_audit_log` | `create`, `update`, `delete` |
| `tenant_engagement_settings` | `audit_events` | `settings_created`, `settings_updated` |

Note: `tenant_settings` (original plan item) was replaced by `tenant_engagement_settings` — this is the concrete settings table that exists in the DB. `audit_events` has no `tenant_id` column; `tenant_id` is stored in the `details` jsonb for that table.

### Long-term — Central `workspace_audit_log` table (Option A)

When row volumes or compliance export requirements warrant it, migrate to a single append-only table. The federated view (Phase 2) provides the same query interface and makes the migration transparent to consumers.

---

## Current phase status

| Phase | Status |
|-------|--------|
| Phase 1 — `package_builder_audit_log.tenant_id` | ✅ **Complete** — 14 May 2026 |
| Phase 2 — `v_workspace_audit_log` (21 branches at ship; 20 as of 2026-09-01, see note above) | ✅ **Complete** — 14 May 2026 |
| Phase 3 — Trigger logging (5 entities) | ✅ **Complete** — 14 May 2026 |
| Long-term — Option A central table | Deferred |

---

## Related

- [`reference/ai-audit-stack.md`](../reference/ai-audit-stack.md) — AI-specific audit (`client_audit_log` deep dive)
- [`reference/decision-trail.md`](../reference/decision-trail.md) — ADR-005 (RLS), ADR-011 (operating model)
- [`handoffs/lovable-production-db-change.md`](../handoffs/lovable-production-db-change.md) — workflow for Phases 1–3
