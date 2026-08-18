# Audit: 2026-08-18 — notification cron hardening verification

**Trigger:** drift-surfaced — "Notification, cron, and CORS work" section of
`docs/claude-security-architecture-audit-handoff-2026-08-18.md`.
**Scope:** `process-notification-outbox`, `process-notification-queue`,
`generate-notifications`, `send-action-item-due-reminders`, the shared
`_shared/app-base-url-parse.ts` (`joinAppUrl`), and the retirement status of
`schedule-task-reminders`. Did not touch CORS beyond confirming these four
functions already use the allowlist helper; did not do a repo-wide CORS
sweep.

## Findings

- **Handoff was stale on two of its three claims for this section.** Live
  deployed source (`mcp__supabase__get_edge_function`) for
  `process-notification-outbox` (v554), `process-notification-queue` (v104),
  `generate-notifications` (v530), and `send-action-item-due-reminders` (v68)
  is byte-identical to this repo's `main`, and all four already import and
  call `isCronAuthorized` / `cronUnauthorizedResponse` from
  `_shared/cron-auth.ts` — the same constant-time `x-cron-invoke-secret` /
  `CRON_INVOKE_SECRET` gate documented in
  `docs/audit-log/entries/2026-08-15-cron-invoke-unverified-jwt-bypass.md`,
  not a decoded-but-unverified JWT claim. **Not a finding — already fixed**,
  most recently reconfirmed by
  `docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md`
  (which gated `schedule-task-reminders` on the same pattern and named these
  four functions as the existing precedent).
- **CORS on the same four functions is already the request-aware allowlist**
  (`corsHeaders(req)` from `_shared/cors.ts`, echoes `Origin` only when
  allowlisted, never `*`) — confirmed in both repo and live source. **Not a
  finding.**
- **`schedule-task-reminders` (#337) is merged and deployed, not "clean but
  not merged/deployed" as the handoff states.** `gh pr view 337` shows
  `state: MERGED`, `mergedAt: 2026-08-17T23:30:00Z`. Live deployed source
  (v88) is the unconditional `410 Gone` retirement stub described in
  `docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md`,
  not the cron-gated v87 the handoff seems to be describing. **Correcting
  the handoff, not re-doing this work.**
- **Real, unfixed: `joinAppUrl` (`supabase/functions/_shared/app-base-url-parse.ts`
  line 17-19, pre-fix) returned any `path` matching `/^https?:\/\//i`
  unchanged instead of anchoring it to `base`.** `process-notification-outbox`
  (`index.ts` line 85-88) reads `payload.deep_link` directly out of a
  `notification_outbox` row and calls `appUrl(deepLink)` to build the
  `Action.OpenUrl` target in the Teams adaptive card ("Open in Unicorn").
  `payload` is caller-supplied JSONB: `public.emit_notification`
  (`supabase/migrations/20260206071351_bbfe0506-1cc4-4eec-aad1-e65a2c4b172b.sql`)
  inserts `p_payload` into `notification_outbox` with no validation of its
  contents, and it is called directly from the browser via
  `supabase.rpc('emit_notification', ...)` in `src/lib/notificationEmitters.ts`
  by any authenticated caller. So any authenticated user could set
  `deep_link` to an absolute attacker-controlled URL and have it delivered,
  unchanged, as a trusted-looking "Open in Unicorn" link in a teammate's
  Teams channel — an open redirect / phishing vector. The existing Deno test
  (`app-base-url_test.ts`) explicitly asserted this passthrough as intended
  behaviour ("joins relative paths and preserves absolute URLs"), so this was
  not a regression, it was the shipped design. Confirmed the same bug exists
  in the live deployed `_shared/app-base-url-parse.ts` bundled with all four
  functions above (identical `ezbr_sha256`-backed source in each
  `get_edge_function` response).
- Checked every other call site of `appUrl`/`joinAppUrl` in
  `supabase/functions/**`: `process-notification-queue`
  (`appUrl(\`/tasks/${entity_id}\`)`), `send-action-item-due-reminders`
  (`appUrl(\`/tenant/${item.tenant_id}?tab=actions\`)`), and
  `send-invitation-email` (`appUrl(\`/accept-invitation?token=...\`)`) all
  pass a relative path built from server-side IDs, never a caller-supplied
  value. No legitimate caller relies on the absolute-URL passthrough.

## KB changes shipped

- No changes.

## Code changes (this entry accompanies)

- `supabase/functions/_shared/app-base-url-parse.ts`: `joinAppUrl` no longer
  special-cases `https?://`-prefixed input; every `path` is now folded into
  a path segment under `base`, so the parsed origin of the result is always
  `base` regardless of what `path` contains.
- `supabase/functions/_shared/app-base-url_test.ts`: replaced the
  "preserves absolute URLs" assertion with an open-redirect regression test
  (absolute and protocol-relative `path` values must resolve to `base`'s
  origin).
- `supabase/functions/_shared/app-base-url-open-redirect.test.mjs` (new):
  `node:test` regression covering the same property plus a source-string
  guard against a future `return path;` passthrough reappearing in
  `joinAppUrl`, and a check that `process-notification-outbox` still routes
  through `appUrl()` rather than using `payload.deep_link` directly. Verified
  with `node --experimental-strip-types --test
  supabase/functions/_shared/app-base-url-open-redirect.test.mjs` (7/7
  passing).
- `docs/claude-security-architecture-audit-handoff-2026-08-18.md`: annotated
  the "Notification, cron, and CORS work" section with what was verified
  fixed vs. corrected vs. actually remediated here.

## Decisions

- Fix at the shared `joinAppUrl` helper rather than only validating
  `deep_link` inside `process-notification-outbox`: it is the one place
  every current and future caller of `appUrl()` gets the guarantee, and no
  existing caller depended on the absolute-URL passthrough (see Findings).
- Did not flip `ACCEPT_LEGACY_SERVICE_ROLE_JWT` to `false` in
  `_shared/cron-auth.ts` — out of scope for this entry (that's a rollout
  decision for every cron job sending the legacy JWT, not something this
  task's four functions can decide alone) and not part of what was asked.
- Did not open a PR against the already-fixed cron-gate/CORS items — no code
  change was needed for them, so per the assignment's own guidance this
  ships as a `fix:` PR carrying only the real `joinAppUrl` fix plus the
  handoff correction, not a separate empty docs-only PR.

## Open questions parked

- Whether `emit_notification` itself should validate `deep_link` server-side
  (e.g. reject absolute URLs at insert time, not just at read time) as
  defense-in-depth on top of this fix. Left parked: the read-side fix in
  `joinAppUrl` already closes the vector for every current and future
  reader of `notification_outbox.payload`, and touching the RPC's signature
  is a larger, separate change (see AGENTS.md's `DROP FUNCTION` guardrail if
  that's ever done).
- Whether `ACCEPT_LEGACY_SERVICE_ROLE_JWT` can be flipped to `false` yet
  across all cron jobs — not scoped to this entry.
