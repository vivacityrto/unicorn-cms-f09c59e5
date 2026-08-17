# Audit: 2026-08-17 — schedule-task-reminders cron-invoke auth

**Trigger:** drift-surfaced — highest-priority open finding from the edge
function deployment-drift audit (`docs/audit-log/entries/2026-08-17-edge-function-deployment-drift.md`,
flagged again in the Claude Code A1 capture, PR #328).
**Scope:** `schedule-task-reminders` only. Read-only investigation across the
repo, full git history, `pg_cron`, Postgres triggers/functions, edge-function
logs (24h window), and prior audit docs, followed by an in-function
authentication fix. No production deploy, retirement, or lifecycle decision
in this entry — see "Open questions parked".

## Findings

- **No caller found anywhere, exhaustively.** `git log --all -S"schedule-task-reminders"`
  returns only this session's own prior audit commits. No literal match in
  `src/`. No `pg_cron` job references it (`cron.job.command` searched). No
  Postgres trigger or function body references it
  (`pg_get_triggerdef`/`pg_get_functiondef` searched project-wide). No
  edge-function invocation logged in the last 24 hours (a supporting data
  point only — not treated as proof of disuse per this workstream's
  no-retirement rule).
- **Its target table has never received a real row.** `notification_schedule`
  has **0 rows** in production, of any `notification_type`, despite the
  function existing since November 2025 (`created_at` ≈ 1764235215535).
- **The equivalent workflow already exists and runs elsewhere.** `generate-notifications`
  (cron scope `tasks_obligations`, daily) independently generates task-due
  notifications by scanning `tasks_tenants` and writing to `user_notifications`
  — a different table, different dedupe scheme (`task_due:{id}:{window}:{uid}`),
  and a different window model (7d/1d/0d/overdue-3d) than
  `schedule-task-reminders`' own (days-before-due / 1-day-after). The two
  were never the same mechanism; `generate-notifications` is the one that's
  actually wired to cron and actually runs.
- **An independent survey from three months earlier already excluded this
  function.** `docs/audit-log/entries/2026-05-19-notification-system-survey.md`
  mapped every writer of `notification_schedule` and named only
  `audit_send_24hr_confirmation()` and `audit_flag_overdue_chcs()` (both
  unrelated PL/pgSQL functions, for audit-appointment/CHC-overdue
  notifications) — `schedule-task-reminders` isn't in that list at all. The
  same survey marked `notification_schedule` itself **"Legacy... Retirable
  once audit reminders move [to the outbox pattern]"**, and separately noted
  `process-notification-queue` (the only code that ever reads
  `notification_schedule` as a `status='pending'` queue) has **no cron job**
  — confirmed still true today (absent from the current 20-job `cron.job`
  listing, consistent with the still-open question in
  `docs/audit-log/entries/2026-08-15-cron-invoke-auth.md`: *"Whether
  process-notification-queue should get a cron schedule, or be retired"*).
  So even a hypothetical successful write from `schedule-task-reminders`
  today would sit in `notification_schedule` unprocessed.
- **Confirmed: `get-email-status` and `report-delivery-issue` are broken for
  every real caller, independent of their gateway `verify_jwt` setting**
  (which has itself drifted from `true` to `false` for both since the A1
  capture — production `updated_at` now identical across `get-email-status`
  v107, `report-delivery-issue` v105, and `schedule-task-reminders` v84,
  1786948794088, consistent with an unrelated platform-level redeploy event
  rather than a content change; source is otherwise byte-identical to the
  A1 capture). Both build their Supabase client from the **anon key only**,
  never forwarding the caller's `Authorization` header. `email_sends`,
  `email_events`, and `email_delivery_issues` all have `FORCE ROW LEVEL
  SECURITY` with a single `is_super_admin()`-only policy.
  `is_super_admin_safe(p_user_id)` filters `WHERE user_uuid = p_user_id`; for
  an anon-key connection `auth.uid()` is `NULL`, and `uuid_column = NULL` is
  never true in SQL, so the policy evaluates false for **every** caller,
  including a real super admin — the client never presents any identity for
  Postgres to check. Concretely: `get-email-status` always gets 0 rows back
  from its `.single()` select and returns its own `404 "Email send not
  found"`; `report-delivery-issue`'s insert is always rejected by the
  `FORCE`d RLS policy and it returns its own `500 "Failed to report issue"`.
  This holds regardless of `verify_jwt` because that gateway setting only
  gates whether the *incoming* HTTP request needs a JWT to reach the
  function; it has no effect on what identity the function's own outbound
  Postgres client presents. **Not fixed in this entry** — out of scope for
  this task (which was to remediate `schedule-task-reminders`); flagged here
  as the direct answer to "is this currently broken", and left as a
  follow-up decision item (see below).

## Remediation (this entry)

Gated `schedule-task-reminders` on the same shared `isCronAuthorized` /
`cronUnauthorizedResponse` pattern already used by
`process-notification-outbox`, `process-notification-queue`,
`generate-notifications`, and `send-action-item-due-reminders`
(`supabase/functions/_shared/cron-auth.ts`) — the smallest change that closes
the anonymous-write hole without inventing a caller identity that no
evidence supports. `verify_jwt` stays `false` at the gateway, unchanged,
matching every other function using this exact pattern (the in-function
check *is* the auth). Request/response contract for an authorized caller
(same `task_id`/`tenant_id`/`assigned_to`/`due_date` in, same
`{success, scheduled_count, notifications}` out) is byte-for-byte unchanged;
an unauthenticated caller now gets `401 {"error":"Unauthorized"}` instead of
always succeeding.

Also switched the file off importing the shared `../_shared/cors.ts` (a
static-object import that would silently drop all CORS headers on a future
redeploy, per the A1 finding — spreading a function value yields nothing) to
a local static object identical to the current production CORS response, so
this fix doesn't also introduce that unrelated behaviour change. Added
`schedule-task-reminders` to the existing `AFFECTED` list in
`supabase/functions/_shared/cron-auth.test.mjs`, which already asserts every
listed function imports and calls `isCronAuthorized`/`cronUnauthorizedResponse`
— no new test file needed, matching how the other four cron-gated functions
are covered. Verified `node --test supabase/functions/_shared/cron-auth.test.mjs`
(12/12 passing) and `npx tsc --noEmit` (clean) locally.

## Deployment verification

**v87 (2026-08-17, cron-auth gate)** — deployed via Supabase MCP
`deploy_edge_function`, per Carl's explicit go-ahead (U7). Hosted source
matched the committed PR source exactly, `verify_jwt` remained `false`.
Live-tested with an unauthenticated `POST`: returned
`401 {"error":"Unauthorized"}` and touched no data (previously would have
written `notification_schedule`/`package_workflow_logs` rows).

**v88 (2026-08-18, retirement)** — deployed the `410` stub after Carl
resolved U6. Hosted source matches the committed stub exactly. Live-tested
with the same request shape as before: now returns
`410 {"error":"Gone — this function has been retired. Task due-date
reminders are handled by generate-notifications."}`. PR #337 still open,
not merged.

## Retirement (2026-08-18, U6 resolved)

Carl reviewed the U6 options (retire / DB trigger / leave gated-and-dormant)
and chose **retire**: `generate-notifications` already covers task-due
reminders in production, and maintaining two parallel, differently-shaped
reminder systems for the same need has no upside. Replaced the auth-gated
`index.ts` with an unconditional `410 Gone` stub, matching the pattern
already used for `tmp-backfill-sharepoint-drive-ids` and the three UUID-slug
stubs. Removed `schedule-task-reminders` from the `AFFECTED` list in
`_shared/cron-auth.test.mjs` (a retired stub has no cron-auth dependency to
assert) and updated its `config.toml` comment. Deployed the stub and
verified (see updated "Deployment verification" below). This is a real
lifecycle decision, made only after Carl's explicit instruction — not
inferred from the absence-of-caller evidence alone, per this workstream's
standing no-retirement-by-inference rule.

## KB changes shipped

- No changes.

## Code changes (this entry accompanies one)

- `supabase/functions/schedule-task-reminders/index.ts` — briefly gated on
  `isCronAuthorized` (v87), then replaced entirely with a `410` retirement
  stub (v88) once Carl decided U6.
- `supabase/functions/_shared/cron-auth.test.mjs` — added
  `schedule-task-reminders` to `AFFECTED`, then removed it again once
  retired.
- `supabase/config.toml` — `[functions.schedule-task-reminders]` comment
  updated twice: first to describe the cron-auth gate, then to describe
  the retirement.
- `docs/edge-function-remediation-handoff.md` — status, evidence, and Carl
  decision items (U6, U7, U8) recorded and resolved.

## Decisions

- Prefer the existing shared cron-invoke-secret pattern over inventing a new
  authorization model, since no real caller was found for this function to
  design around, and the codebase already has an established, tested
  precedent for exactly this situation (`process-notification-queue`:
  gated defensively, left unscheduled, decision parked for its owner).
- Do not touch `get-email-status` or `report-delivery-issue` in this entry —
  out of scope for the `schedule-task-reminders` task; recorded as a
  follow-up decision item instead of silently expanding scope.
- Deployed after PR creation, on Carl's explicit go-ahead (U7) — not assumed
  ahead of that instruction, since a production deploy of an auth-gate
  change is a real behaviour change even though the target was unused.

## Open questions parked

- **Resolved 2026-08-18 (U6).** Retire — see "Retirement" section above.
- **Resolved 2026-08-17 (U7).** Deployed as version 87 on Carl's explicit
  go-ahead — see "Deployment verification" above.
- **`get-email-status` / `report-delivery-issue` are non-functional for
  every real caller today** (see Findings). Fixing them means forwarding the
  caller's `Authorization` header into their Supabase client (the same
  correct pattern `admin-change-password` and `validate-ai-assist` already
  use, per the A2 capture notes) — but that's a distinct remediation task
  from this one and is not done here.
- `notification_schedule` itself was already flagged as legacy/retirable in
  the 2026-05-19 survey, contingent on "audit reminders mov[ing] to outbox"
  — unrelated to `schedule-task-reminders`, but worth remembering this table
  has its own separate, older open question.
