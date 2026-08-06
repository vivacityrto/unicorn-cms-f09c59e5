# Audit: 2026-08-06 — cursor-agent security migrations reconciliation

**Trigger:** ad-hoc
**Scope:** Verified and applied six Cursor-agent-authored security-hardening
PRs (#166, #171–176) that Angela merged to `unicorn-cms-f09c59e5` on
2026-08-05. Did not look at anything outside these six PRs' migrations and
edge-function changes.

## Findings
- None of the six PRs' underlying changes had actually reached prod despite
  merging to `main`. Five were SQL migrations that never ran — confirmed via
  `supabase_migrations.schema_migrations`, live `pg_extension` state, the
  security advisor, and direct policy/grant inspection. The sixth (#174,
  `APP_BASE_URL` fallback standardisation) is an edge-function change that
  deployed independently via Lovable's own sync path; confirmed live and
  matching git exactly.
- Root cause: `.github/workflows/deploy-supabase.yml`'s `supabase db push`
  step has been failing on every push to `main` since at least 2026-08-04,
  due to migration-history drift between git and the remote's
  `schema_migrations` table. Pre-existing, unrelated to these six PRs — not
  remediated in this session (separate follow-up).
- #172 (`security_invoker=true` on three views) would have broken
  production if applied as originally written. `v_client_tenant_users`
  lateral-joins `auth.sessions` to compute `last_active_at`;
  `security_invoker=true` switches ordinary table-GRANT checks to the
  invoking role too (not just RLS), and `authenticated`/`anon` hold no
  grant on `auth.sessions`. Reproduced live in a rolled-back
  `SET LOCAL ROLE authenticated` transaction: `permission denied for table
  sessions`, for every caller including superadmin. Would have broken the
  tenant team-roster tab (`use-client-tenant-users.ts` / `TenantUsersTab`)
  outright — same failure shape as the 2026-07-22 invite-link incident
  (`audit/2026-07-22-restore-invite-validation-anon-grant.md`): an
  authorization-tightening change that didn't enumerate every real caller.
- #171 (cron.job `PUBLIC` SELECT revoke) and #173/#176 (pg_net relocation)
  are both structurally blocked at the `postgres` role's privilege level on
  this project. The grant and the extension are both owned by
  `supabase_admin` (a real superuser); `postgres` is neither its owner nor
  a member of it, so neither the `REVOKE` nor the `extrelocatable` flip
  fallback can execute via any SQL-based path (CLI, MCP, migration). Both
  migrations' own self-checks correctly detected this and aborted cleanly
  (transactional, no partial state) rather than silently half-applying.
- #173 and #176 were not true duplicates as the PR summary described.
  #173's migration (`20260805051132`) has a `feature_not_supported`
  exception handler with an `extrelocatable` flip fallback; #176's
  (`20260805051457`) lacks it. Kept #173's more complete version in git,
  removed #176's.

## KB changes shipped
- no changes

## Codebase observations (read-only → became a hotfix)
- unicorn-cms-f09c59e5 @ e9008d7b (main, pre-hotfix): six PRs merged
  2026-08-05, five migrations unapplied as described above.
- unicorn-cms-f09c59e5 @ 70048a6d (branch
  `hotfix/security-migrations-apply-and-defer-view-fix`, PR #184, not yet
  merged): reconciled migration files with what was actually applied to
  prod — trimmed #172 to exclude `v_client_tenant_users`, corrected the
  #173/#176 duplicate resolution, and documented the #171/#173/#176
  privilege blockers inline in the migration files themselves.

## Decisions
- Applied #166 (`user_invitations` RESTRICTIVE policy) and #175
  (`academy-thumbnails` admin-scoped list policy) to prod as written —
  verified safe before applying.
- Applied #172 partially: `security_invoker=true` on `v_package_burndown`
  and `v_academy_lesson_outline` only, both verified safe via a
  rolled-back dry-run (no permission errors as `authenticated`; row counts
  87 and 703 confirmed post-change). `v_client_tenant_users` deliberately
  deferred — needs the `auth.sessions` lookup wrapped in a `SECURITY
  DEFINER` helper (matching the existing `wrap_executive_strategic_views_in_rpc`
  pattern) plus dedicated QA with a real tenant-admin account before it can
  ship safely. The underlying advisor finding (security_definer_view) stays
  open for this one view.
- Did not apply #171 or #173/#176 — blocked on privilege, not correctness.
  Needs Supabase Support or Dashboard-level (`supabase_admin`) access.
  Lower urgency than the advisor findings imply for #171 specifically:
  `cron` is not in this project's PostgREST exposed-schema list, so the
  leftover `PUBLIC` grant isn't reachable via the REST API today.
- Did not attempt to fix the underlying `supabase db push` CI drift
  (~90 migrations' worth of history mismatch between git and remote) —
  out of scope for this session.

## Open questions parked
- Who/how do we get `supabase_admin`-level access to finish #171 and
  #173/#176 — Supabase Support ticket, or does the Dashboard have a path
  that doesn't require it?
- `v_client_tenant_users` fix (wrap the `auth.sessions` lookup in a
  `SECURITY DEFINER` helper) — not yet scheduled.
- The `supabase db push` CI pipeline has been broken for at least 2+ days.
  Any migration merged via git hotfix during that window won't auto-deploy
  silently. Needs its own remediation session.

## Tag
audit-2026-08-06-cursor-security-migrations-reconciliation
