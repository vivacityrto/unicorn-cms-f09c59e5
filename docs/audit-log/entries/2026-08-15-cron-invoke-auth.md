# Audit: 2026-08-15 — cron-invoke-auth

**Trigger:** ad-hoc (harden cron-invoked edge functions so they verify the
credential `pg_cron` already sends, instead of trusting `verify_jwt = false`
with no in-function check)
**Author:** Cursor (session run as a cloud agent)
**Scope:** `process-notification-outbox`, `process-notification-queue`,
`generate-notifications`, `send-action-item-due-reminders`, and
`reconcile-invite-delivery-status` (C4). Shared helper
`_shared/cron-auth.ts`. Vault helper `private.cron_invoke_secret()` plus a
separate `cron.job` DML migration. Did not change other HTTP cron targets
(`sync-outlook-calendar-cron`, forecast jobs, Ask Viv embedders, Xero sync)
beyond adding the new header to their job commands so they are ready.

## Findings

- All 15 HTTP `pg_cron` jobs already send `Authorization: Bearer ` ||
  `private.cron_function_jwt()`. The vault secret is a **service_role JWT**
  (`iss=supabase`, `role=service_role`, `ref=yxkgdalkbrriasiyyrwk`) — not a
  user token. `admin.auth.getUser(token)` therefore rejects it.
- `process-notification-outbox`, `generate-notifications` (scheduled
  scopes), and `send-action-item-due-reminders` had no in-function caller
  check. Anyone who could reach the function URL could run them.
- `process-notification-queue` is deployed (`verify_jwt=false`) but was
  missing from git and has **no** cron job. Same unauthenticated surface.
  Checked into the repo with the new gate; no schedule added.
- `reconcile-invite-delivery-status` (C4) already checked Authorization,
  but accepted either an exact `SUPABASE_SERVICE_ROLE_KEY` match **or** any
  three-part JWT whose *unverified* payload claimed `role=service_role`.
  Replaced with the shared constant-time gate.
- `generate-notifications` preview/broadcast already gated on
  `is_super_admin_safe`. That path is unchanged. The scheduled path now
  requires the cron gate, with super-admin accepted alongside so a staff
  caller can still run it manually.
- Live HTTP cron inventory is **15 jobs**, not ~25. Both quoting styles
  (`'Authorization', 'Bearer ' || …` and the compacted job-15 form) are
  covered by the DML migration.

## KB changes shipped

- No changes.

## Code changes (this entry accompanies one)

- `supabase/functions/_shared/cron-auth.ts` — `x-cron-invoke-secret` vs
  `CRON_INVOKE_SECRET` (constant-time), plus a transition compare of the
  Bearer token against `SUPABASE_SERVICE_ROLE_KEY` (the credential cron
  already sends). `ACCEPT_LEGACY_SERVICE_ROLE_JWT` stays true until the
  edge-function secret is confirmed set and the cron DML has landed.
- Affected function bodies call `isCronAuthorized` and return 401.
- `supabase/migrations/20260815080000_cron_invoke_secret_helper.sql` —
  `private.cron_invoke_secret()` (reads vault; secret value created
  out-of-band, never committed).
- `supabase/migrations/20260815080100_cron_jobs_send_invoke_secret.sql` —
  DML on `cron.job`, applied **after** the functions are deployed.

## Decisions

- Introduced `CRON_INVOKE_SECRET` because the cron JWT is not a user token.
- Kept the service_role JWT compare as the transition "old auth" so cron
  does not 401 in the window between function deploy and job-command
  update, and so cron still works if the edge-function env var is not set
  yet.
- Did not treat a successful `auth.getUser` of an arbitrary user JWT as
  sufficient cron auth (that would let any logged-in user fire the
  workers). `getUser` is used only for the generate-notifications
  super-admin-alongside path.

## Open questions parked

- Flip `ACCEPT_LEGACY_SERVICE_ROLE_JWT` to false (and redeploy) once
  `CRON_INVOKE_SECRET` is confirmed present on every affected function
  and all 15 jobs send `x-cron-invoke-secret`.
- Whether `process-notification-queue` should get a cron schedule, or be
  retired — it has no job and no in-repo caller.
- The other HTTP cron targets still do their own (or no) in-function
  auth. They now *send* the secret header; they do not yet *require* it.
