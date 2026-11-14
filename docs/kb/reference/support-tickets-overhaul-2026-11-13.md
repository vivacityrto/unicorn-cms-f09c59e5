# Support Tickets overhaul (13 November 2026)

> **Last updated:** 2026-11-13 · **Reconsider by:** 2027-02-13 · **Confidence:** high for the model and RLS (proven on `unicorn-qa`); production not yet applied.
>
> One company-wide ticketing system for Unicorn, ComplyHub and company issues. Standalone feature work, not one of the four tracked initiatives. Evidence, QA results, production steps and rollback: [audit entry](../../audit-log/entries/2026-11-13-support-tickets-model.md).

## What it is

A single `support_tickets` table with a reply thread and attachments replaces `suggest_items` (39 columns, six lookup tables) and the Help Centre "support" channel of `help_threads`. Staff triage in one list at `/support-tickets`. Clients write a plain message (Help Centre Support tab or the client Support Tickets page) and it becomes a ticket; the client portal shows their own tickets and the thread.

## Model

| Table | Purpose |
|---|---|
| `support_tickets` | One row per ticket: product, tenant, reporter, type, status, urgency, title, assignee, source URL, `external_ref`, `ai_state`, timestamps, soft delete |
| `support_ticket_messages` | Immutable thread. `reply` (a person), `event` (trigger or RPC only), `ai_draft` (always staff-only). `staff_only` rows are never visible to the reporter |
| `support_ticket_attachments` | Files, in the private `ticket-files` bucket (migrated files stay in their original buckets) |
| `support_ticket_migration_map` / `_checks` | Rollback key and reconciliation record for the backfill (staff read-only) |

- **Status:** `new`, `in_progress`, `waiting` (on the reporter), `resolved`, `closed` (ended without a fix). "Needs triage" is derived: `new` and unassigned. There is no Triaged or Declined status by design.
- **Type:** `bug`, `request`, `question`, `other`. **Urgency:** `low`, `medium`, `high`, `critical`.
- **Product:** `unicorn`, `complyhub_ai`, `company` (the same vocabulary as `kpi_tickets.platform`).
- **Creation is RPC-only:** `create_support_ticket(...)`. Clients cannot write the tables directly; the function sets default fields, stores the reporter's wording verbatim as message 1, and sends the triage notifications.

## Access (enforced by RLS and triggers, not by the page)

| Action | Vivacity staff | Super Admin | Client reporter | Other client users, academy-only, anon |
|---|---|---|---|---|
| See tickets | all | all | own live Unicorn tickets, while they keep tenant access | none |
| Create | yes | yes | yes, own tenant, Unicorn only, no classification fields | none |
| Change status, urgency, type, title, assignee | yes (assignee must be active staff) | yes | no | none |
| Soft delete or restore | no | yes | no | none |
| Read the thread | all, including staff-only rows | all | replies and public events only | none |
| Reply | public or staff-only | same | public only, own ticket | none |

A client reply on a waiting, resolved or closed ticket reopens it (definer trigger). Assignment events and AI summaries are staff-only; status events are public.

## ComplyHub and company issues

ComplyHub Pty Ltd and Vivacity are separate legal entities and ComplyHub is strictly multi-tenant. `complyhub_ai` and `company` tickets are raised by Vivacity staff by hand, carry the Vivacity tenant (6372, enforced by a CHECK constraint), are never visible to clients, and hold no ComplyHub customer or tenant data: a staff-written description and an optional `external_ref` link only. There is no cross-project query or foreign key. A one-way push from ComplyHub of a de-identified issue is possible later (a shared-secret function calling the same RPC) but is not built and needs Carl's approval.

## AI draft of a client message

`support-ticket-ai-draft` runs after the ticket exists, so a failure never loses a message. It drafts title (only when the client gave no subject), type and urgency, and a staff-only summary. Staff can edit every field; the first staff edit marks the draft reviewed. Details of the guardrails (one-key request allowlist, one atomic claim, masked and capped input, forced tool call, runtime allowlists, 8-second deadline) are in the audit entry and in `supabase/functions/support-ticket-ai-draft/`.

## Routes

Staff: `/support-tickets` (list with a side panel through `?ticket=`), `/support-tickets/:id`, `/support-tickets/new`. Client: `/client/support-tickets`, `/client/support-tickets/:id`. Legacy `/suggestions/*`, `/client/suggestions/*` and `/support-tickets?thread=<id>` redirect and keep the id, because migrated tickets keep their original ids. `/support-tickets` is registered once, in `src/routes/dashboardRoutes.tsx` (an older note saying it was registered twice was stale).

## Retire plan (separate approval, not before 30 days after cut-over)

Drop `suggest_items`, `suggest_attachments`, their three triggers and the `dd_suggest_item_type/status/priority/impact_rating/release_status` lookups (`dd_suggest_category` and the shared dropdown hook stay until nothing else reads them); relocate the legacy attachment files to `ticket-files`; retire `notify-suggestion-submitted`.
