# KPI Module — Implementation Plan

> **Created:** 23 June 2026
> **Status:** Implemented — all 7 phases complete. Role assignments applied. See `unicorn-audit/audit/2026-06-23-kpi-module.md`.
> **Spec doc:** UNI-SPEC-KPI-001 v1.0 (approved by Nova and Angela before implementation)
> **Protocol:** Follows `handoffs/lovable-production-db-change.md`

> **⚠ DEPRECATED (confirmed by Carl, 2 July 2026).** This v1 design
> (`kpi_email_log`, `kpi_tasks`, `kpi_tickets`, manual Outlook-based
> logging, served from `/my/kpi` via `MyKpiDashboardPage.tsx`) has been
> superseded in production by a rebuilt "kpi-v2" system
> (`src/lib/kpi-v2/`, `src/components/kpi-v2/`), served from a single
> `/kpi` route (`KpiPage.tsx`) that computes Communication/Retention/Task
> metrics directly from `tenant_messages` and `tenant_csc_assignments`
> instead of manually-logged email/task/ticket rows.
> `/my/kpi` still resolves in `App.tsx` but is deprecated — do not treat
> it as current. `/admin/kpi-review` (referenced below) is **not wired
> up as a route at all**; any link to it is dead.
> No audit entry exists for the v1→v2 rebuild (the
> `2026-06-23-kpi-module.md` audit entry referenced above does not exist
> in `unicorn-audit/`), so the cutover is undocumented — flagged as a
> gap, not yet fixed.
> This file is retained for historical context only. A full
> `codebase-state` regeneration describing kpi-v2 is pending.

---

## Feature Overview

A new performance management module built under the EOS section of Unicorn CMS. Tracks KPIs for three staff groups — CSC Consultants, CST Assistants, and Developers — across email SLA logging, task assignment, ticket management, and formal review sign-off.

---

## New Database Objects Required

### DD (lookup) tables — no FK dependencies, safe to create first

| Table | Values |
|---|---|
| `dd_kpi_role` | csc_consultant, cst_assistant, developer, reviewer |
| `dd_kpi_period_type` | weekly, monthly, quarterly |
| `dd_kpi_task_status` | done_on_time, rectified, delayed, pending |
| `dd_kpi_ticket_status` | received, under_review, in_progress, solved, reopened |
| `dd_kpi_ticket_priority` | critical, high, standard |
| `dd_kpi_ticket_platform` | unicorn_cms, complyhub_ai |
| `dd_kpi_ticket_comm_type` | received_ack, in_progress_notify, reopened_notify, resolved_notify |
| `dd_kpi_metric_status` | on_target, at_risk, below_target |
| `dd_kpi_overall_status` | all_met, mostly_on_track, needs_attention, not_met |

All dd_ tables follow Pattern C convention: `id SERIAL PK, label TEXT, value TEXT UNIQUE, description TEXT, sort_order INT, is_active BOOL, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ`. RLS: authenticated users read, super admin write.

### User profile change

Add `kpi_role TEXT REFERENCES dd_kpi_role(value)` (nullable) to the user profile table (column name TBC after audit confirms the correct table).

### Tenant/client change

Add `churned_at TIMESTAMPTZ` (nullable) to the tenant record table (table name TBC after audit). Populated when a consultant marks a client as churned. Used for CSC KPI 1 (client retention).

### Core data tables

**`kpi_email_log`**
Stores email interactions logged by CSC/CST staff from their Outlook inbox.
- id UUID PK
- user_id UUID → auth.users
- email_type TEXT → dd_ (general_email, client_message)
- outlook_received_message_id TEXT (Outlook message ID for dedup)
- outlook_sent_message_id TEXT (Outlook sent item ID)
- received_at TIMESTAMPTZ (from Outlook, not manual)
- replied_at TIMESTAMPTZ (from Outlook sent item, not manual)
- response_hours NUMERIC (calculated: replied_at - received_at)
- met_sla BOOLEAN (calculated: response_hours <= 12)
- created_at TIMESTAMPTZ

**`kpi_tasks`**
Internally assigned tasks for CST Assistants.
- id UUID PK
- assigned_to UUID → auth.users
- assigned_by UUID → auth.users
- task_name TEXT
- description TEXT (nullable)
- deadline DATE
- status TEXT → dd_kpi_task_status (default: pending)
- completed_at TIMESTAMPTZ (nullable, set when status changes from pending)
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

**`kpi_tickets`**
Developer support tickets for Unicorn CMS and ComplyHub AI.
- id UUID PK
- ticket_number TEXT UNIQUE (auto-generated: UNI-YYYY-NNNN)
- platform TEXT → dd_kpi_ticket_platform
- priority TEXT → dd_kpi_ticket_priority
- subject TEXT
- description TEXT
- assigned_to UUID → auth.users (developer)
- raised_by UUID → auth.users
- status TEXT → dd_kpi_ticket_status (default: received)
- category TEXT (for KPI 4 volume tracking)
- received_at TIMESTAMPTZ (auto: created_at)
- first_response_at TIMESTAMPTZ (nullable, set when first comm touchpoint logged)
- in_progress_at TIMESTAMPTZ (nullable, set when status → in_progress)
- solved_at TIMESTAMPTZ (nullable, set when status → solved)
- reopened_at TIMESTAMPTZ (nullable, set when status → reopened)
- is_project BOOLEAN DEFAULT false (for KPI 6)
- project_deadline DATE (nullable, for KPI 6)
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

**`kpi_ticket_comms`**
The four mandatory communication touchpoints per ticket.
- id UUID PK
- ticket_id UUID → kpi_tickets
- comm_type TEXT → dd_kpi_ticket_comm_type
- sent_at TIMESTAMPTZ
- sent_by UUID → auth.users
- notes TEXT (nullable)
- created_at TIMESTAMPTZ

**`kpi_reviews`**
One record per completed KPI review.
- id UUID PK
- staff_user_id UUID → auth.users
- reviewer_user_id UUID → auth.users
- period_type TEXT → dd_kpi_period_type
- period_start DATE
- period_end DATE
- overall_status TEXT → dd_kpi_overall_status (nullable until computed)
- reviewer_notes TEXT (nullable)
- action_plan TEXT (nullable)
- status TEXT (draft, awaiting_signoff, complete)
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

**`kpi_review_signoffs`**
Three-party digital sign-off per review.
- id UUID PK
- review_id UUID → kpi_reviews
- signatory_user_id UUID → auth.users
- signatory_role TEXT (ceo, operations_manager, staff_member)
- signed_at TIMESTAMPTZ
- created_at TIMESTAMPTZ

---

## Implementation Phases

Follow `handoffs/lovable-production-db-change.md` strictly.

### Phase 1 — DD tables + user profile kpi_role field
New lookup tables only. Low risk. No structural changes to existing tables except adding one nullable column.

### Phase 2 — Core data tables (email log, tasks, tickets, ticket comms)
New tables. No changes to existing tables. Medium risk — RLS policies must be airtight given KPI data is staff-sensitive.

### Phase 3 — Review and sign-off tables
New tables. Depends on Phase 2 (kpi_reviews references kpi_tickets indirectly via staff_user_id).

### Phase 4 — Churn flag on tenant table
Single nullable column addition. Low risk but requires audit of existing tenant queries to confirm no side effects.

### Phase 5 — Outlook email log integration
Extend the existing `capture-outlook-email` edge function or create a new `kpi-log-email` edge function that reuses the existing OAuth token flow. Writes to `kpi_email_log` instead of `email_messages`.

### Phase 6 — UI
EOS module navigation entry. Three role-specific dashboards. Email log UI (reusing OutlookInboxBrowser). Task assignment UI. Ticket management UI. Review and sign-off UI.

### Phase 7 — Verification and sign-off (Dave standard)

---

## Key Existing Objects to Audit Before Implementation

- User/profile table — confirm column name and structure for kpi_role addition
- Tenant table — confirm column name for churned_at addition
- `eos_rocks` — confirm how to query by assigned user for Dev KPI 5
- `stage_health` / Attention Ranking — confirm how CSC KPI 3 pulls data
- `OutlookInboxBrowser` component and `sync-outlook-calendar` edge function — confirm reuse path for email log
- `oauth_tokens` table — confirm delegated token flow for per-user Outlook access
- Existing `dd_staff_role` — confirm it does not conflict with new `dd_kpi_role`
- Existing RLS helper functions (`is_super_admin_safe`) — confirm usage in new RLS policies

---

## Lovable Prompt Sequence

See session notes for the full drafted prompts. Start with Prompt 1 (Audit, plan mode ON).

---

## Audit Entry

Required after deployment. Author: Carl Simpao. Branch: `audit/2026-06-23-kpi-module`. Template: `unicorn-audit/README.md`.
