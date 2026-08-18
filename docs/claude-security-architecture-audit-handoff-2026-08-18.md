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

1. **`import-unicorn1-client` destructive ordering (N4).** It can delete tenant data before validating the tenant identifier. Validate caller, tenant existence, scope, and authorization before any destructive operation; reject the whole request; audit the action.
2. **Unauthenticated service-role entrypoints (N2/N3).** Gate `import-clickup-csv` and `sync-clickup-tasks`; establish real callers before deployment.
3. **Dormant UUID SendGrid deployment (N1, corrected to Low).** Deployment `64329f1f-48e1-4374-8ddf-6e66e42d33de` was verified in the audit as `verify_jwt=false`, using SendGrid, and publicly callable. The addendum says SendGrid is currently unset, so it is dormant rather than an active relay. Still enumerate all deployed UUID slugs, retire this deployment, confirm no SendGrid references/secrets, and review historical `email_logs` for abuse. No key rotation is required unless a live key is discovered.
4. **Duplicate helper implementations (N10/M5/L8).** Consolidate to one `_shared/requireCaller.ts` and one `_shared/auth-helpers.ts`, deliberately reconcile the role list, update every import, redeploy every bundled function, and add CI that rejects duplicate helper filenames. Do this before adding more call sites.
5. **Remaining email functions (C2).** Gate `send-notification-email`, `send-automated-email`, `send-enhanced-email`, and `send-staff-onboarding-email`; remove caller-controlled sender/URL overrides; escape merge variables; add permission checks and regression tests.

### High-risk carryovers

- `generate-recovery-link` and `invite-to-tenant`: add CORS/role controls, stop logging links or secrets, and validate recipient/role allowlists.
- `set-invite-password` (H6): make invitation tokens single-use/claimed and prevent replay.
- `mailgun-webhook` (H5): fail closed when signing secret is absent, use safe signature comparison, and validate timestamp/replay protection.
- `send-email-graph` and `generate-email-note` (H3): enforce tenant/object authorization before service-role reads; prevent cross-tenant dry-run/content disclosure to external AI services.
- `outlook-auth` and `xero-auth` (H2): bind exchange-code branches to the initiating caller/state and enforce redirect URI allowlists; authorize branches alone are not enough.
- `unlink-email` (H7): fix the broken import and authorization/tenant scoping together; do not repair only the import.

### Notification, cron, and CORS work

- `process-notification-outbox`: reject absolute `deep_link` URLs; do not allow `joinAppUrl` to pass through attacker-supplied absolute URLs.
- `process-notification-outbox`, `process-notification-queue`, `generate-notifications`, and `send-action-item-due-reminders`: propagate the proven cron credential gate using dual-accept rollout, migrate cron callers, then remove the legacy path.
- **#337** adds a cron gate to `schedule-task-reminders`; it is clean but not merged/deployed. It is not a substitute for the four functions above, and its original audit found no verified caller.
- Wildcard CORS remains on most inspected functions. Continue the request-aware allowlist rollout, prioritizing privileged functions.

### Tenant/user mutation and data-scope work

**Update 2026-08-18 (Claude Code session, see
`docs/audit-log/entries/2026-08-18-tenant-user-mutation-hardening.md`):** every item below except
the SharePoint family was re-verified against live deployed source before any change. Three items
in this list were already stale — see strikethrough/annotations.

- ~~`tenant-lifecycle`: restrict suspend/close; caller-supplied tenant IDs need membership
  checks.~~ **Fixed.** Suspend/close now require `checkSuperAdmin`, matching the archive/
  reactivate-from-archived gate already present in the same file. The "membership checks" framing
  did not apply as literally written — Vivacity staff intentionally manage tenants they are not
  members of; the real gap was that `staff.internal` (held by every internal staff role, not just
  Super Admin) was sufficient to suspend/close any tenant.
- ~~`bulk-user-action`: validate role against an allowlist and every target user before applying a
  batch.~~ **Fixed.** Added a runtime `ALLOWED_ROLES` check (the previous allowlist existed only
  as a TypeScript type, not enforced against the actual request body) and an all-or-nothing check
  that every `user_uuids` entry resolves to a real user before any batch action runs.
- ~~`repair-staff-uuids`: super-admin/dry-run/audit, or remove from deployed callable functions and
  run as a controlled one-off migration.~~ **Already resolved — stale finding.** Live source
  (version 289) already gates on Super-Admin-only `admin.system_config.manage`, already supports
  `?dry_run=true` as a read-only path, and already writes `user_uuid_history` before each update.
  No code change was needed.
- `dashboard-test-seed`: **partially fixed.** Was seeding fabricated critical/high-severity risk
  data into "the first 3 active tenants" system-wide with no dedicated seed-tenant concept (no
  such column exists on `tenants`). Now requires an operator-configured `TEST_SEED_TENANT_IDS`
  allowlist and refuses to run without one. Per the standing guardrail against retiring functions
  without owner confirmation, it was hardened rather than removed; whether to retire it outright is
  parked as an open decision for Carl.
- ~~`upload-portal-document`: validate tenant membership before building storage paths.~~ **Already
  resolved — stale finding.** Live source (version 143) already runs `requireCaller` with
  `allowTenantMember` as the tenant-membership fallback before `storage_path` is constructed from
  the caller-supplied `tenant_id`. No code change was needed.
- ~~`delete-user`: add self-deletion and last-admin protections plus an audit row.~~ **Already
  resolved — stale finding, consistent with
  `docs/audit-log/entries/2026-08-17-delete-user-safeguards.md`.** Live source (version 728)
  already rejects self-deletion, rejects removing the last active tenant admin via
  `tenant_members`, and writes the audit row before the irreversible Auth deletion. No code change
  was needed.
- SharePoint family (`upload-sharepoint-file`, `import-sharepoint-template`): **not investigated
  this pass** — out of scope for the 2026-08-18 session. Still needs cross-client folder/tenant
  scoping verification; the #330 governance-folder/name fix does not close these findings by
  itself.

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

