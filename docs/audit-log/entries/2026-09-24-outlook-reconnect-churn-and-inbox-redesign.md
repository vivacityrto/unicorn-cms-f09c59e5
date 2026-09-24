# Audit: 2026-09-24 — Outlook reconnect churn fixes + Inbox redesign

**Trigger:** ad-hoc (Carl reported Tanya Janklin has to repeatedly reconnect
her Outlook account, and asked to redesign the in-app "Outlook Inbox"
experience to look more like the real Outlook app)
**Scope:** Microsoft OAuth token refresh path (`oauth_tokens`,
`sync-outlook-calendar`, `capture-outlook-email`, `outlook-auth`, plus three
other edge functions found to share the same duplicated refresh logic), and
the Outlook Inbox browsing/linking UI (`OutlookInboxBrowser`,
`ClientEmailsTab`, `LinkedEmailsList`, `email_messages`).

## Findings

- Live-queried Tanya's real `client_timeline_events`: she reconnected 5 times
  since Aug 12 (Aug 12, Sep 1, Sep 3, Sep 18, Sep 23 — days-to-weeks apart,
  not clustered in one session), with **zero** `microsoft_disconnected` and
  **zero** `microsoft_sync_failed` events, despite both being real, reserved
  `client_timeline_events.event_type` values.
- Root cause for the missing `microsoft_disconnected` events: `outlook-auth`'s
  `disconnect` action called `emitTimelineEvent` without a `dedupe_key`, but
  `emit-timeline-event.ts`'s own `validateEvent()` throws
  `"Microsoft-sourced events require a dedupe_key"` for any `source:
  "microsoft"` event lacking one. `emitTimelineEvent` catches and swallows
  that exception (logs + returns `null`), so every disconnect silently
  failed to record anything — confirmed by the live data (5 connects, 0
  disconnects).
- Root cause for the missing diagnostic trail on reconnects: the
  `refreshTokenIfNeeded` logic (duplicated across **five** edge functions —
  `sync-outlook-calendar`, `capture-outlook-email`, plus three the original
  investigation missed: `send-email-graph`, `sync-meeting-artifacts`,
  `generate-minutes-from-transcript`) never wrote `oauth_tokens.last_error`
  when Microsoft's refresh call itself failed, and never emitted
  `microsoft_sync_failed` (a valid, reserved event type that had never been
  emitted anywhere in the codebase). A dying connection therefore left no
  trace beyond a stale `expires_at` and a generic "Expired" badge.
- Plausible contributing factor: because 5 separate functions each ran their
  own independent refresh check, the 30-min cron (`sync-outlook-calendar-cron`)
  and a live user action (opening Linked Emails, sending an email, syncing a
  meeting) could race to refresh the same soon-to-expire token. Microsoft
  rotates (single-uses) refresh tokens, so the loser of that race submits an
  already-rotated-away refresh token and gets an unrecoverable
  `invalid_grant`, forcing a full reconnect — a better fit for the observed
  weeks-apart cadence than steady token expiry.
- Separately, `useOutlookInbox.tsx` ran its own independent, weaker
  connection check (`checkConnection`, a raw client-side `expires_at < now()`
  comparison against `oauth_tokens_safe`), duplicating and disagreeing with
  the correct view-based check `useOutlookConnectionStatus` already uses. A
  token merely due for its next cron refresh (but with a live refresh_token)
  could trip this into forcing a full reconnect for nothing.
- `OutlookCallback.tsx` (hardened 2026-08-15 for a real CSRF/caller-binding
  gap) hard-requires an active app session at the exact moment Microsoft's
  redirect lands back, with no retry — a slow MFA prompt or a popup-window
  session hiccup fails with "please sign in and try again," indistinguishable
  from a real disconnect.
- Confirmed "Email Triage" (`EmailTriagePage.tsx`, a Power-Automate-fed
  support-ticket system) and the real Graph-API-driven Outlook inbox browser
  (`OutlookInboxBrowser.tsx` + `ClientEmailsTab.tsx`'s "Linked Emails",
  backed by `email_messages`) are two unrelated features — the redesign
  targets the latter only.
- Confirmed via code reading: Sent Items was already fully wired
  server-side (`fetchEmails(folder="sent")` in `sync-outlook-calendar`) but
  no page ever rendered it; Microsoft's `categories` array was never fetched
  from Graph at all; `conversationId` was fetched and used for client-side
  thread grouping but never persisted to `email_messages`.

## Code changes

- New `supabase/functions/_shared/outlook-token-refresh.ts`: consolidates
  what were 5 separate copies of `refreshTokenIfNeeded` into one
  `getValidMicrosoftAccessToken`. On a refresh failure, writes
  `oauth_tokens.last_error` with the real Microsoft `error_description` and
  emits `microsoft_sync_failed` (`dedupe_key: ms_sync_failed:<user_id>:<date>`).
  Re-reads the token row before refreshing if it was updated in the last 10
  seconds (another caller likely just refreshed it), to reduce the
  concurrent-refresh race described above.
- `sync-outlook-calendar/index.ts`, `capture-outlook-email/index.ts`,
  `send-email-graph/index.ts`, `sync-meeting-artifacts/index.ts`,
  `generate-minutes-from-transcript/index.ts`: local `refreshTokenIfNeeded`
  removed, now call the shared helper.
- `outlook-auth/index.ts`: fixed the missing `dedupe_key` on the
  `microsoft_disconnected` emit.
- `useOutlookInbox.tsx`: removed its standalone, weaker connection check;
  `hasConnection` now derives from the same `useOutlookConnectionStatus`
  view-based check the rest of the app uses.
- `OutlookCallback.tsx`: attempts one `supabase.auth.refreshSession()` before
  failing with "please sign in and try again."
- Migration `20260924055720_email_messages_categories_and_conversation_id`:
  adds nullable `email_messages.conversation_id` (text) and `.categories`
  (text[]). No backfill — populated going forward by `capture-outlook-email`.
- `capture-outlook-email/index.ts`: added `categories`/`conversationId` to
  its Graph `$select`, persists both on link/relink/refresh-metadata.
  `sync-outlook-calendar/index.ts`: added `categories` to its list-fetch
  `$select` too.
- New `src/types/outlookEmail.ts` (shared `OutlookEmail` type, previously
  declared separately and drifted between `OutlookInboxBrowser.tsx` and
  `useOutlookInbox.tsx`) and `src/lib/emailCategoryColor.ts` (deterministic
  name→colour mapping — see Decisions below for why, not real Outlook
  colours).
- `OutlookInboxBrowser.tsx`: added an internal Inbox/Sent Items folder
  switcher (only shown when the `folder` prop isn't explicitly fixed by the
  caller — the KPI email-log picker in `KpiEmailLogSection.tsx` still locks
  a specific folder per wizard step, unaffected) and category chips per row.
  `LinkedEmailsList.tsx`: category chips on linked emails too.
  `useLinkedEmails.tsx`: `LinkedEmail` type extended with the two new
  columns (already selected via the existing `select("*")`).

## Decisions

- Category colours are app-generated (a name hashed to a fixed palette),
  not Microsoft's real per-user category colours — the real colours require
  the `MailboxSettings.Read` Graph scope, which isn't currently granted and
  would force every already-connected staff member (Tanya included) to
  reconnect once to pick up the new scope. Carl's explicit call, directly in
  service of the reconnect-churn fix rather than against it.
- Consolidating the token-refresh logic was scoped in the plan to 2 files
  (`sync-outlook-calendar`, `capture-outlook-email`) based on the original
  research pass, which was scoped to email specifically. While implementing,
  found 3 more edge functions (`send-email-graph`, `sync-meeting-artifacts`,
  `generate-minutes-from-transcript`) with byte-for-byte the same duplicated
  function and the same silent-failure gap. Consolidated all 5 rather than
  leaving 3 unfixed copies capable of the same race and the same missing
  diagnostics — same mechanical, low-risk edit, directly in scope of what
  the fix is for.
- No changes to the AI-summary generation pipeline
  (`capture-outlook-email`'s `generateAiSummary`, `useLinkedEmails`'s
  background auto-enrichment effect), attachment handling, soft-delete
  unlink, or `email_link_audit` — all explicitly out of scope and unchanged.

## Verification

- `npm run typecheck` — 0 errors (confirmed twice, once via a backgrounded
  run that completed clean, once via a fresh re-run).
- `npx eslint` on all changed frontend and edge-function files — 0 errors
  (confirmed edge functions are actually linted, not silently skipped, via
  `--format json` on one file).
- `npm run test:frontend` — 588-589/589 passing across runs; the one
  intermittent failure (`risk-opportunity-form.test.tsx`, an unrelated EOS
  form test) was independently confirmed to pass cleanly in isolation
  earlier this session — pre-existing full-suite flakiness under load on
  this machine, not a regression.
- `npm run test:edge` — 321/321 passing. Checked the existing
  `auth-gate.test.mjs` files for `sync-outlook-calendar`,
  `capture-outlook-email`, and `send-email-graph` — none reference the
  refresh logic that changed, so no test updates were needed there.
- `mcp__supabase__get_advisors` after the migration — no new findings.
- The concurrent-refresh-race mitigation and the new `last_error`/
  `microsoft_sync_failed` diagnostics can't be proven synthetically in one
  session — validated by code review now, and by whether the next time a
  connection dies, the timeline finally shows a real reason instead of
  nothing.

## Open questions parked

- None.
