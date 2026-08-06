# Audit: 2026-05-08 — dashboard-bugs-9-10-11-fix

**Trigger:** ad-hoc — Bugs 9, 10, and 11 from `TobeFixedBugs.md`, all reported by consultants. Also closes the open smoke-test question from `audit-2026-05-07-bug7-bug8-realtime-messaging-client-unread`.
**Scope:** `Dashboard.tsx`, `PortfolioFilterBar.tsx` (Bugs 9 + 10 — display and navigation only), `v_dashboard_tenant_portfolio` DB view (Bug 11 — migration). Bugs 7 and 8 smoke-tested and confirmed working. Did not touch auth, RLS policies, messaging tables, or any other feature area.

## Findings

**Bug 7 smoke test — CONFIRMED RESOLVED (8 May 2026)**

- CSC (AJ) sees new client messages in real-time without a page reload.
- The `tenant_conversations` UPDATE relay introduced in `audit-2026-05-07-bug7-bug8-realtime-messaging-client-unread` is working correctly in production.
- No further action required. Open question from prior audit closed.

**Bug 8 smoke test — CONFIRMED RESOLVED (8 May 2026)**

- Client bell count drops and unread indicator clears when the client opens a conversation.
- The `source_id` backfill (migration `20260507051924`) and the `useConversationRealtime` subscription replacement are both confirmed working for post-migration notifications.
- Pre-migration rows (`source_id = null`) are legacy-only and do not affect new message flows.
- No further action required. Open question from prior audit closed.

**Bug 9 — Dashboard "My Tenants" / "All Tenants" label text — RESOLVED**

- Root cause: two display strings used internal data-model terminology ("tenant") instead of client-facing language ("client").
- `Dashboard.tsx` line 76: subtitle conditional `'My Tenants' : 'All Tenants'` → `'My Clients' : 'All Clients'`.
- `PortfolioFilterBar.tsx` lines 40–41: `SelectItem` display labels updated to "My Clients" / "All Clients". The `value` attributes (`my_tenants`, `all_tenants`) were not changed — all filtering logic and `savedView` comparisons remain intact.
- Text-only change. No DB, no RLS, no data touched.

**Bug 10 — "View Tasks" button in Today's Focus does nothing — RESOLVED**

- Root cause: `onAction` handler in `Dashboard.tsx` lines 112–114 unconditionally called `openDrawerById(item.tenantId)`. The "Client Tasks" focus item has `tenantId: 0`, which matches no tenant — nothing opened. The `actionRoute: '/tasks-management'` field on the item was never read.
- Fix: handler now checks `item.actionRoute` first and calls `navigate(item.actionRoute)` if present; falls back to `openDrawerById(item.tenantId)` for all normal tenant drawer items.
- Side effect: "View Actions" items (route `/my-work`) also gain working navigation — a latent bug on the same code path, fixed as a natural consequence.
- `navigate` was already in scope. No new imports. No DB, no RLS, no data touched.

**Bug 11 — Dashboard "No activity for 999 days" despite recent client activity — RESOLVED**

- Root cause confirmed via DB inspection: `v_dashboard_tenant_portfolio` computed `last_activity_at` as `GREATEST(tk.latest_task_at, cl.latest_consult_at, eg.latest_gap_at)`. Three problems:
  1. Only 3 activity sources — tasks, evidence gap checks, consult logs.
  2. The consult logs lateral had a 30-day cap (`c.date >= now() - '30 days'`), silently excluding all activity older than a month.
  3. No fallback — when all three sources were NULL, `GREATEST(NULL, NULL, NULL) = NULL`, and the downstream `v_dashboard_attention_ranked` returned the 999 sentinel.
- `v_tenant_last_activity` already existed as a purpose-built view aggregating 6 sources (document instances, notes, meetings, email messages, consult logs without time cap, and `t.created_at` as final fallback). It never returns NULL.
- Pre-fix: 391 active tenants had `last_activity_at = NULL` in the dashboard view. All 391 had real activity data in `v_tenant_last_activity`. Total Training Solutions Adelaide Pty Ltd (the reported case) showed `last_activity_at = 2026-05-06` once the fix was applied — 2 days ago, not 999.
- Fix: `CREATE OR REPLACE VIEW public.v_dashboard_tenant_portfolio` — added `LEFT JOIN public.v_tenant_last_activity tla ON tla.tenant_id = t.id`, replaced the GREATEST expression with `tla.last_activity_at AS last_activity_at`. All other laterals and columns unchanged. Delivered inside a transaction with `lock_timeout = '3s'` and `statement_timeout = '15s'`.
- Migration: `20260508005618_a42d04cd-0925-4523-840d-f1e42a2b07fe.sql`
- No RLS, no table structure changes, no data mutations.

## KB changes shipped

- n/a

## Codebase observations

- unicorn-cms-f09c59e5 @ `59128d35`: Bugs 9 + 10 — `Dashboard.tsx` (subtitle text + onAction handler), `PortfolioFilterBar.tsx` (SelectItem labels). Text and navigation only.
- unicorn-cms-f09c59e5 @ `dadbbeab`: Bug 11 — migration `20260508005618_a42d04cd-0925-4523-840d-f1e42a2b07fe.sql` applying `CREATE OR REPLACE VIEW public.v_dashboard_tenant_portfolio` with `v_tenant_last_activity` join.

## Decisions

- Routing `last_activity_at` through `v_tenant_last_activity` accepted as the canonical approach for dashboard activity recency. The view is the single source of truth for tenant activity across 6 signal sources; point sources (tasks, consult logs) are not the right layer for this aggregation.
- Consultants were briefed by message before the fix shipped that Today's Focus and attention ranking would look different immediately after — expected behaviour, not a regression.

## Open questions parked

- Bug 2 (three duplicate unique indexes on `user_notifications.dedupe_key`) remains open. Migration drafted but not yet applied. Write-overhead tax only, no data risk. Fix is the next item in the current session.
- Bug 12 (Today's Focus rendering issues) is pending smoke test now that Bugs 10 and 11 are resolved. Run at next session start on the Dashboard.

## Tag

audit-2026-05-08-dashboard-bugs-9-10-11-fix
