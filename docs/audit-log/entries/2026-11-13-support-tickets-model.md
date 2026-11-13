# Audit: 2026-11-13 — support-tickets-model

**Trigger:** Carl's request to overhaul Support Tickets: a simpler model, a reply thread, a message box that turns into a ticket, and one company-wide system for Unicorn, ComplyHub and company issues.
**Scope:** new `support_tickets`, `support_ticket_messages` and `support_ticket_attachments` tables with RPC-only creation, row-level security and triggers; a reconciling backfill of `suggest_items` and Help Centre support threads; a separate cut-over migration; the `support-ticket-ai-draft` Edge Function; and the staff and client frontends. Design, mapping and decisions: [docs/kb/reference/support-tickets-overhaul-2026-11-13.md](../../kb/reference/support-tickets-overhaul-2026-11-13.md).
**Status:** applied to `unicorn-qa` only. **Nothing has been applied to production**, and no Edge Function has been deployed to production. Production needs Carl's separate go-ahead (steps below).

## What was wrong with the old model

- `suggest_items` had 39 columns and six lookup tables for 22 live tickets. Release version, steps to reproduce and expected behaviour were never used; impact and release status were effectively constant; `priority` and `urgency` duplicated each other and disagreed on 8 rows.
- RLS allowed **any user with tenant access to UPDATE any ticket in that tenant** (the `visibility_guard` trigger only protected `is_client_visible`), so a client could change a ticket's status or assignee by id.
- A third overlapping channel existed: the Help Centre "Support" tab wrote `help_threads` straight from the browser (no AI, no thread view for the client, staff replies invisible to them).
- Production edge function `notify-suggestion-submitted` is not called by any repository code.

## What changed

**Database (3 migrations plus 3 rollback files, `supabase/migrations/20261113100000_…`, `…110000_…`, `…120000_…`)**

- `support_tickets` (18 columns): product (`unicorn`, `complyhub_ai`, `company`), tenant, reporter, type (`bug`, `request`, `question`, `other`), status (`new`, `in_progress`, `waiting`, `resolved`, `closed`), urgency, title, assignee, source URL, `external_ref`, `ai_state`, timestamps, soft delete. CHECK constraint: ComplyHub and company tickets may only carry the Vivacity tenant (6372).
- `support_ticket_messages`: immutable thread (`reply`, `event`, `ai_draft`; `staff_only`). Events and AI drafts can only be written by triggers, the RPC or the service role.
- `support_ticket_attachments` plus private bucket `ticket-files`; migrated files stay in their original buckets (a `bucket` column), nothing is moved.
- `create_support_ticket(...)`: the only way to create a ticket (one transaction: ticket with default fields, the reporter's wording verbatim as message 1, staff-only diagnostics, triage notifications). Clients get no INSERT right on tickets.
- RLS: staff see and update everything; Super Admin alone soft-deletes; a reporter sees only their own live Unicorn tickets and only the non-staff-only rows; clients have no UPDATE right. A client reply on a waiting, resolved or closed ticket reopens it through a definer trigger.
- All new functions are `SECURITY DEFINER` with `SET search_path = ''`, schema-qualified, `REVOKE ALL … FROM PUBLIC`, and no grant to `anon`. Table-level grants (not per-column), so a future column cannot recreate the per-column-grant trap.
- Cut-over (`…120000_…`): `suggest_items` and `suggest_attachments` become read-only (this also closes the old UPDATE gap in the interim), the browser can no longer insert `help_threads` / `help_messages`, and `trg_notify_csc_on_support_ticket` is dropped. The chat-bot tab uses the service role through `help-center-chat` and is unaffected. The 252 existing `support_ticket` notifications are untouched.

**Edge Function `support-ticket-ai-draft`.** Client-callable (`verifyAuth`, the same pattern as `ask-viv-assistant-client`), body exactly `{ ticket_id }`, ownership checked server-side, one atomic claim from `ai_state = 'pending'`, model sees only the masked subject and message text, forced tool call with enum-constrained output, runtime allowlists, an 8-second deadline, and a failure path that leaves the ticket with its default fields. Reuses `_shared/anthropic-client.ts` (two optional parameters added: `tool_choice`, `signal`). `ai_interaction_logs` was **not** used: it requires `prompt_text` and `response_text` (NOT NULL), which would store client wording; failures are logged by class only.

**Guardrail housekeeping.** `supabase/migration-safety-allowlist.json`: one already-expired entry removed (it made every migration PR fail the audit), and five reviewed entries added for the new files, expiring 13 December 2026.

## Mapping (what each legacy value becomes)

| Legacy | New |
|---|---|
| status new / triaged / in_progress / blocked / resolved / closed | new / in_progress / in_progress / waiting / resolved / closed |
| type error, functionality_fail | bug |
| type suggestion, improvement, data_enhancement | request |
| type question, other | question, other |
| urgency (the `urgency` column; null or invalid) | same value (medium) |
| support thread (resolved, or open with or without a staff reply) | resolved, in_progress or new; type other; urgency medium; product unicorn |

## QA evidence (unicorn-qa, 13 November 2026)

- **Migrations applied** through the Supabase MCP: model, backfill, cut-over (QA bundles were applied without their header comments; the repository files are canonical).
- **Backfill proven on synthetic legacy rows** (12 tickets covering every status and type, a null urgency, a priority/urgency disagreement, a resolution note, a soft-deleted row, one attachment; 3 support threads including a subject-less one, a staff reply and an attachment with a percent-encoded path; plus a chat-bot thread that must not migrate). First run rolled back (QA confirmed back to zero rows), then applied. **Reconciliation, all 12 checks passed:** 12 + 3 tickets, identical status, type, urgency and tenant distributions, 6 assigned, 1 deleted, 38 messages, 2 attachments, 17 staff-only rows still staff-only, 0 content hash mismatches. Spot checks: the closed row with a null urgency became `closed`/`medium` with a resolved time; the blocked row became `waiting`; the encoded attachment path was decoded; the chat-bot thread was not migrated.
- **41 RLS and behaviour checks passed under the real `authenticated` and `anon` roles** (`supabase/qa-checks/support_tickets_rls_tests.sql`, rolled back, QA left unchanged). They include: client sees only own tickets; cannot read a same-tenant colleague's ticket; cannot update status or assignee (own or other); cannot insert directly; cannot set type, raise a company ticket, or raise in a tenant they are not in; inactive member refused; reporter sees replies but not staff-only rows or the migration event; cannot forge an event, an AI draft, a staff-only note or another author; staff status change sets `resolved_at`, writes a public event and notifies the reporter; assignment event hidden from the reporter; client cannot be assigned; client reply reopens a resolved ticket; team member cannot delete, Super Admin can; `tenant_id` immutable; ComplyHub ticket cannot carry a customer tenant and is invisible to clients; attachment and storage-object visibility follows the ticket; `anon` has no access.
- **Edge Function deployed to QA** (a bundle of the used shared exports). Probed: no token returns 401 at the gateway; the anon key as a bearer returns 401 from `verifyAuth`; CORS preflight 200. Unit tests (32) and the static auth-gate test pass under `npm run test:edge`.
- **`pg_policies` dump** for the three tables and `storage.objects` taken after apply: 12 policies as designed.

## Frontend verification (13 November 2026)

- **Full chain on the branch:** `npm run typecheck` (0 errors), `npm run lint:ratchet` (no regressions), `npm run test:frontend` (1,638 passed, 43 skipped; includes 39 new tests for view and filter logic, sorting, inline assign and status, the reason dialog, empty states, the client message box success and failure paths, and the client thread), `npm run test:edge` (541 passed, including 46 new for the function and the migration shapes), `npm run build`, `node scripts/check-kb-links.mjs`, and the migration safety audit (0 blocking, 37 allowlisted).
- **UI and accessibility pass against a stubbed network, not real data or a real login.** Synthetic, de-identified tickets served to the real components on a local dev server (script and screenshots: `support-tickets-after/` in the session notes folder). axe-core 4.10.2 with WCAG 2.0/2.1 A and AA rules found **0 violations** on the staff list, the open ticket panel and the new-ticket dialog in light and dark, on the 375 px list, and on the client Support list and client message box at desktop width. It found real issues on the first run, now fixed: summary counts used a malformed definition list, outline buttons used the cyan theme colour (below AA on white), and long titles were truncated. 375 px has no horizontal overflow in either theme. The inline Assign control sends a single PATCH carrying only `assignee_id`. The client message box calls `create_support_ticket` and then the AI function with `{ ticket_id }` only, and shows the reference number.
- **Not captured:** the client message box at 375 px (my script opened the navigation drawer instead), the Help Centre Support tab inside the drawer, and a real-session pass of any page.

## Production read-only dry run (13 November 2026; select-only, nothing written)

Legacy counts the backfill will reconcile against: **23 `suggest_items` rows (1 soft-deleted) and 12 support threads, so 35 tickets; 112 messages; 9 attachments (1 + 8 from thread messages).** Statuses closed 9, new 1, resolved 13; mapped types bug 11, request 12; urgency critical 3, high 4, medium 14, low 2; 10 assigned; tenants: 15 staff-raised under the Vivacity tenant and 8 across seven client tenants; 12 support threads in 6 tenants, 9 with a subject, 7 with a staff reply, 11 with diagnostics. 8 rows have a `priority` that differs from `urgency` (urgency wins). **Every reporter, assignee, thread user, message sender and tenant resolves** (0 missing), and all 8 thread attachment URLs match the expected bucket path, so the foreign keys will hold.

## QA fixtures left in place (Carl to decide: keep or clean)

- On `unicorn-qa`: the three migrations, the deployed `support-ticket-ai-draft` function, 12 synthetic legacy tickets, 4 synthetic Help Centre threads (3 support, 1 chat-bot) with 5 messages and 1 attachment row, the resulting 15 migrated tickets with their messages, a QA stand-in tenant `6372` (slug `qa-vivacity-standin`), and reference rows in the five `dd_suggest_*` tables (QA had none). No accounts were created. The tenant `6372` stand-in is needed to raise ComplyHub or company tickets on QA.
- `supabase/qa-checks/support_tickets_legacy_seed_cleanup.sql` removes all of it (not run). The cut-over migration was also applied on QA, so the legacy tables there are read-only for the browser roles.

## Not verified

- **Review fixes made after the QA runs, not yet re-run on QA** (the Supabase tool was disconnected): the update trigger now marks an AI classification reviewed on a staff edit while the draft is pending or drafting; the backfill's field-level reconciliation covers only tickets inserted by the current run; and the delta run re-syncs a ticket edited in the old system after the first import (unchanged in the new system) or stops with the ticket ids when both sides changed. They are covered by static tests only. Before production, re-apply the trigger function to QA and re-run the backfill on the synthetic data, including an edit made to a legacy row after the first run.
- **No real authenticated session was used on QA.** I had no QA persona credentials and created or altered no accounts: creating test accounts needs the user's approval in the session, and the confirmation prompt was declined. RLS is proven at the role and claims level (above), and the UI was checked against a stubbed network. A real-login Playwright pass, and a real call of the deployed function as a user (which would also show whether `ANTHROPIC_API_KEY` is set on QA), are open (see the PR description).
- **`ANTHROPIC_API_KEY` on `unicorn-qa` could not be confirmed** (secrets are not readable through the tools). The function degrades safely (`ai_state = 'failed'`, default fields); the AI path itself is untested end to end.
- Haiku quality on short or vague messages is untested.
- The one rolled-back backfill run on QA advanced the ticket-number sequence (numbers 16 to 30 on QA). Production will not have this gap because its dry run is select-only.
- The legacy attachments are referenced in place; relocating them to `ticket-files` is deferred to the retire step.
- `notify-suggestion-submitted` is unused by repository code; production logs were not checked.

## Production steps (each needs Carl's go-ahead; nothing here has been run)

1. **Preconditions:** this PR approved; confirm `ANTHROPIC_API_KEY` is set on production; read the `notify-suggestion-submitted` logs.
2. **Preflight (read-only):** re-run the dry run above and record the counts.
3. **Apply `…100000_support_tickets_model.sql`** (additive; changes no existing row).
4. **Apply `…110000_support_tickets_backfill.sql`.** Expect 35 tickets, 112 messages, 9 attachments, all 12 reconciliation checks true, ticket numbers 1 to 35. Any mismatch aborts the transaction.
5. **Merge the PR.** The merge deploys `support-ticket-ai-draft` to production and ships the frontend.
6. **Smoke test** as a staff member and as a client (open a ticket, reply, assign, resolve, reopen by reply; client message box shows the confirmation and the ticket appears in the staff list).
7. **Off-peak (22:00 to 04:00 AEST): re-run the backfill as a delta** (idempotent), then **apply `…120000_support_tickets_cutover.sql`**. Postflight: `suggest_items` and `suggest_attachments` have no INSERT/UPDATE/DELETE for `authenticated` or `anon`; `help_threads` / `help_messages` have no INSERT policy; the trigger is gone.
8. **After 30 days, under a separate approval:** drop the legacy tables, triggers and `dd_suggest_*` lookups, relocate the legacy attachment files, and retire `notify-suggestion-submitted`.

## Rollback

- Before cut-over: `rollback/20261113110000_support_tickets_backfill.down.sql` removes exactly the migrated tickets (via the map), then `rollback/20261113100000_support_tickets_model.down.sql` drops the new objects. Legacy tables were never modified and no file was moved, so nothing is lost.
- After cut-over: run `rollback/20261113120000_support_tickets_cutover.down.sql` (re-grants writes and recreates the two policies and the trigger), revert the frontend commit, and copy any ticket raised on the new model back to `suggest_items` first (volume is a handful a month).

## Decisions approved by Carl (13 November 2026)

Client Messages absorbed into tickets; AI draft through the direct Anthropic Haiku client; ComplyHub issues entered by hand now, stored as staff-written issues in Vivacity's database with no ComplyHub customer or tenant data and a link-only reference; `kpi_tickets` untouched; all Vivacity staff see all products for now; statuses `new`, `in_progress`, `waiting`, `resolved`, `closed` (no Triaged or Declined); types `bug`, `request`, `question`, `other`; the reporter sees only their own tickets.

## Follow-ups parked

- `help-center-chat` trusts a body `tenant_id` while using the service client (existing, outside this change).
- `user_notifications` has an `authenticated` INSERT policy; ticket notifications now come from triggers, so no browser-side insert remains for tickets, but the policy itself was not reviewed.
- `kpi_tickets` and `kpi_ticket_comms` remain a separate staff-only developer queue and KPI ledger; "first response time" can later be computed from the new thread.
- Per-product staff access, if ComplyHub-only staff who are not Vivacity employees ever need it.
