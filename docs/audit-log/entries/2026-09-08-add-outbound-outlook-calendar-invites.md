# Add outbound Outlook calendar invite capability

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P4-D, L10 item #10

**Scope:** frontend + edge function, 5 files — no migration, no schema change (uses existing `calendar_events` columns as originally intended)

**Hosted state changed:** no code deployed as part of this PR's authoring — Edge Function deploys automatically on merge to `main` via Supabase's GitHub sync (~12 min lag, per `AGENTS.md`)

## Decision

Carl asked whether Unicorn has ANY outbound "create Outlook event" capability at all, before deciding whether to scope #10 as real work. Investigated the full repo (every `graph.microsoft.com` reference across `supabase/functions/**`, the OAuth scope list, the app-level Graph client used for SharePoint/M365 provisioning) and confirmed: **no**, every existing Graph calendar call is read-only (`sync-outlook-calendar`'s inbound sync, `generate-minutes-draft`/`sync-meeting-artifacts`'s single-event detail fetches, `_shared/graph-client.ts`'s helpers) — nothing anywhere does a `POST`/`PATCH`/`DELETE` to a Graph calendar endpoint. The requested OAuth scope was `Calendars.Read` only (`_shared/microsoft-scopes.ts`), confirming this by design, not oversight.

Carl then approved scoping and building it, with two explicit constraints:
1. Skip live Playwright verification — "I don't want to be making live calendar data." Any issue that surfaces in real usage gets fixed then.
2. Resolve the two open UX decisions (re-consent flow, failure behavior) using the pattern already established in this codebase this session: never silently no-op on a failure — schedule/cancel the meeting regardless, but surface an explicit, visible notice.

## Implementation

- `supabase/functions/_shared/microsoft-scopes.ts`: `CALENDAR_SCOPES` changed from `['Calendars.Read']` to `['Calendars.ReadWrite']`. Since the frontend never actually passes `surfaces` to `outlook-auth`'s `get-auth-url` action (confirmed via repo-wide search — `outlook-auth/index.ts`'s `{ mail: false, calendar: true, documents: false }` default is the only path ever exercised), every future Outlook connection automatically requests the new scope with zero other frontend change needed.
- `supabase/functions/sync-outlook-calendar/index.ts`: added `create-event` and `cancel-event` actions, following the exact proven pattern `send-email-graph` already uses for outbound `Mail.Send` calls (same `oauth_tokens` delegated-token infrastructure via the existing `refreshTokenIfNeeded` helper, same POST-to-Graph shape).
  - `create-event`: `POST https://graph.microsoft.com/v1.0/me/events`, then inserts `calendar_events` **fully populated from the real Graph response** — deliberately never a placeholder row inserted before the Graph call, since that exact ordering is what made the original code always fail its `NOT NULL` constraints (neither `calendar_id` nor `provider_event_id` exists until Outlook has actually created the event).
  - `cancel-event`: looks up the local `calendar_events` row, confirms it belongs to the calling user, `DELETE https://graph.microsoft.com/v1.0/me/events/{id}` (a 404 — already gone from Outlook — is treated as success), then marks the local row `status: 'cancelled'`.
  - Both actions return a `success: boolean` + `error_code` (`not_connected` / `insufficient_scope` / `graph_error` / `invalid_request` / `not_found` / `forbidden`) JSON body rather than relying on HTTP status alone, so the frontend can distinguish "needs to reconnect" from any other failure reliably regardless of Supabase JS client version quirks around non-2xx bodies.
  - `attendees` is written in the same `{ list: [...], emails: [...] }` shape the inbound sync already uses (confirmed via `CalendarEventDetailDialog.tsx`'s `event.attendees.list` reader) — not a bare array.
  - `start_at`/`end_at` are naive local datetime strings (no UTC offset) that have always been written to the `timestamptz` columns as-is; used `timeZone: 'UTC'` in the Graph payload to match that existing (if implicit) convention exactly, rather than introduce a second, different timezone assumption between the local record and the Outlook event.
- `outlook-auth/index.ts` and `sync-outlook-calendar/index.ts`: updated the two hardcoded `'...Calendars.Read'` fallback strings (used only if a token's `scope` column is unexpectedly null) to `Calendars.ReadWrite`, for consistency with the new default. Left `capture-outlook-email`, `generate-minutes-from-transcript`, and `sync-meeting-artifacts`'s own fallback strings untouched — unrelated features, no reason for them to request write access.
- `src/hooks/useAuditSchedule.ts`: `useScheduleAuditPhase` no longer pre-inserts a `calendar_events` row — it calls `create-event` directly with the meeting's real fields. On any failure (`error_code` present, or a thrown error), the meeting still schedules successfully; a `sonner` toast surfaces "Meeting scheduled, but no calendar invite was sent — reconnect Outlook to enable invites" (for `not_connected`/`insufficient_scope`) or a generic equivalent otherwise. `useCancelAuditAppointment` now calls `cancel-event` (renamed from the old, unhandled `'cancel'` action name) — its existing best-effort try/catch already matched the same fail-open contract, so no further change was needed there.
- New `supabase/functions/sync-outlook-calendar/auth-gate.test.mjs` (static source-pattern checks, matching this repo's established convention for functions Deno isn't available to actually run locally): confirms both new actions sit behind the same auth+token-refresh gate as every other action in the file, use the refreshed access token (not a raw stored one), `cancel-event` checks row ownership before calling Graph, `create-event` never pre-inserts a placeholder row, and both actions return a distinguishable `insufficient_scope` error code.

## Postflight

- `node scripts/check-kb-links.mjs`, `LINT_RATCHET_BASE=origin/main node scripts/lint-ratchet.mjs`, `node scripts/check-edge-function-auth-gate.sh origin/main` — all clean.
- `npm run typecheck` — 0 errors.
- `npm run test:frontend` — 321 passed, 15 skipped.
- `npm run test:edge` — 276 passed, including the new 5-test `auth-gate.test.mjs` suite.
- `npm run build` — succeeds.
- **Live verification deliberately not performed** — Carl explicitly asked to skip it rather than create real calendar data on a real Outlook mailbox. This means the actual Graph API request/response shapes (does `POST /me/events` accept this exact payload; does the local `calendar_events` insert succeed against real Graph response data; does a reconnect actually grant `Calendars.ReadWrite` in practice) are unverified against a live Microsoft tenant. Flagged here explicitly rather than silently — if a real opening/closing meeting scheduling attempt surfaces an error after this ships, that's the first real-world signal for this feature, and it should be fixed then rather than treated as a regression in already-verified behavior.
- 13 existing Microsoft connections (all `Calendars.Read`-only today) will need to reconnect via the normal "Connect to Outlook" flow to pick up write access — no forced/automated reconnect prompt was built (out of scope, matches Carl's stated risk tolerance of "fix it when it comes up").

## Open questions parked

- L10 item #18 (tenant-less notification preferences) is now the only remaining P4-D item — needs a product decision on how `user_notification_prefs.tenant_id NOT NULL` should treat the 72 staff/SuperAdmin accounts with no single tenant.
