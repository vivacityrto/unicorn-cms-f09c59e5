# Audit: 2026-08-11 — Xero invoice activity on client Timeline + Client Activity feed

**Trigger:** ad-hoc — Carl asked to check whether the Xero webhook (see the
2026-08-05 audit and its 2026-08-11 addendum) was actually working, then asked
for Xero invoice paid/due activity to show up on the per-client Timeline and
the portfolio-wide Client Activity feed.
**Scope:** One new trigger + CHECK constraint update on `public.tenants` /
`public.client_timeline_events`, applied directly to production Supabase.
Frontend wiring across the shared Timeline component set. No RLS change — the
new event types are covered by the existing `client_timeline_events` policies.

---

## Findings

- **The webhook is live.** Confirmed via `xero-webhook` edge function logs (a
  real 200 today, matched to the second against a lone `tenants` row update
  outside the 6-hourly cron batch) and two more same-signature singleton
  updates earlier the same day. Portal registration + `XERO_WEBHOOK_KEY` were
  evidently completed by Nova sometime after 2026-08-05, with no commit or
  audit entry marking it — addendum added to the original entry.
- **Invoice status changes never reached the Timeline.** `tenants.xero_invoice_paid`/
  `xero_invoice_due_date` are written by three separate paths (`xero-invoice-status`
  manual check, `xero-invoice-sync-all` 6-hourly cron, `xero-webhook`) but none
  of them touched `client_timeline_events`.
- **A naive "on every UPDATE" trigger would have spammed the Timeline.**
  `xero-invoice-sync-all` re-checks and re-writes both cache columns for
  ~135 tenants every 6 hours regardless of whether anything changed. The
  trigger (`fn_xero_invoice_timeline_trigger`, modelled directly on
  `fn_tenant_status_timeline_trigger`) only fires when `OLD` and `NEW` are
  genuinely distinct on either column — verified in a rolled-back transaction
  that a same-value recheck produces zero rows.
- **Client Activity feed needed no separate wiring.** `usePortfolioTimeline.tsx`
  already reads `client_timeline_events` generically with no event-type-specific
  logic, and `ClientActivityFeed.tsx` reuses `ClientTimelineTab`'s
  `FILTER_OPTIONS`/`EVENT_TYPE_FILTERS` and `TimelineEventCard`'s icon/colour
  maps directly — adding the two new event types to those shared maps was
  sufficient for both surfaces at once. Confirmed live via Playwright:
  inserted two test events on **Test RTO A** (a QA tenant, not a real client),
  saw them render correctly on both the client's own Timeline tab (with the
  new "Invoices" filter chip narrowing to exactly those two) and on
  `/client-activity`, then deleted the test rows immediately after.
- **Real bug caught during the date-formatting pass.** `to_char(date, 'FMDD Month YYYY')`
  only suppresses padding on the element immediately following `FM` — the day,
  not the month — so short month names came out padded ("Invoice due 1 August
  &nbsp; &nbsp;2026"). Needed a second `FM` (`'FMDD FMMonth YYYY'`). Caught by
  the rolled-back dry-run before the first real apply, not by manual review.
- **No amounts/numbers/references, per the standing decision.** Event titles
  are "Invoice paid" and "Invoice due <date>" only; metadata carries just the
  due date and previous due date.
- **No backfill.** `xero_invoice_paid`/`due_date` are cache columns overwritten
  in place on every check, not a log — there's no history of past transitions
  to reconstruct, unlike the `tenant_status_changed` and `time_reallocated`
  backfills.

---

## DB changes shipped

Applied directly via Supabase MCP (`yxkgdalkbrriasiyyrwk`, production), also
committed as `supabase/migrations/20260811040000_xero_invoice_timeline_events.sql`:

- `timeline_valid_event_type` CHECK constraint rebuilt from the **live**
  constraint definition (not from an old migration file) to avoid repeating
  the exact drift bug found and fixed in
  [2026-08-10-timeline-event-type-constraint-drift.md](2026-08-10-timeline-event-type-constraint-drift.md) —
  confirmed the new list matches the current live constraint plus the two
  additions (`xero_invoice_paid`, `xero_invoice_issued`).
- New `fn_xero_invoice_timeline_trigger()` + `trg_xero_invoice_timeline` on
  `public.tenants`, firing `AFTER UPDATE OF xero_invoice_paid, xero_invoice_due_date`
  with a `WHEN` guard requiring a genuine change on either column.

Verified with a rolled-back `BEGIN; ... ROLLBACK;` transaction before trusting
it against real data, per the standing dry-run convention: simulated a
paid-flip, a fresh due-date, and a same-value recheck; only the first two
produced rows.

---

## Codebase observations

`unicorn-cms-f09c59e5`, one branch (`hotfix/xero-invoice-timeline-events`),
hand-written hotfix (not Lovable). Worked from a git worktree since other
tool sessions (`.cursor/mcp.json`, `.codex/`) were present in the shared
checkout.

Modified: `src/types/timeline.ts` (new event types, canonical union),
`src/components/client/TimelineEventCard.tsx` (icon/colour maps, module chip,
deep link to `?tab=integrations`), `src/components/client/ClientTimelineTab.tsx`
(new "Invoices" filter chip, staff-only), `src/hooks/useClientManagementData.tsx`
(`EVENT_TYPE_FILTERS.invoices`). New: the migration file. Also updated
`docs/audit-log/entries/2026-08-05-xero-invoice-status-cache-and-sync.md`
with an addendum confirming the webhook is live.

`npx tsc --noEmit` clean (the icon/colour maps are `Record<TimelineEventType, ...>`,
so a missing key would have failed the build). QA performed live via local
dev server + Playwright against production Supabase, using **Test RTO A**
(not a real client) for the temporary test events, deleted immediately after
confirming rendering — Carl caught and redirected before a first draft would
have used a real client (VIVID COLLEGE PTY LTD) for this.

---

## Decisions

- **Trigger lives on `tenants`, not on the edge functions.** Fires for any
  code path that ever updates the cache columns (manual check, cron, webhook,
  or a future path), matching the precedent set by `fn_tenant_status_timeline_trigger`
  and `fn_time_entry_reallocated_timeline_trigger` — DB-level triggers over
  app-level inserts for the same reason both of those chose it.
- **Two event types, not one.** `xero_invoice_paid` (a positive transition)
  and `xero_invoice_issued` (a new outstanding due date) are distinguishable
  states staff would want to filter separately, unlike collapsing both into a
  single "invoice status changed" event.
- **No "overdue" event type.** Overdue is a derived, time-based state
  (`isXeroInvoiceOverdue`) with no corresponding write to trigger off — adding
  one would need a separate polling job, not requested.

---

## Open questions parked

- Same open question as the 2026-08-05 entry: no cache invalidation if
  `xero_contact_url` changes — stale paid/due values would also emit a stale
  Timeline event on the next genuine change. Not actioned here either.

---

## Tag

`audit-2026-08-11-xero-invoice-timeline-events`
