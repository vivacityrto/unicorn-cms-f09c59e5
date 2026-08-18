# Claude handoff — Unicorn architecture and security audit

**Handoff date:** 2026-08-18  
**Repository:** `vivacityrto/unicorn-cms-f09c59e5`  
**Production Supabase project:** `yxkgdalkbrriasiyyrwk`  
**Purpose:** Baseline for continuing the architecture/security remediation after the 16 August audit.

## How to use this handoff

This is a status handoff, not a replacement for the original audit. The source audit was the read-only report generated 16 August 2026, comparing against the 15 August baseline and its addendum. Re-verify every production claim before changing production. Do not infer that a function is safe or unused from a frontend grep alone; inspect deployed function inventory, database callers/triggers, cron jobs, logs, and operator ownership.

Repository process rules remain authoritative in `AGENTS.md`:

- Work in an isolated worktree; never switch the shared checkout underneath another tool.
- Never push directly to `main`, force-push, or amend pushed commits.
- Every production schema/function change must have a source-controlled PR. Schema/RLS/grant/trigger changes also need an audit-log entry.
- Deploy Supabase migrations and Edge Functions through the configured Supabase MCP tools, then verify deployed source and grants.
- Do not retire an Edge Function on the basis of no repository callers or a short quiet-log window; obtain owner/operator confirmation or adequate telemetry.

## Original audit baseline

The 16 August report was report-only; it changed nothing. It reviewed 61 of approximately 220 Edge Functions, compared production against the 15 August audit, and inspected database advisors, RLS, views, cron, storage, helper functions, and selected deployed source.

The report initially listed 36 findings as 4 Critical, 12 High, 11 Medium, and 9 Low. Its addendum corrected the N1 severity and the reliable corrected mix is **3 Critical, 12 High, 11 Medium, 10 Low (36 total)**. The report contains an internal bookkeeping inconsistency; use the addendum-corrected total.

The report's central conclusion was: **11 of 26 re-checked function/defect pairs fixed, 5 partially fixed, and 10 not fixed.** Baseline findings were 7 fully fixed, 6 partial, 13 unchanged, and 2 not re-checked/superseded.

### Findings verified fixed in the original report

- **C1:** `bulk-generate-documents-worker`, `provision-tenant-sharepoint-folder`, and `generate-staff-checklist` now use real caller/secret authorization and fail closed.
- **C3:** `update-user-profile` uses an allowlisted column set and caller JWT/RLS context.
- **C4:** `reconcile-invite-delivery-status` uses cron authorization and constant-time comparison rather than trusting a service-role JWT payload.
- **H1:** `send-email` and Mailgun URL construction no longer accept caller-controlled base/redirect URLs.
- **H4:** `v_stage_health_latest` uses `security_invoker`; anonymous access was revoked.
- **M3:** `capture-outlook-email` checks tenant access before writing.
- **L1:** Five genuinely inert functions were replaced by 410 stubs.
- `send-mailgun-template` is the model implementation: caller-gated, server-built URLs, escaped merge variables, and explicit rejection of `fromOverride`.
- Named `send-test-email` is super-admin gated and preview-only; it does not call a mail provider.
- Duplicate `is_super_admin` overloads were consolidated and its `search_path` was hardened.

### Security posture the report found solid

- 650/650 public base tables had RLS enabled.
- No world-open permissive policy was found on PII or storage tables.
- All anonymous-readable views had `security_invoker=true` after the view fix.
- pg_cron jobs were postgres-owned, HTTP jobs used the private JWT helper, and anonymous/authenticated schema usage remained denied.
- Internal onboarding storage remained private and permission-gated.
- Zero ERROR-level security advisor findings remained.

## Work completed after the original report

These changes are now merged or deployed and should be treated as completed, subject to normal post-deploy verification:

- **#327:** Academy thumbnail-backfill CORS hardening; merged.
- **#330:** TGA/legal-name and SharePoint governance-folder synchronization fix for tenant 7523; merged and deployed.
- **#333:** Revoked anonymous/authenticated execution of the cron secret helper; service-role-only grant verified.
- **#334:** Vimeo replacement/backfill hardening; merged. Do not retire the UI-wired duration workflow without owner confirmation.
- **#335:** Revoked anonymous execution of `fn_package_used_minutes`; authenticated/service-role compatibility retained pending ownership review.
- **#336:** Revoked anonymous execution of `get_academy_facilitator_names_safe`; authenticated Academy UI caller retained.
- **#338:** Forwarded the verified caller `Authorization` header into `get-email-status` and `report-delivery-issue`; merged. This fixes their Super-Admin RLS context but has not yet been deployed to production.
- Earlier CORS hardening for `test-mailgun` and related deployed functions was source- and production-verified.

## Current open docket

### Highest-priority security work

1. ~~**`import-unicorn1-client` destructive ordering (N4).**~~ **Fixed in source, not yet deployed** (2026-08-18, PR #341, `docs/audit-log/entries/2026-08-18-import-unicorn1-destructive-ordering-and-clickup-sync-gate.md`). Validation now runs first and unconditionally, before the destructive clear; the clear is recorded in `client_audit_log`. Production still runs the pre-fix version until deployed with explicit authorization.
2. ~~**Unauthenticated service-role entrypoints (N2/N3).**~~ **`sync-clickup-tasks` fixed in source, not yet deployed** (same PR #341) — gated on `requireCaller` + request-aware CORS. `import-clickup-csv` re-verified live as already correctly hardened (2026-08-16 entry); no changes needed.
3. **Dormant UUID SendGrid deployment (N1, corrected to Low) — RESOLVED, verified live 2026-08-18.** Independently re-confirmed via `list_edge_functions`/`get_edge_function` (not just trusting the audit-log entry): only 3 UUID-slug functions remain (`dcd6c745`, `c22daa64`, `e77f4567`), all three are 410 retirement stubs with no service-role key or SendGrid client in their source. `64329f1f` and `61429ee4` are gone entirely — a direct lookup would 404. Matches the 2026-08-16 entry's "Remediation completed 17 Aug 2026" note. Nothing further needed here.
4. **Duplicate helper implementations (N10/M5/L8) — appears already done, CI gap remains.** Re-checked 2026-08-18: no duplicate `requireCaller*`/`auth-helpers*` files found anywhere under `supabase/functions/**`. Still missing: CI that rejects duplicate helper filenames going forward.
5. ~~**Remaining email functions (C2).**~~ **RESOLVED, verified live 2026-08-18.** Pulled deployed source for all four (`send-notification-email`, `send-automated-email`, `send-enhanced-email`, `send-staff-onboarding-email`) via `get_edge_function` — all four are gated (`requireInternalEmailSecret` for the two cron/internal ones, `requireCaller(..., "admin.team_users.manage", "full")` for the other two), reject caller-controlled From overrides, and HTML-escape merge fields. This item in the handoff was stale relative to the 2026-08-15 "Outbound email surface hardened" audit entry, which was accurate. No changes needed.

### High-risk carryovers

- ~~`generate-recovery-link` and `invite-to-tenant`: add CORS/role controls, stop logging links or secrets, and validate recipient/role allowlists.~~ **`invite-to-tenant` fixed in source, not yet deployed** (2026-08-18, separate PR, `docs/audit-log/entries/2026-08-18-invite-to-tenant-role-allowlist.md`) — added the same `CLIENT_ROLES` allowlist `invite-user` uses (the tenant-admin auth path had no ceiling on `role`, so a tenant Admin could request `role: "Super Admin"`), fixed `corsHeaders` being used as a static object instead of called with `(req)`, stopped logging the plaintext invite link/token. **Also found:** the DB trigger meant to backstop this (`enforce_invitation_role_ceiling`) unconditionally exempts `service_role`-authenticated inserts, which is how every edge function writes to `user_invitations` — so it provides no real protection for either `invite-user` or `invite-to-tenant` today; flagged as a follow-up (needs its own migration/PR/audit entry), not fixed. `generate-recovery-link` re-verified as already compliant — no changes needed.
- `set-invite-password` (H6): re-verified live 2026-08-18 — `used_at` claim-on-row-count pattern present, matches the 2026-08-15 entry. No changes needed.
- `mailgun-webhook` (H5): re-verified live 2026-08-18 — fails closed when `MAILGUN_WEBHOOK_SIGNING_KEY` is unset, verifies signature and timestamp freshness before processing. No changes needed.
- `send-email-graph` and `generate-email-note` (H3): re-verified live 2026-08-18 — `has_tenant_access_safe` gate present in `send-email-graph`; `generate-email-note` reads `email_messages` via the ANON-key/caller-JWT client before any service-role use. No changes needed.
- ~~`outlook-auth` and `xero-auth` (H2)~~ **Verified resolved 2026-08-18** — independently re-checked `xero-auth` against the three properties the 2026-08-15 fix established: env-derived `resolveRedirectUri` allowlist, `exchange-code` binding via `consumeOAuthState(supabaseAdmin, state, caller.user.id)` (asserts `caller.id === oauth_states.user_id`), and atomic single-use `consumed_at` claim. Both functions share `_shared/oauth-redirects.ts` and `_shared/oauth-states.ts`, so this was one shared-helper fix, not per-function; live-deployed source (v64) matches repo. See `docs/audit-log/entries/2026-08-18-sharepoint-import-drive-scoping.md`. No further action.
- `unlink-email` (H7): re-verified live 2026-08-18 — `clients.emails.manage` feature key, `unlinked_at` soft-delete pattern present. No changes needed.

### Notification, cron, and CORS work

- ~~`process-notification-outbox`: reject absolute `deep_link` URLs; do not allow `joinAppUrl` to pass through attacker-supplied absolute URLs.~~ **Fixed 2026-08-18** (see `docs/audit-log/entries/2026-08-18-notification-cron-hardening-verification.md`). Confirmed real via live source: `joinAppUrl` (`_shared/app-base-url-parse.ts`) returned any `https?://`-prefixed `path` unchanged, and `process-notification-outbox` passes caller-controlled `payload.deep_link` (from the unauthenticated-payload-validation `emit_notification` RPC, callable by any authenticated user) straight into it to build the Teams "Open in Unicorn" link. `joinAppUrl` now always anchors its result to the app's own origin; regression tests added (Deno `app-base-url_test.ts` + `node:test` `app-base-url-open-redirect.test.mjs`, both passing).
- ~~`process-notification-outbox`, `process-notification-queue`, `generate-notifications`, and `send-action-item-due-reminders`: propagate the proven cron credential gate using dual-accept rollout, migrate cron callers, then remove the legacy path.~~ **Already done — this line was stale.** Verified 2026-08-18 against both repo source and live deployed source (`mcp__supabase__get_edge_function`, byte-identical): all four already import and call `isCronAuthorized`/`cronUnauthorizedResponse` from `_shared/cron-auth.ts` — the same `x-cron-invoke-secret`/`CRON_INVOKE_SECRET` constant-time gate, not a decoded-but-unverified JWT claim. The dual-accept legacy JWT path (`ACCEPT_LEGACY_SERVICE_ROLE_JWT`) is still `true` in the shared helper — flipping it to `false` once every cron job sends the dedicated header remains a genuine follow-up, but the gate itself is in place on all four functions.
- **Corrected 2026-08-18:** #337 is **merged and deployed**, not "clean but not merged/deployed". `gh pr view 337` shows `state: MERGED`, `mergedAt: 2026-08-17T23:30:00Z`; live deployed source (v88) is the `410 Gone` retirement stub per Carl's decision (see `docs/audit-log/entries/2026-08-17-schedule-task-reminders-cron-auth.md`, "Retirement" section), superseding the earlier v87 cron-gate-only deploy this line seems to describe.
- ~~Wildcard CORS remains on most inspected functions.~~ **Not re-verified repo-wide in this pass** (out of scope — a full CORS sweep was explicitly not attempted here). For the four notification functions above specifically: already the request-aware allowlist (`corsHeaders(req)` from `_shared/cors.ts`), confirmed in both repo and live source — no wildcard CORS found on any of them. The general "continue the rollout, prioritize privileged functions" recommendation still stands for the rest of the ~114 uninspected functions.

### Tenant/user mutation and data-scope work

Remediate with membership/assignment checks, explicit permission keys, all-or-nothing validation, and audit rows:

- `tenant-lifecycle`: restrict suspend/close; caller-supplied tenant IDs need membership checks.
- `bulk-user-action`: validate role against an allowlist and every target user before applying a batch.
- `repair-staff-uuids`: super-admin/dry-run/audit, or remove from deployed callable functions and run as a controlled one-off migration.
- `dashboard-test-seed`: remove from production or scope cleanup to a dedicated seed tenant.
- `upload-portal-document`: validate tenant membership before building storage paths.
- `delete-user`: add self-deletion and last-admin protections plus an audit row.
- SharePoint family (`upload-sharepoint-file`, `import-sharepoint-template`): **investigated and actioned 2026-08-18.** `upload-sharepoint-file` was verified already correctly scoped — tenant id comes from the caller's own `users.tenant_id` row (a non-Super-Admin's requested override is ignored), and the parent-folder target is verified within the tenant's root via `verifyWithinRoot`; no code change needed. `import-sharepoint-template`'s `import` action had a real, previously-unfixed gap: it trusted a caller-supplied `source_drive_id`/`source_item_id` for the Graph fetch with no check that the drive was the configured Master Documents site (unlike `handleBrowse`/`computeDrift`, which resolve it server-side) — fixed by adding that check via a new shared `resolveMasterDriveId` helper, with a regression test; not yet deployed. See `docs/audit-log/entries/2026-08-18-sharepoint-import-drive-scoping.md`.

### Governance/config/database maintenance

- Reduce/justify the 15-of-28 super-admin concentration and require MFA; record the governance decision.
- Decide whether all internal staff may read personal user contact fields or restrict them to `admin.team_users.manage`; document the decision.
- Patch the Supabase Postgres version (`supabase-postgres-15.8.1.085` was still outstanding in the audit).
- Reduce Auth OTP expiry to one hour or less; this is a console configuration task, not a migration.
- Reconcile `verify_jwt` deployment state with `config.toml` for all functions and add CI drift detection.
- Move `pg_net` out of `public` in a maintenance window; 15 cron HTTP jobs depend on it.
- Review/revoke cosmetic `cron.job` grants where safe.
- Harden remaining `SECURITY DEFINER` helpers' `search_path`, starting with `is_super_admin_safe`, then `current_user_email`, `has_tenant_admin_safe`, `is_tenant_parent_safe`, and `app.is_super_admin`.
- Clean up deny-all RLS scratch/backfill tables after confirming they are no longer needed.
- Make the final compare in `cron_presented_secret_matches` constant-time; its service-role guard currently makes exploitation unlikely but does not remove the code-quality issue.
- Keep performance advisor work (`auth_rls_initplan`, multiple permissive policies, unused indexes/FKs) as a separate workstream.

## Workflow-retirement guardrails

- **Do not merge #323** retiring `assign-package-to-tenant`. Evidence shows tracked UI uses `start_client_package`, but external/manual callers have not been ruled out; the legacy `add_package_to_tenant` compatibility path still mutates old package fields.
- **Do not merge #324** retiring Vimeo duration backfill solely on the absence of repository callers. The function is still wired into the UI workflow; confirm the live caller/owner first.
- **#339** is a duplicate of merged #338 and should be closed to prevent drift; do not merge both.
- Never infer that `unicorn-data-import`, ClickUp mocks, or other UUID deployments are safe to delete solely from a grep or 24-hour log window.

## Coverage gap and next audit

Approximately 114 of 220 Edge Functions remained uninspected across the two audits. The 27-function sample produced two Critical and four High findings, and N5/N6 were missed even though those functions had been read for a different defect class. The next audit must:

1. Enumerate every deployed function programmatically, including UUID slugs and duplicate names.
2. Compare deployed state to source/configuration.
3. Inspect the remaining functions and re-read previously inspected functions for credential handling, authorization, tenant scoping, logging, CORS, redirect URLs, and destructive ordering—not just JWT/redirect defects.
4. Re-query database callers, triggers, cron jobs, policies, grants, logs, and secrets before every retirement or privilege change.
5. Record each remediation and post-deploy verification in a PR and audit-log entry.

## Recommended execution order

1. Fix `import-unicorn1-client` and gate the two unauthenticated ClickUp service-role functions.
2. Enumerate and retire dormant UUID/SendGrid deployments.
3. Consolidate shared authorization helpers.
4. Finish the remaining email functions and deploy/verify merged #338 after ownership confirmation.
5. Fix invite-token replay, webhook fail-open behavior, graph/note IDORs, and OAuth exchange branches.
6. Propagate cron auth and reject absolute notification URLs.
7. Remediate tenant/user mutation functions and SharePoint scoping.
8. Complete CORS allowlisting, config drift detection, Postgres/OTP maintenance, helper search-path cleanup, and governance decisions.
9. Run the full remaining-function audit and publish a closure report with evidence for every finding.

## Handoff status

The architecture/security audit is **not closed**. Foundational RLS and several major auth fixes are solid, but the remaining risk is concentrated in uninspected Edge Functions, destructive imports, unauthenticated service-role entrypoints, legacy email relays, duplicated authorization helpers, incomplete cron/OAuth/token protections, and unresolved governance decisions.

