# Audit: 2026-08-18 — import-unicorn1-client destructive ordering + sync-clickup-tasks auth gate

**Trigger:** ADR-driven (continuing the 2026-08-16 architecture/security audit per
`docs/claude-security-architecture-audit-handoff-2026-08-18.md`)
**Scope:** `import-unicorn1-client` (finding N4) and `sync-clickup-tasks`
(findings N2/N3, the other half of the 2026-08-16 ClickUp hardening pass —
`import-clickup-csv` was already fixed and required no further changes here).
Did not touch any other function from the open docket.

## Findings

- **`import-unicorn1-client` (N4, destructive ordering):** `serve()` called
  `clearTenantInstanceData(svcClient, client_id)` — a destructive, tenant-wide
  delete across `package_instances`, `stage_instances`,
  `staff_task_instances`, `client_task_instances`, `email_instances`,
  `document_instances`, `time_entries`, `phase_instances`, and related
  tables — before validating that `client_id` (fully caller-supplied) was a
  real Unicorn 1 client. The only existence check queried
  `[dbo].[Users] WHERE [Discriminator] = 'Client' AND [Id] = @cid`, but it ran
  *inside* the `if (opts.tenant)` branch, after cleanup had already executed.
  A caller with the `admin.migration.unicorn1` permission (Super Admin only,
  gated via `requireCaller`) could pass any numeric `client_id` — valid or
  not — and every tenant's instance data would be wiped before the 404 was
  ever reached; with `import_options.tenant === false` there was no
  validation at all before the destructive delete ran.
- **`sync-clickup-tasks` (N2/N3, unauthenticated service-role entrypoint):**
  had no caller authorization whatsoever — no `requireCaller`, no role check,
  nothing beyond `verify_jwt` at the platform level. Any request bearing a
  valid anon key could trigger `mode: "sync_all"` (a full ClickUp workspace
  pull writing into `clickup_tasks_api`), `mode: "sync_task"`, or
  `mode: "sync_by_tenant"` (which trusts a caller-supplied `tenant_id` and
  overwrites `tenant_id` on existing rows for any tenant it names).
- **`import-clickup-csv`:** re-verified against the 2026-08-16 audit entry —
  already gated on `requireCaller(req, "admin.team_users.manage", "full")`
  (Version A), already column-allowlisted via `pickAllowedClickupColumns`,
  already resolves `tenant_id` server-side from `unicorn_url` rather than the
  payload. No changes needed.
- `_shared/requireCaller.ts` / `_shared/auth-helpers.ts`: no duplicate
  implementations found anywhere under `supabase/functions/**` (checked both
  `_shared/` and per-function directories). The N10/M5/L8 consolidation task
  from the handoff appears already done; not re-actioned here.

## Code changes (this entry accompanies PR — see branch
`worktree-security-audit-unicorn1-clickup`)

- `supabase/functions/import-unicorn1-client/index.ts`: moved the Unicorn 1
  client-existence check to run first and unconditionally (no longer gated
  on `opts.tenant`), before `clearTenantInstanceData`. Added a
  `client_audit_log` insert (`action: "unicorn1_import_cleared"`,
  `entity_type: "tenant"`, `actor_user_id: caller.user.id`, `details:
  { import_options, cleared }`) recording the destructive clear, written
  after the delete and before the success response.
- `supabase/functions/import-unicorn1-client/ordering.test.mjs` (new):
  static source-regression test asserting the validation query precedes the
  clear call, runs unconditionally (not inside `opts.tenant`), the 404 path
  precedes any destructive action, and the audit-log write is present and
  correctly ordered.
- `supabase/functions/sync-clickup-tasks/index.ts`: added
  `requireCaller(req, "admin.team_users.manage", "full")` (Version A, same
  key and rationale as `import-clickup-csv` — no ClickUp-specific
  `permission_features` key exists) immediately after the OPTIONS
  short-circuit and before any mode branch. Replaced the wildcard-adjacent
  `corsHeaders(req)` import with `corsHeadersFor(req)` (APP_BASE_URL
  allowlist) to match the CSV importer's CORS posture.
- `supabase/functions/sync-clickup-tasks/auth-gate.test.mjs` (new): static
  source-regression test asserting the gate is present, runs before every
  mode branch, runs after the OPTIONS short-circuit, and CORS is
  request-aware rather than wildcard.

## Verification

- `node --test supabase/functions/import-unicorn1-client/ordering.test.mjs
  supabase/functions/sync-clickup-tasks/auth-gate.test.mjs` — 8/8 passing.
- No production deploy performed as part of this entry — both functions
  remain on their previously-deployed (vulnerable) versions in production
  until this PR is reviewed and Carl explicitly authorizes
  `deploy_edge_function`. Do not deploy from this entry alone.

## Decisions

- Used the same `admin.team_users.manage` feature key for
  `sync-clickup-tasks` as `import-clickup-csv`, rather than introducing a new
  `permission_features` key, to keep the two ClickUp import surfaces under
  one consistent gate and avoid a migration for this PR.
- Left `clickup-ai-search`, `fetch-clickup-comments`, and `sync-clickup-time`
  unexamined — out of scope for N2/N3, not touched.

## Open questions parked

- `import-unicorn1-client` still has no membership/scope check beyond
  Super-Admin-only `admin.migration.unicorn1` — a Super Admin can target any
  tenant by numeric ID with no allowlist of "tenants currently mid-migration."
  Not part of N4 as scoped in the handoff (which was specifically about
  ordering); flagged here as a possible follow-up, not actioned.
- Dormant UUID SendGrid deployment (`64329f1f-…`), remaining email-function
  gating (C2), and the rest of the open docket in the 2026-08-18 handoff are
  unaddressed by this entry — separate PRs per the handoff's recommended
  execution order.
