# Audit: 2026-08-18 — tenant/user mutation and data-scope hardening

**Trigger:** ad-hoc — continuation of the 16 August architecture/security audit, working the
"Tenant/user mutation and data-scope work" docket item in
`docs/claude-security-architecture-audit-handoff-2026-08-18.md`.
**Scope:** `tenant-lifecycle`, `bulk-user-action`, `repair-staff-uuids`, `dashboard-test-seed`,
`upload-portal-document`, `delete-user`. Did not touch the SharePoint family
(`upload-sharepoint-file`, `import-sharepoint-template`) — out of scope for this pass.

The 18 August handoff was itself stale in several places for this docket item. Every function
below was re-verified against both the repo source and the live deployed source
(`mcp__supabase__get_edge_function`) before any change was made, and against
`docs/audit-log/INDEX.md` / `entries/` for prior fixes covering the same function.

## Findings

- **`tenant-lifecycle` (real, fixed).** Repo `supabase/functions/tenant-lifecycle/index.ts` and
  the live deployment (version 451, sha256 `18d1c7c5…`) were byte-identical. `suspend` and
  `close` were gated only by `requireCaller({ featureKey: FeatureKeys.staffInternal })`.
  `role_permissions` shows `staff.internal` at `full` level is granted to **every** internal
  role — BGT, CET, CSC, Integrator, Super Admin, Team Leader, Team Member — not just Super
  Admin. The same file already requires `checkSuperAdmin(profile)` for `archive` and for
  reactivating an archived tenant (lines 118–128 pre-fix), so suspend/close — equally
  destructive, cutting off a client's production access — were a full tier looser than their
  siblings in the same handler. This matches the handoff's "restrict suspend/close" finding;
  the "caller-supplied tenant IDs need membership checks" half does not apply as literally
  written — Vivacity staff must manage tenants they are not members of by design (confirmed via
  `has_tenant_access_safe`, which already treats all Vivacity Team roles as tenant-agnostic), so
  the real gap was the missing SuperAdmin tier, not tenant membership.
- **`bulk-user-action` (real, fixed).** Repo and live deployment (version 561) were identical.
  `change_role` typed `role` as `'Admin' | 'General User'` in TypeScript only — the request body
  is untyped JSON at runtime, so any string accepted by the `users.unicorn_role` FK (confirmed:
  it is now a `text NOT NULL` FK-backed column, not a closed enum, per the 2026-05 enum-to-`dd_`
  migration series) would be written verbatim, including internal-staff-only values like
  `"Super Admin"` or `"Team Leader"`. `admin.team_users.manage` is Super-Admin-only per
  `role_permissions`, so this was not an external privilege-escalation path, but it was a
  defense-in-depth gap: this endpoint manages *client tenant users*, and nothing stopped a
  client user from being promoted into an internal staff role covering every tenant, whether by
  a UI bug, a compromised Super Admin session, or operator error. Separately, the batch update
  used `.update(...).in("user_uuid", user_uuids)` with no upfront check that every UUID in the
  batch resolved to a real user — a batch containing a typo'd or already-deleted UUID would
  silently apply to the rows that did match and report success without surfacing which targets
  were skipped.
- **`repair-staff-uuids` (verified resolved, no change).** Live deployment (version 289) matches
  the repo exactly. Already gated on `FeatureKeys.adminSystemConfig` (`admin.system_config.manage`
  is Super-Admin-only per `role_permissions`), already supports `?dry_run=true` (read-only path,
  no writes), and already writes to `user_uuid_history` before each `users.user_uuid` update. This
  fully satisfies the handoff's "super-admin/dry-run/audit" remediation; no code change made.
- **`dashboard-test-seed` (real, fixed).** Live deployment (version 452) matches the repo. Gated
  on `FeatureKeys.adminTestingSeed` (Super-Admin-only per `role_permissions`), but
  `seed_test_states` selected "the first 3 active tenants" system-wide with no dedicated
  seed-tenant concept — confirmed via schema inspection that `tenants` has no test/seed/demo
  flag column. It then inserted fabricated critical/high-severity `risk_events`,
  `real_time_risk_alerts`, and stale `notes` into whichever 3 tenants that query happened to
  return, which could be real client tenants, corrupting their live compliance dashboards.
- **`upload-portal-document` (verified resolved, no change).** Live deployment (version 143)
  matches the repo. `requireCaller` already runs — with `allowTenantMember` as the `orAllow`
  fallback for the `client_to_vivacity` direction — before `storage_path` is constructed from the
  caller-supplied `tenant_id`. Tenant membership is verified before any path is built or any file
  is uploaded. No code change made.
- **`delete-user` (verified resolved, no change).** Live deployment (version 728) matches the
  repo, and matches the fix already recorded in
  `docs/audit-log/entries/2026-08-17-delete-user-safeguards.md`: self-deletion is rejected,
  removing the last active tenant `admin` (via `tenant_members`, not the legacy profile role) is
  rejected, and the `audit_eos_events` row is written and checked for failure *before* the
  irreversible `auth.admin.deleteUser` call. No code change made.

## Code changes

- `supabase/functions/tenant-lifecycle/index.ts`: `suspend` and `close` now require
  `checkSuperAdmin(profile)`, matching the existing `archive` / reactivate-from-archived gate in
  the same file. Regression test:
  `supabase/functions/tenant-lifecycle/suspend-close-superadmin.test.mjs`.
- `supabase/functions/bulk-user-action/index.ts`: added a runtime `ALLOWED_ROLES` allowlist
  (`Admin`, `General User`) enforced before any `change_role` update, and an all-or-nothing check
  that every `user_uuids` entry resolves to a real user before `activate` / `deactivate` /
  `change_role` runs. Regression test:
  `supabase/functions/bulk-user-action/allowlist-and-batch.test.mjs`.
- `supabase/functions/dashboard-test-seed/index.ts`: `seed_test_states` now requires an
  operator-configured `TEST_SEED_TENANT_IDS` env var (comma-separated tenant IDs) with at least 3
  entries, and restricts the tenant query to that allowlist instead of "first 3 active tenants"
  system-wide. Regression test:
  `supabase/functions/dashboard-test-seed/seed-tenant-scope.test.mjs`.

## Decisions

- Suspend/close in `tenant-lifecycle` now require the same SuperAdmin tier as archive/reactivate
  in the same file, rather than inventing a new intermediate permission tier. This is a minimal,
  scoped fix consistent with the file's existing pattern.
- `dashboard-test-seed`'s scope fix uses an env var allowlist rather than a schema migration
  (`tenants` has no seed/test flag column today). No migration was made as part of this change.

## Open questions parked

- **`dashboard-test-seed` retirement.** Per the standing guardrail ("do not retire an Edge
  Function on the basis of no repository callers or a short quiet-log window"), this function was
  hardened, not retired or removed from the deployed function set. Whether it should be retired
  outright (replaced by a fixture-seeding script run outside the deployed function set) or kept
  with a permanently-configured `TEST_SEED_TENANT_IDS` pointing at dedicated non-production
  tenants is a product/ops decision for Carl, not something this change makes.
- **`TEST_SEED_TENANT_IDS` provisioning.** No value is set yet in the hosted Supabase project as
  part of this change (no deploy was made — see below). Until it is set, `seed_test_states` will
  refuse to run, which is the intended fail-closed behaviour, but it means the endpoint is
  currently non-functional until an operator designates real seed tenant IDs.
- The handoff's SharePoint family bullet (`upload-sharepoint-file`, `import-sharepoint-template`)
  was explicitly out of scope for this pass and was not investigated.

## Deployment status

**Not deployed.** This is a source-controlled PR only, per the standing default (no
`deploy_edge_function` / `apply_migration` calls were made). All three changed functions
(`tenant-lifecycle`, `bulk-user-action`, `dashboard-test-seed`) remain on their current live
versions (451, 561, 452 respectively) pending review and an explicit deploy decision.

## Verification run this session

- `node --test supabase/functions/tenant-lifecycle/suspend-close-superadmin.test.mjs` — pass
- `node --test supabase/functions/tenant-lifecycle/response-context.test.mjs` — pass (pre-existing,
  confirms no regression)
- `node --test supabase/functions/bulk-user-action/allowlist-and-batch.test.mjs` — pass
- `node --test supabase/functions/dashboard-test-seed/seed-tenant-scope.test.mjs` — pass
- `node --test supabase/functions/delete-user/safeguards.test.mjs` — pass (pre-existing, confirms
  `delete-user` needed no change)
- `npx tsc --noEmit` — clean
