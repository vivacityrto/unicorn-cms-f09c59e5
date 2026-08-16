# Audit: 2026-08-15 — cron-invoke-unverified-jwt-bypass

**Trigger:** ad-hoc — authentication bypass in cron-only edge functions
**Scope:** `reconcile-invite-delivery-status` and every other
`supabase/functions/**` path that decoded a JWT payload without verifying
the signature. Did not change RLS, table schema, or non-cron function
auth (HMAC-verified `consume-token`, attachment `atob` in
`capture-outlook-email`).

## Findings

- **`reconcile-invite-delivery-status` (live `verify_jwt=false`, version 47)
  treated a locally-decoded JWT `role === "service_role"` claim as
  authorization.** Anyone who can reach the function URL can mint an
  unsigned/forged three-part JWT with `role=service_role`, `iss=supabase`,
  `ref=<project>`, and a future `exp`, and the function will run as
  service-role against `user_invitations` and Mailgun. The exact
  `SUPABASE_SERVICE_ROLE_KEY` match was a second accepted path; the
  claim-decode path was the bypass.
- **Same unverified-claim pattern, same live `verify_jwt=false`:**
  `sync-outlook-calendar-cron` (v202) and `xero-invoice-sync-all` (v26).
  Both are pg_cron-invoked (`jobid` 11 and 28) via
  `private.cron_function_jwt()`.
- **`bulk-generate-documents-worker` decoded `exp` from the caller JWT
  without verifying the signature (C1).** That is not an entry-gate
  bypass on its own (the worker already required a Bearer-shaped
  `x-caller-authorization` header and used service-role for its own
  writes), but a forged far-future `exp` would skip the near-expiry
  stall. Replaced with `admin.auth.getUser` (reject invalid tokens) plus
  `getClaims` for the verified `exp`.
- **Not a finding (left alone):** `consume-token` uses `atob` on an
  HMAC-signed opaque token *after* `crypto.subtle.verify`.
  `capture-outlook-email` uses `atob` for Mail/Graph attachment bytes.
  `tga-rto-sync`'s `split(".")` walks nested JSON paths, not JWTs.
- **pg_cron job 22** (`reconcile-invite-delivery-status`, `*/20 * * * *`)
  already sends `Authorization: Bearer ` || `private.cron_function_jwt()`.
  That JWT is real, but the function never verified it — it only decoded
  the payload. Option (b) (shared invoke secret) is the better fit for a
  cron-only function: the cron job will send `x-cron-invoke-secret` from
  a new vault helper, and the function constant-time-compares it to
  `Deno.env.get('CRON_INVOKE_SECRET')`.

## KB changes shipped

- no changes

## Code changes (this entry accompanies)

- `supabase/functions/_shared/cron-invoke-auth.ts`: SHA-256 both sides,
  then a fixed 32-byte XOR compare. Fail-closed if the env secret is
  unset.
- `reconcile-invite-delivery-status`, `sync-outlook-calendar-cron`,
  `xero-invoice-sync-all`: deleted the JWT-payload decode path; reject
  every request without a matching `x-cron-invoke-secret`.
- `bulk-generate-documents-worker`: `getUser` + `getClaims`; no local
  `atob` of the caller JWT.
- `supabase/migrations/20260815080000_cron_invoke_secret_header.sql`:
  `private.cron_invoke_secret()` + reschedule jobs 22 / 11 / 28 to send
  the header. **Prepared only — not applied in the same step as a
  function deploy.** Prerequisites: vault secret `cron_invoke_secret`
  and edge secret `CRON_INVOKE_SECRET` must be the same value before
  apply. Safe order: secrets → this migration (old bodies ignore the
  extra header) → deploy the new function bodies.

## Decisions

- Option (b) over option (a) for the three cron-only functions. There is
  no end-user JWT to `getUser` + `check_permission` on a pg_cron tick.
- Keep sending `private.cron_function_jwt()` on `Authorization` so any
  future gateway `verify_jwt=true` flip does not break the jobs; it is
  no longer the in-function gate.
- Do not grant `EXECUTE` on `private.cron_invoke_secret()` to
  `anon` / `authenticated` / `service_role`. `REVOKE ALL FROM PUBLIC`.
  Cron runs as `postgres`, matching `private.cron_function_jwt()`.

## Open questions parked

- Other cron-invoked functions (`generate-notifications`,
  `process-notification-outbox`, `embed-ask-viv-corpus`, …) still rely
  on `private.cron_function_jwt()` plus whatever in-function check they
  already have. They did not decode unverified `role` claims. Rolling
  them onto `x-cron-invoke-secret` is a follow-up, not this fix.
- `CRON_INVOKE_SECRET` / vault `cron_invoke_secret` must be created
  out-of-band (no secrets-set MCP tool). The migration is fail-closed
  if the vault row is missing (header value NULL → function 401).
