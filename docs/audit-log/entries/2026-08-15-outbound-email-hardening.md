# Audit: 2026-08-15 — outbound-email-hardening

**Trigger:** ad-hoc — harden the hosted outbound email surface. No database
object was created, altered, or revoked.
**Scope:** deployed edge functions `send-notification-email`,
`send-automated-email`, `send-test-email` (three UUID-slug copies),
`send-enhanced-email`, `send-mailgun-template`, `send-staff-onboarding-email`.
Did not touch `send-composed-email`, `send-stage-email`, `send-invitation-email`,
or any Postgres function / cron job / vault secret.

## Findings

- `admin.team_users.manage` is present and active in `permission_features`
  (confirmed via `execute_sql`). Used for staff-facing senders as suggested.
- `send-notification-email` and `send-automated-email` have no in-repo
  frontend callers. Live cron (`audit_send_24hr_confirmation` and siblings)
  invokes `send-automated-email` with `Authorization: Bearer
  <private.cron_function_jwt()>`. Those SQL functions were **not** changed.
  The internal gate accepts `INTERNAL_EMAIL_SECRET`, `CRON_FUNCTION_JWT`, or
  `SUPABASE_SERVICE_ROLE_KEY` via constant-time compare so existing schedules
  keep working once `CRON_FUNCTION_JWT` (or `INTERNAL_EMAIL_SECRET`) matches
  the vault value — or if that vault value is already the service-role JWT.
- Three `send-test-email` deployments existed as UUID slugs, all
  `verify_jwt=false` with no caller check. There is no Management API delete.
  `dcd6c745-…` and `c22daa64-…` are 410-stubbed. The named slug
  `send-test-email` is the Super-Admin-gated keeper.
- `64329f1f-48e1-4374-8ddf-6e66e42d33de` could **not** be redeployed: the
  Supabase MCP `deploy_edge_function` `name` field rejects slugs that start
  with a digit (`/^[A-Za-z][A-Za-z0-9_-]*$/`). That copy is a different
  unauthenticated SendGrid sender (still `verify_jwt=false`, CORS `*`) and
  remains live. Parked — needs a dashboard delete or a Management API call
  that accepts the raw slug.
- `verify_jwt=true` on `send-enhanced-email` / `send-mailgun-template` was
  providing no authorization (anon key satisfies it). Both are now
  `verify_jwt=false` with in-function `requireCaller`.
- Caller-controlled `fromOverride` / `overrides.from` / auditor-name From
  display, and whole-URL merge fields (`task_url`, `meeting_url`, …), were
  live on the hosted copies.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Shared `_shared/escape-html.ts`, `_shared/email-urls.ts`,
  `_shared/email-merge.ts`, and an APP_BASE_URL CORS allowlist on
  `_shared/cors.ts`. Auth uses the C1 `requireCaller` from PR #295
  (`requireCaller(req, featureKey, minLevel)`, plus additive
  `requireSuperAdmin` / `requireInternalEmailSecret` so cron JWT and
  Super Admin gates do not invent a second helper API).
- Vendored + hardened the six email functions into the repo; retired the
  UUID `send-test-email` copies with a 410 stub.

## Decisions

- Internal senders use a shared-secret gate rather than a user permission,
  because they are cron / function-to-function, not interactive users.
- From address is Deno.env only, including ignoring `email_templates.from_address`.
- Meeting links in the 24h confirmation mail now point at the Unicorn audit
  route, not a caller-supplied Teams URL.

## Open questions parked

- `CRON_FUNCTION_JWT` Deno secret may still need to be set to the vault
  `cron_function_jwt` value if that value is not already the service-role
  key. Not verified here (would require reading the vault secret).
- `64329f1f-48e1-4374-8ddf-6e66e42d33de` (`send-test-email` SendGrid copy)
  is still an unauthenticated send surface. MCP cannot update a slug that
  starts with a digit.
- `send-composed-email` / `send-stage-email` remain a separate outbound
  surface and were out of scope.
