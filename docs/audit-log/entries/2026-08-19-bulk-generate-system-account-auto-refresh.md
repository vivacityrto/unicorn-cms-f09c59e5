# Audit: 2026-08-19 — bulk-generate system-account auto-refresh

**Trigger:** ad-hoc — follow-up to the same-week bulk-generate pagination/stall-visibility
hotfix (PR #370). Carl asked for a real fix to the underlying token-expiry problem, drawing
an analogy to how `xero-invoice-sync-all` auto-refreshes its own OAuth token instead of
requiring a human to re-authenticate.
**Scope:** `bulk-generate-documents-worker` edge function, two new Vault-backed accessor
functions, one new Supabase Auth user + `users` row, one temporary (now neutralized)
provisioning edge function. No RLS/trigger changes to any existing table.

## Findings

- The worker forwarded the initiating staff member's browser JWT (`x-caller-authorization`)
  to every downstream staff-gated call (`repair_package_instance_stages`,
  `deliver-governance-document`, `provision-tenant-sharepoint-folder`,
  `verify-compliance-folder`, `check-tenant-sharepoint-liveness`) for the entire lifetime of
  a job. Since that token expires in ~1 hour, any job that ran longer stalled with
  `stalled_reason='jwt_near_expiry'` and needed a human to manually retry — several
  production jobs had sat stalled for 800+ hours (see PR #370's investigation).
- Confirmed via `pg_get_functiondef` that `repair_package_instance_stages` gates on
  `is_vivacity_team_safe(auth.uid())` **unconditionally** (no `auth.uid() IS NOT NULL AND`
  guard, unlike the already-fixed `stall_bulk_document_job`/`retry_bulk_document_job`) — this
  is exactly why the worker's own code comment said service_role was unsafe there. A real
  Supabase Auth user resolves `auth.uid()` correctly, so a dedicated system account (not
  service_role) satisfies this gate with zero RPC changes.
- Confirmed via `role_permissions` that `staff.sharepoint.use` and `staff.documents.generate`
  (the two feature keys gating the other four downstream calls) are both granted at `full`
  level to the **Team Member** role — the least-privileged internal role — so the system
  account needed no elevated role at all.
- `private.*` functions (the existing `cron_function_jwt`/`cron_invoke_secret` pattern) are
  never reachable via PostgREST `.rpc()` — confirmed by grepping every call site; they are
  only ever referenced from inside SQL (e.g. a `cron.job` command string). First attempt at
  `get_bulk_generate_system_session`/`set_bulk_generate_system_session` in `private` schema
  had to be corrected to `public` schema (still `service_role`-only via REVOKE/GRANT — no
  `anon`/`authenticated` grant) so the edge function could actually call them.

## Design

- New system Supabase Auth user `bulk-generate-automation@vivacity.com.au` — `unicorn_role`
  = `Team Member`, `is_vivacity_internal = true`, `user_type = 'Vivacity Team'`. Created via a
  one-time provisioning edge function (`bootstrap-bulk-generate-system-account`), gated by
  `requireSuperAdmin`, invoked once by Carl from his own authenticated browser session (the
  actual `admin.auth.admin.createUser` call and the invocation of it were both blocked by the
  Claude Code auto-mode classifier as production-auth-mutating actions and required Carl's
  explicit approval at each step — the account was never created or invoked without his
  direct sign-off). The function has since been redeployed as an inert 410 stub; no password
  or token was ever returned in any response or logged.
- Session storage: two `public` schema, `SECURITY DEFINER`, `service_role`-only functions
  (`get_bulk_generate_system_session` / `set_bulk_generate_system_session`) backed by
  Supabase Vault, mirroring the existing `private.cron_function_jwt()` pattern but in
  `public` schema (see Findings) and *rotated* rather than static — `set_...` self-bootstraps
  the vault secret on first call, updates it thereafter. Same refresh-on-near-expiry shape as
  `xero-invoice-sync-all`'s own OAuth-token refresh.
- Worker change: `getSystemAuthHeader()` reads the stored session, refreshes it via
  `supabase.auth.refreshSession()` when within 2 minutes of `expires_at`, and persists the
  rotated pair back. All five staff-gated downstream calls now use this system-account token
  instead of the forwarded human JWT. `x-caller-authorization` is still required to be
  structurally present (light sanity check) but is no longer validated against Supabase Auth
  and no longer drives any stall — `stall_bulk_document_job` is now only called on
  `'system_account_auth_failed'` (the system account's own session couldn't be obtained or
  refreshed), which should be rare, rather than on every job crossing the ~1hr mark.
- Refresh-race handling: since the session is shared across every concurrent invocation of
  the worker (one per active job) and Supabase rotates refresh tokens on use, a losing
  refresh attempt re-reads the stored session once and uses whatever the concurrent winner
  already stored, instead of failing the run.

## Code changes

- `supabase/migrations/20260819012224_bulk_generate_system_session_vault_accessors.sql` —
  first attempt, `private` schema (superseded immediately below).
- `supabase/migrations/20260819012340_bulk_generate_system_session_public_accessors.sql` —
  correction to `public` schema, `service_role`-only grants.
- `supabase/functions/bulk-generate-documents-worker/index.ts` — system-account auth
  throughout; `jwt_near_expiry` stall path removed; `system_account_auth_failed` stall path
  added. Deployed as version 132.
- `supabase/functions/bootstrap-bulk-generate-system-account/index.ts` — one-time
  provisioning function, now neutralized (410 stub). Deployed versions 1 (live) → 2
  (neutralized).
- `src/components/documents/bulk-generate/errorCodeLabel.ts` — `stalledReasonLabel` gained a
  case for `system_account_auth_failed`.

## Decisions

- Chose a dedicated system Auth user over (a) modifying `retry_bulk_document_job`/
  `stall_bulk_document_job` to accept a service-role bypass, or (b) forwarding the human's
  refresh token to the worker. (a) would have required changing security-sensitive RPCs
  flagged with an explicit do-not-touch safety note; (b) risked rotating/invalidating the
  staff member's own live browser session out from under them. The system-account approach
  needed zero changes to any existing permission gate.
- Granted `Team Member` rather than `Super Admin` — confirmed via `role_permissions` that
  `Team Member` already has full access to both feature keys the worker needs, so there was
  no reason to grant more.

## Open questions parked

- No automated test/dry-run of a genuinely multi-hour job was performed (no realistic way to
  simulate one in this environment); correctness rests on manual code review plus the fact
  that `npm run build` and the migration/grant checks (`has_function_privilege`) all passed.
  Worth watching the next real multi-hour job in production.
- The bootstrap function's slug remains registered (no `delete_edge_function` tool available)
  as an inert 410 stub rather than being fully removed.
