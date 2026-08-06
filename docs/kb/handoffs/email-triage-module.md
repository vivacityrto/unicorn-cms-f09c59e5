# Email Triage Module — Implementation Plan

> **Created:** 17 June 2026 · **Owner:** Carl Simpao · **Status:** Design decisions confirmed — ready for Prompt 2
>
> Source SOP: `email-triage-sop.md` (workspace root)
> DB change protocol: `handoffs/lovable-production-db-change.md`

---

## Overview

Build a new **Email Triage** module in Unicorn CMS that captures inbound emails to support@vivacity.com.au, surfaces them as structured tickets for Ezel (triage), assignees (action), and Nova (queue review), and feeds assigned tickets into the Team Inbox personal work feed.

**What this is NOT:**
- Not the existing "Support Tickets" under CLIENTS (`/support-tickets` — that is `help_threads`, for Unicorn platform help)
- Not the client portal conversations (`tenant_conversations`)
- Not touching `support_requests` (leave for later consolidation)

---

## Confirmed Decisions

| Decision | Choice |
|---|---|
| Module name | **Email Triage** |
| Nav placement | Under **WORK** section in sidebar |
| Route | `/email-triage` |
| Ticket number format | `VIV-YYYY-NNNN` (e.g. VIV-2026-0001) |
| Role-based auto-landing | Skip for v1 — manual tab switch |
| Email intake method | Power Automate (Outlook) → Supabase Edge Function |
| New table | `email_tickets` (new, standalone — does not extend `support_requests`) |
| Team Inbox wiring | Phase 4 — after core module is live |

---

## Audit Findings & Confirmed Design Decisions

> Audit conducted by Lovable (17 June 2026, read-only). All decisions confirmed by Carl.

### Mandatory corrections applied to DDL

| Item | Original | Corrected |
|---|---|---|
| `tenant_id` type | `integer` | `bigint` (matches `tenants.id`) |
| User FK constraints | No cascade | `ON UPDATE CASCADE ON DELETE SET NULL` on all three (`triaged_by`, `assigned_to_user_id`, `closed_by`) |
| `tenant_id` FK delete | `ON DELETE CASCADE` | `ON DELETE SET NULL` — preserve ticket history |
| `updated_at` trigger | New variant | Reuse `public.update_updated_at_column()` |

### Design decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Internal staff roles for RLS | `Super Admin, Team Member, CSC, Integrator, BGT` | `Team Leader` is not a real `unicorn_role`; all listed roles confirmed as internal staff |
| 2 | Category/status/triage_status fields | `dd_*` lookup tables — no inline CHECK constraints | Project convention; allows label changes without migrations |
| 3 | `tenant_id` ON DELETE | `SET NULL` | Preserve ticket history when a tenant is deleted |
| 4 | Edge Function secret header | `x-intake-secret` | Power Automate configured fresh — no existing convention to match |
| 5 | SLA policy source | `dd_email_ticket_sla` lookup table keyed by `(category, urgent)` | Allows Nova/Angela to adjust SLAs without a migration |
| 6 | Audit logging | `audit_events` with `entity_type = 'email_ticket'` | Reuse existing infrastructure; dedicated activity table is parking lot |
| 7 | `closed_by`/`closed_at` consistency | Trigger enforcing `status='closed'` ⟺ `closed_at IS NOT NULL AND closed_by IS NOT NULL` | Data integrity |

### Additional audit findings (apply in build)

- `ticket_number` generation: counter table (`email_ticket_counters(year int PK, last_no int)`) + BEFORE INSERT trigger using UPSERT row lock — concurrency-safe, per-year reset
- SLA breach: pg_cron job every 5 min (`UPDATE ... SET sla_breached = true WHERE ... AND response_due_at < now()`) + BEFORE INSERT trigger to set `response_due_at` from `dd_email_ticket_sla`
- Edge Function: `verify_jwt = false`, constant-time secret comparison (`crypto.timingSafeEqual`), `ON CONFLICT (original_email_id) DO NOTHING`, Zod body validation, strip HTML in `body_preview` to ≤2000 chars
- RLS INSERT: `service_role` only (no authenticated insert path — all inserts via Edge Function)
- All new functions: `SET search_path = ''`, fully schema-qualified, `REVOKE ALL FROM PUBLIC`, explicit grants

---

## Data Model: `email_tickets` (corrected)

### Lookup tables (create first)

```sql
-- Categories
CREATE TABLE public.dd_email_ticket_category (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value      text    NOT NULL UNIQUE,
  label      text    NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);
INSERT INTO public.dd_email_ticket_category (value, label, sort_order) VALUES
  ('lead',    'Lead',    1),
  ('client',  'Client',  2),
  ('tech',    'Tech',    3),
  ('billing', 'Billing', 4),
  ('general', 'General', 5);

-- Triage statuses
CREATE TABLE public.dd_email_ticket_triage_status (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value      text    NOT NULL UNIQUE,
  label      text    NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);
INSERT INTO public.dd_email_ticket_triage_status (value, label, sort_order) VALUES
  ('untriaged', 'Untriaged', 1),
  ('triaged',   'Triaged',   2);

-- Statuses
CREATE TABLE public.dd_email_ticket_status (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value      text    NOT NULL UNIQUE,
  label      text    NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);
INSERT INTO public.dd_email_ticket_status (value, label, sort_order) VALUES
  ('open',        'Open',        1),
  ('in_progress', 'In Progress', 2),
  ('pending',     'Pending',     3),
  ('closed',      'Closed',      4);

-- SLA policies (keyed by category + urgent flag)
CREATE TABLE public.dd_email_ticket_sla (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category       text    NOT NULL,
  urgent         boolean NOT NULL DEFAULT false,
  response_hours numeric NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  UNIQUE (category, urgent)
);
INSERT INTO public.dd_email_ticket_sla (category, urgent, response_hours) VALUES
  ('lead',    false, 8),
  ('client',  false, 4),
  ('tech',    false, 4),
  ('billing', false, 8),
  ('general', false, 8),
  ('lead',    true,  1),
  ('client',  true,  1),
  ('tech',    true,  1),
  ('billing', true,  1),
  ('general', true,  1);

-- Ticket number counter (per year)
CREATE TABLE public.email_ticket_counters (
  year    integer NOT NULL PRIMARY KEY,
  last_no integer NOT NULL DEFAULT 0
);
```

### Main table

```sql
CREATE TABLE public.email_tickets (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number          text        NOT NULL UNIQUE,  -- VIV-YYYY-NNNN (set by trigger)

  -- External sender (no user account required)
  sender_name            text        NOT NULL,
  sender_email           text        NOT NULL,

  -- Optional tenant link (resolved by sender email domain match)
  tenant_id              bigint      NULL REFERENCES public.tenants(id) ON DELETE SET NULL,

  -- SOP category + urgency (values from dd_* tables, no inline CHECKs)
  category               text        NOT NULL DEFAULT 'general',
  urgent                 boolean     NOT NULL DEFAULT false,

  -- Email content
  subject                text        NOT NULL,
  body_preview           text        NULL,           -- stripped, ≤2000 chars
  original_email_id      text        NULL UNIQUE,   -- Message-ID header (dedup)

  -- Triage workflow
  triage_status          text        NOT NULL DEFAULT 'untriaged',
  triaged_by             uuid        NULL REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE SET NULL,
  triaged_at             timestamptz NULL,

  -- Assignment
  assigned_to_user_id    uuid        NULL REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE SET NULL,
  assigned_at            timestamptz NULL,

  -- Status & SLA
  status                 text        NOT NULL DEFAULT 'open',
  response_due_at        timestamptz NULL,   -- set by BEFORE INSERT trigger from dd_email_ticket_sla
  sla_breached           boolean     NOT NULL DEFAULT false,

  -- Acknowledgement
  ack_sent_at            timestamptz NULL,

  -- Resolution
  resolution_notes       text        NULL,
  closed_at              timestamptz NULL,
  closed_by              uuid        NULL REFERENCES public.users(user_uuid) ON UPDATE CASCADE ON DELETE SET NULL,

  -- Timestamps
  received_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
```

### SLA reference (from `dd_email_ticket_sla` seed data)

> Stored as `due_minutes` in the table (not hours). Source of truth for `response_due_at` trigger.
> Lovable's plan had several values wrong — the table below is the corrected authoritative seed.

| category | urgent | due_minutes | Notes |
|---|---|---|---|
| `lead` | true | 60 | 1h — URGENT override |
| `lead` | false | 480 | 8h (same business day) |
| `client` | true | 60 | 1h — URGENT override |
| `client` | false | 240 | 4h |
| `tech` | true | 60 | 1h — URGENT override |
| `tech` | false | 240 | 4h |
| `billing` | true | 60 | 1h — URGENT override |
| `billing` | false | 480 | 8h (same business day) |
| `general` | true | 60 | 1h — URGENT override |
| `general` | false | 1440 | 24h (1 calendar day) |

### Required DB objects

- **`email_ticket_counters`** — counter table for VIV-YYYY-NNNN generation
- **`fn_email_tickets_set_ticket_number`** — BEFORE INSERT trigger function (counter UPSERT, fully qualified, `SET search_path = ''`)
- **`fn_email_tickets_set_response_due_at`** — BEFORE INSERT trigger function (reads `dd_email_ticket_sla`, sets `response_due_at`)
- **`fn_email_tickets_enforce_closed_consistency`** — BEFORE UPDATE trigger (ensures `closed_at`/`closed_by` set when `status='closed'`)
- **`update_updated_at_column`** — reuse existing, attach to `email_tickets`
- **pg_cron job** `email_tickets_flag_sla_breaches` — every 5 min, partial index support
- **RLS policies** — SELECT/UPDATE: internal staff (`unicorn_role IN ('Super Admin','Team Member','CSC','Integrator','BGT')`); INSERT: service_role only; DELETE: Super Admin only
- **Indexes** — `(triage_status, received_at DESC)`, `(assigned_to_user_id, status, received_at DESC)`, `(status, received_at DESC)`, `(category)`, `(tenant_id) WHERE tenant_id IS NOT NULL`, `(sla_breached) WHERE sla_breached = true`

---

## Edge Function: `handle-email-intake`

**Trigger:** POST from Power Automate

**Input payload:**
```json
{
  "from_name": "John Smith",
  "from_email": "john@rto.edu.au",
  "subject": "Compliance Clarity Call enquiry",
  "body_preview": "Hi, I'd like to find out more about...",
  "message_id": "<abc123@outlook.com>",
  "received_at": "2026-06-17T04:30:00Z"
}
```

**Logic:**
1. Check `original_email_id` — if already exists in `email_tickets`, return 200 (dedup, no insert)
2. Look up `tenants` table by `sender_email` domain match → set `tenant_id` if found (otherwise null)
3. Calculate `response_due_at` from category default (`'general'`) — Ezel reassigns category during triage
4. Insert `email_tickets` row with `triage_status: 'untriaged'`
5. Insert into `notification_outbox` to notify Ezel (Teams message)
6. Return `{ ticket_number, id }`

**Security:** Edge Function must verify a shared secret header (`x-intake-secret`) set via Supabase environment variable. Power Automate sends this header with every POST.

---

## Power Automate Flow

> Set up AFTER the Edge Function is deployed and its URL is known.
> Requires support@vivacity.com.au to be a shared mailbox in M365.

**Flow steps:**

1. **Trigger:** "When a new email arrives in a shared mailbox"
   - Mailbox: support@vivacity.com.au
   - Include attachments: No (Phase 1 — attachments deferred)
2. **Condition:** Skip if subject starts with "Re:" AND is a reply to a ticket ack (prevents reply-chains creating new tickets — refine this logic in v2)
3. **Action: HTTP POST** to `handle-email-intake` Edge Function URL
   ```
   Headers: { "x-intake-secret": "<secret>", "Content-Type": "application/json" }
   Body:
   {
     "from_name":    "@{triggerOutputs()?['body/from/name']}",
     "from_email":   "@{triggerOutputs()?['body/from/address']}",
     "subject":      "@{triggerOutputs()?['body/subject']}",
     "body_preview": "@{substring(triggerOutputs()?['body/body/content'], 0, 500)}",
     "message_id":   "@{triggerOutputs()?['body/internetMessageId']}",
     "received_at":  "@{triggerOutputs()?['body/receivedDateTime']}"
   }
   ```
4. **Condition:** If HTTP response is 2xx → end. If 4xx/5xx → send failure alert to carl@complyhub.ai

**Pre-requisite checklist:**
- [ ] Confirm support@vivacity.com.au is a shared mailbox in M365 Admin Centre
- [ ] Grant Power Automate service account access to the shared mailbox
- [ ] Store Edge Function URL + secret in Power Automate connection

---

## Unicorn Module: Email Triage

### Nav entry (under WORK)

```typescript
// DashboardLayout.tsx — workMenuItems array
{ icon: Mail, label: "Email Triage", path: "/email-triage" }
```

### Route

```
/email-triage  →  EmailTriageWrapper  →  EmailTriagePage
```

### Three-tab layout

| Tab | Who uses it | Filter | Columns shown |
|---|---|---|---|
| **Triage Queue** | Ezel, AJ | `triage_status = 'untriaged'` | Received, Sender, Subject, Urgent |
| **All Tickets** | Nova, Angela | All statuses | Ticket #, Category, Assignee, Status, SLA due, Breached |
| **My Tickets** | Beverly, Dave, Carl, Rhald, Khian | `assigned_to_user_id = current user` | Ticket #, Subject, Category, Status, Due |

### Triage action (Triage Queue)

Clicking a row opens a side panel with:
- Sender name + email
- Subject + body preview
- **Category** dropdown (lead / client / tech / billing / general)
- **Urgent** toggle
- **Assign to** user picker (filtered to relevant team members)
- **Triage** button → sets `triage_status = 'triaged'`, stamps `triaged_by` + `triaged_at`, calculates `response_due_at`, moves to All Tickets

### All Tickets view (Nova)

- SLA breached rows highlighted in red
- Urgent rows highlighted in amber / flagged
- Status badge: Open / In Progress / Pending / Closed
- Assignee shown with avatar

### Ticket detail / resolution

From any view, clicking a ticket opens detail panel:
- Full ticket metadata
- **Status** dropdown (open → in_progress → pending → closed)
- **Resolution notes** text area
- **Close ticket** button → sets `closed_at`, `closed_by`, `status = 'closed'`

---

## Team Inbox Integration (Phase 4)

Once the core module ships, extend `rpc_get_inbox_items` to include assigned `email_tickets`:

- New `item_type: 'ticket'` in `InboxItem`
- Filter: `assigned_to_user_id = p_user_id AND status NOT IN ('closed')`
- `action_required = true` when `urgent = true OR sla_breached = true`
- Clicking a ticket item in Team Inbox navigates to `/email-triage?ticket=<id>`

---

## Implementation Phases

> All phases with migrations follow `handoffs/lovable-production-db-change.md`.
> Turn plan mode ON in Lovable before every prompt. Review before approving.

### Phase 1 — Schema (migration)

**Lovable Prompt 1 — Audit (plan mode ON)**

> See prompt template below. Do not proceed to Prompt 2 until audit findings are reviewed.

**Lovable Prompt 2 — Implementation plan (plan mode ON)**

**Lovable Prompt 3 — Migration: supporting objects (plan mode ON)**
- `email_tickets` table
- `ticket_number` sequence + generation function
- `updated_at` trigger
- RLS policies
- Indexes

---

### Phase 2 — Edge Function (Supabase)

**Lovable Prompt 4 — Edge Function (plan mode ON)**
- `handle-email-intake` Edge Function
- Dedup logic
- Tenant email-domain lookup
- `notification_outbox` insert for Ezel
- Secret header validation

---

### Phase 3 — Unicorn UI (Lovable)

**Lovable Prompt 5 — Email Triage module UI (plan mode ON)**
- Nav entry under WORK
- Route + wrapper + page
- Three-tab layout
- Triage Queue + side panel action
- All Tickets table (Nova view)
- My Tickets table

**Lovable Prompt 6 — Ticket detail + resolution (plan mode ON)**
- Detail panel with status update
- Resolution notes + close action
- SLA breach highlighting

---

### Phase 4 — Team Inbox wiring

**Lovable Prompt 7 — rpc_get_inbox_items + email_tickets (plan mode ON)**
- Extend / create the RPC to include assigned `email_tickets`
- Add `ticket` item type to `InboxItem` type + `InboxItemRow` rendering
- Navigation from inbox item → `/email-triage?ticket=<id>`

---

### Phase 5 — Power Automate (external, no Lovable)

- Confirm shared mailbox setup
- Build flow per spec above
- Test with a real email to support@vivacity.com.au
- Verify ticket appears in Triage Queue within 1 min

---

## Lovable Prompt 1 — Audit Template

> Copy this into Lovable with plan mode ON. Do not modify the implementation yet.

---

*We are planning to build a new Email Triage module in Unicorn CMS. Before any code is written, please conduct a read-only audit and produce a findings report.*

*The plan involves:*
*1. A new `email_tickets` table (schema detailed below)*
*2. A Supabase Edge Function `handle-email-intake` (POST from Power Automate)*
*3. A new UI module at `/email-triage` with Triage Queue / All Tickets / My Tickets tabs*
*4. Later: extending `rpc_get_inbox_items` to include assigned email tickets*

*`email_tickets` table design:*
*[paste the table DDL from the Data Model section above]*

*The audit must cover:*
*- Every FK constraint and any impact on `public.tenants`, `public.users`, `auth.users`*
*- RLS policy design — confirm team-only access, no client read path*
*- Index coverage for the query patterns: filter by triage_status, assigned_to_user_id, status, category*
*- The ticket_number generation approach (VIV-YYYY-NNNN sequence) — recommend the safest Postgres implementation*
*- The updated_at trigger — check for conflicts with any existing trigger conventions in this codebase*
*- The SLA breach flag — evaluate whether a trigger or a cron job is more appropriate for auto-flagging `sla_breached`*
*- Edge Function security — confirm the shared secret header pattern is consistent with other edge functions in this codebase*
*- Backward compatibility — confirm this table and its RLS policies do not interfere with `support_requests`, `help_threads`, or `tenant_conversations`*
*- Any naming conflicts with existing tables, types, or RPC functions*

*All new or replaced functions must use `SET search_path = ''` (empty string). All object references in the function body must be fully schema-qualified. `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and explicitly grant only to `authenticated` or `service_role` as appropriate.*

*Please take your time and conduct a thorough deep dive covering every nuance of the codebase and database structures this plan touches. Identify all gaps, improvements, shortcomings, issues, bugs, and conflicts. Ensure the implementation is backward-compatible, audit-complete, and production-ready. Confirm it does not negatively impact any existing functionality, RLS policies, or FK constraints. Finish with a proposed implementation plan in numbered steps, a risk assessment, and a list of anything that needs a design decision before proceeding.*

---

## Parking Lot (deferred)

- Email reply threading — when Ezel replies to a ticket from Unicorn, send via Outlook and thread back to the original email
- Attachment support — emails with PDF/image attachments stored in Supabase storage
- Auto-category suggestion — use sender email domain / subject keywords to pre-suggest a category
- `support_requests` consolidation — evaluate whether `email_tickets` and `support_requests` should merge
- Role-based auto-landing on the correct tab (Ezel → Triage Queue, assignees → My Tickets)
- SLA breach cron job escalation → auto-notify Nova when a ticket breaches

---

## Status Tracker

| Phase | Status | Notes |
|---|---|---|
| Schema design | Complete | Corrected DDL in plan |
| Power Automate spec | Complete | Shared mailbox confirmed ✓ |
| Lovable Prompt 1 (audit) | Complete | Findings reviewed 17 Jun 2026 |
| Design decisions gate | **Complete** | All 7 decisions confirmed |
| Lovable Prompt 2 (impl plan) | Complete | Received 17 Jun 2026 — 2 corrections flagged (SLA seed + missing RPC step) |
| Phase 1 — Migration | **Complete** | Live 17 Jun 2026 — verified: 7 FKs, 10 indexes, 4 policies, RLS on, 10 SLA rows, cron jobid 16 |
| Phase 2 — Edge Function | **Complete** | Live 17 Jun 2026 — 405/401/400/201/200-dup all verified. Hotfix: fn_email_tickets_audit ::text cast removed (entity_id is uuid) |
| Phase 3 — UI (Prompts 5 + 6) | **Complete** | Triage flow + TicketDetailPanel. Save (status/notes), Close Ticket (AlertDialog + DB trigger stamps closed_at/by), My Tickets filters closed rows, SLA highlighting on both tabs |
| Phase 4 — Team Inbox wiring | **Complete** | Live 17 Jun 2026 — ticket in feed (cyan badge, SLA due, unread dot), Tickets filter tab, click → /email-triage?ticket=<id> |
| Phase 5 — Power Automate | **Next** | Shared mailbox confirmed ✓ |
