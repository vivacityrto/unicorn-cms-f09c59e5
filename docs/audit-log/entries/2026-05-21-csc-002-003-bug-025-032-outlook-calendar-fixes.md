# Audit: 2026-05-21 — CSC-002, CSC-003, BUG-025, BUG-032 — Outlook Integration, Calendar Layout & Bug Fixes

**Trigger:** Lovable production DB change session — bug fix sprint covering Outlook calendar sync (CSC-003), Outlook email cache fix (CSC-002), impersonation picker error message (BUG-025), and email function ordering inconsistency (BUG-032). Includes a follow-on calendar UX improvement (CSC-018 — overlapping event layout).  
**Author:** Khian (Brian)  
**Scope:** New `sync-outlook-calendar-cron` Edge Function + pg_cron job; React Query cache scoping fix; error message improvement for inactive-user FK; email function `created_at` ordering harmonised; greedy column packing algorithm for overlapping calendar events. No schema changes for BUG-025, BUG-032, CSC-002, or CSC-018. One new pg_cron job for CSC-003.  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### CSC-002 — Outlook email connection drops when switching clients

**Problem:** Linked email list appeared empty when navigating back to a client after visiting another. The Outlook OAuth connection was never actually dropping — emails were correctly stored in `email_messages`. The bug was a React Query cache issue.

**Root cause:** `src/hooks/useLinkedEmails.tsx` had three `invalidateQueries` calls (in `linkEmailMutation.onSuccess`, `updateLinkMutation.onSuccess`, and the AI enrichment `useEffect`) all using the overly broad key `["linked-emails"]`. Any link mutation wiped every client's cache, so navigating back to a client showed an empty list while the cache re-fetched.

**Fix — `src/hooks/useLinkedEmails.tsx` (single file, no migration):**
1. Added `invalidateLinkedEmails()` helper — if `options?.clientId` is set, invalidates only `["linked-emails", clientId, packageId, taskId]`; otherwise falls back to broad `["linked-emails"]` invalidation (preserving behaviour for `LinkEmailModal` which calls the hook with no options)
2. All three invalidation sites replaced with `invalidateLinkedEmails()`
3. Added `staleTime: 5 * 60 * 1000` and `gcTime: 10 * 60 * 1000` to the `useQuery` call

**Verification (21 May 2026):**
- Linked "Accepted: AWS and ComplyHub" email to Test RTO A
- AI enrichment ran correctly (cyan summary text rendered)
- Navigated away to another client, returned to Test RTO A → Emails tab
- Linked email still visible with badge count of 1 ✅

**Live DB state at time of fix:** 8 rows in `email_messages`, all with `client_id` set, 0 with `package_id` or `task_id` — scoped invalidation works correctly for all existing data.

**Blast radius:** Isolated to `useLinkedEmails.tsx`. No DB changes. No other hooks or pages read from `["linked-emails"]` query keys — verified before fix.

---

### CSC-003 — Outlook calendar events missing from Unicorn

**Problem:** All consultants were missing Outlook calendar events in Unicorn. The `sync-outlook-calendar` Edge Function existed and worked correctly when called manually, but had no scheduled trigger. Access tokens for all 8 consultants were expired at time of diagnosis.

**Root cause:** Two coupled issues:
1. No cron job — `sync-outlook-calendar` was never automatically called
2. `sync-outlook-calendar` is per-user/JWT-bound — it reads the calling user's `oauth_tokens` row. `pg_cron` cannot call it directly because cron jobs have no user JWT context

**Database state at diagnosis:**

| Consultant | `oauth_tokens` row | Access token | Refresh token | `last_synced_at` |
|---|---|---|---|---|
| All 7 found | Present | Expired | Valid | Non-null (except Dave — null) |
| Dave | Present | Expired | Valid | NULL |

All tokens were auto-refreshable. Dave's `last_synced_at = null` was expected (first-time state, not a data integrity issue).

**RLS check on `oauth_tokens`:** `SELECT` policy confirmed — authenticated users can only read their own row. Service role has unrestricted read. No cross-tenant risk in the fan-out design.

**Clients and calendar sync:** Confirmed `oauth_tokens` rows with `provider = 'microsoft'` are consultant/staff accounts only. No client-facing calendar sync exists or is needed at this stage. The fix does not affect client users.

**`includeMeetings` flag safety confirmed:** Defaults to `false` in `sync-outlook-calendar`. Only `useMeetings.tsx` explicitly passes `includeMeetings: true` in the user-initiated path. The scheduled fan-out never passes this flag — meetings table is never touched by the cron sync.

**Fix — two-piece solution:**

**1. New Edge Function `supabase/functions/sync-outlook-calendar-cron/index.ts`**

Fan-out wrapper that:
- Accepts a service-role Bearer JWT (validated by matching against `SUPABASE_SERVICE_ROLE_KEY` or decoded JWT with `role = 'service_role'`)
- Queries all `oauth_tokens` rows where `provider = 'microsoft'` and `refresh_token IS NOT NULL`
- Mints a 60-second user JWT per consultant using `jose` SignJWT signed with `EDGE_JWT_SECRET` (= Supabase project's Legacy JWT Secret)
- Calls existing `sync-outlook-calendar` Edge Function per user with the minted JWT
- Concurrency limited to 5 users at a time via `Promise.allSettled`
- Returns `{ processed, succeeded, failed, durationMs }`

**Secret note:** `EDGE_JWT_SECRET` is required. Supabase reserves the `SUPABASE_` prefix for built-in variables — the secret must be named `EDGE_JWT_SECRET`. Value = Legacy JWT Secret from Supabase dashboard → Settings → API → JWT Keys tab. Lovable added the secret directly (has Edge Function secrets permission per RJ confirmation).

**2. pg_cron job `sync-outlook-calendar-every-30min`**

```sql
SELECT cron.schedule(
  'sync-outlook-calendar-every-30min',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/sync-outlook-calendar-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || private.cron_function_jwt()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);
```

Uses the same `private.cron_function_jwt()` helper confirmed active for all other HTTP cron jobs (BUG-020 audit, 21 May 2026).

**Blast radius check:**
- `sync-outlook-calendar` — unchanged; still handles individual user syncs identically
- `calendar_events` table — populated by the sync; RLS confirmed (each consultant sees only their own events); no client portal access
- Meetings table — unaffected (flag never set to `true`)
- `oauth_tokens` — read-only from the fan-out; no writes by the cron wrapper
- No stat cards or dashboard aggregates depend on `calendar_events` row counts

**Verification (21 May 2026):**
- `cron.job` query confirmed `sync-outlook-calendar-every-30min` active with schedule `*/30 * * * *`
- First scheduled run completed: all 8 consultants processed, 0 errors, all `calendar_events` populated
- Dave's `last_synced_at` updated from NULL → timestamp on first run

---

### BUG-025 — Inactive-user FK failure surfaces generic error in impersonation picker

**Problem:** When a staff member selected an archived/inactive user from the impersonation picker, the underlying FK constraint violation surfaced a raw database error message — not an actionable user-facing message.

**Fix:**
- Specific error toast added for the inactive-user FK failure case — message tells the user the selected person is no longer active and to choose a different user
- Archived users excluded from `list_acting_user_options` — the picker no longer shows users who cannot be impersonated

**Scope:** Frontend error handling + picker query filter. No schema changes, no new migrations.

**Blast radius:** Isolated to the impersonation picker flow. No other surfaces use `list_acting_user_options`. The FK constraint itself is unchanged.

---

### BUG-032 — Email function ordering inconsistency

**Problem:** `bulk-send-invitations` picked the *newest* primary contact (`created_at DESC`); `send-email-graph` and `send-composed-email` picked the *oldest* (`created_at ASC`). No current production impact — no tenant has more than one primary contact — but the inconsistent tiebreaker was a latent correctness risk.

**Flagged by:** Lovable during the BUG-001 audit (12 May 2026) as a follow-on item.

**Fix:** `send-email-graph/index.ts` and `send-composed-email/index.ts` both updated to `ascending: false`. All three email/invite functions now consistently use `created_at DESC`.

**Scope:** Two Edge Function files. No migration, no schema change.

**Blast radius:** Zero current impact (no tenant has >1 primary contact). Defensive fix only.

---

### CSC-018 (follow-on) — Calendar overlapping event side-by-side layout

**Triggered by:** Khian observed during CSC-003 work that the calendar day/week view stacked overlapping events on top of each other (fully obscuring events beneath). Requested fix to match Outlook-style side-by-side column layout.

**Problem:** `src/components/calendar/CalendarGrid.tsx` hardcoded `left: '2px', right: '2px'` for every event. No collision detection existed.

**Algorithm — greedy column packing + union-find cluster detection:**

1. Events in each day sorted by start time (ties: longest duration first)
2. Greedy column assignment: each event placed in the lowest column index whose previous occupant has already ended. `columnsEndTimes[]` tracks the end time of the last event in each column
3. Union-Find on all (i, j) event pairs where their time ranges overlap: propagates cluster membership
4. Each cluster's total column count = `max(column index in cluster) + 1`
5. Event style: `left = (column / totalColumns * 100)%`, `width = (100 / totalColumns)%`
6. Non-overlapping events: full width (original `left: 2px, right: 2px` retained)

**Brand colour rotation for overlapping events:**

| Column | Colour | Hex | Text |
|---|---|---|---|
| 0 | Purple | #7130A0 | white |
| 1 | Fuchsia | #ED1878 | white |
| 2 | Cyan | #23C0DD | #1a1a1a (dark) |
| 3 | Acai | #44235F | white |

Rotation applies only to non-`busy_only` events with `totalColumns > 1`. Single events and busy-only events retain their original Tailwind class colour.

Blue explicitly excluded — not part of the Unicorn brand palette (Purple #7130A0, Fuchsia #ED1878, Cyan #23C0DD, Acai #44235F, Light Cyan #A6F1FF, Macaron #F9CB0C). Calendar events are content, not buttons — Angela's blue-button preference does not apply here.

**Scope:** `src/components/calendar/CalendarGrid.tsx` — new `eventLayouts` useMemo; event style calculation updated. `CalendarEventCard.tsx` unchanged — `style?: CSSProperties` already accepts any position values; `truncate` + `overflow-hidden` already handle narrow widths.

**Month view:** Unaffected — the side-by-side layout applies only to day and week views.

---

## KB changes shipped

- `CSCFeedbackFeatures.md` (workspace root) updated:
  - CSC-003 marked ✅ Resolved with full resolution details and Edge Function notes
  - CSC-018 added as new resolved improvement (calendar side-by-side layout)
  - Summary table updated for CSC-003 and CSC-018

## Codebase observations

- CSC-002 code fix: `src/hooks/useLinkedEmails.tsx` — scoped cache invalidation
- CSC-003 new Edge Function: `supabase/functions/sync-outlook-calendar-cron/index.ts`
- CSC-003 pg_cron job: `sync-outlook-calendar-every-30min` active on `yxkgdalkbrriasiyyrwk`
- BUG-025 code fix: impersonation picker — inactive user exclusion + specific error toast
- BUG-032 code fix: `send-email-graph/index.ts` + `send-composed-email/index.ts` → `ascending: false`
- CSC-018 code fix: `src/components/calendar/CalendarGrid.tsx` — greedy column packing algorithm

Codebase commits: not captured — Lovable committed directly to main. Confirm via `git log --oneline -10` in `unicorn-cms-f09c59e5/` if SHAs needed.

## Decisions

- **Blue excluded from calendar event colours:** Unicorn brand palette does not include blue. Angela's blue-button preference applies to interactive controls (buttons, CTAs), not content blocks. Calendar events use the Purple → Fuchsia → Cyan → Acai brand rotation.
- **`includeMeetings: false` for cron sync:** The scheduled sync deliberately never triggers meeting creation. Only the user-initiated path in `useMeetings.tsx` passes `includeMeetings: true`. This boundary is intentional and must be preserved in future changes to `sync-outlook-calendar-cron`.
- **`EDGE_JWT_SECRET` naming:** Supabase reserves the `SUPABASE_` prefix. Any future Edge Function that needs to mint user JWTs must use `EDGE_JWT_SECRET` (or another non-`SUPABASE_`-prefixed name) for the Legacy JWT Secret.
- **BUG-032 no current impact:** No tenant has >1 primary contact in production. Fix is defensive only — ships now to avoid a silent correctness bug in future multi-contact tenants.

## Open questions parked

- CSC-009 (calendar colour band overflow) — still open. Separate from CSC-018. CSS positioning/z-index issue likely causing the block to visually extend past the event's end time. Needs browser devtools inspection.
- CSC-003 monitoring: first scheduled run verified manually. Recommend checking `cron.job_run_details` after the 30-minute mark in production to confirm ongoing reliability.

## Tag

audit-2026-05-21-csc-002-003-bug-025-032-outlook-calendar-fixes
