# Audit: 2026-08-06 — client-tenant-users RPC fix and cron.job deferral

**Trigger:** ad-hoc (direct follow-up to `2026-08-06-cursor-security-migrations-reconciliation.md`)
**Scope:** Two follow-up decisions from that reconciliation: (1) the
deferred `v_client_tenant_users` fix, now shipped, and (2) Carl's decision
on the blocked cron.job PUBLIC grant (#171). Did not revisit #173/#176
(pg_net relocation) — still open, no decision made this session.

## Findings
- `v_client_tenant_users`'s real exposure was broader than the
  `auth.sessions` grant issue already documented: `anon` and
  `authenticated` both held a plain `GRANT SELECT` on the view directly,
  with no tenant-membership check at all. Any caller — including fully
  unauthenticated `anon` — could read any tenant's full user roster by
  changing the `tenant_id` filter client-side.
- The originally-proposed fix (#172's `security_invoker=true`) would also
  have been the wrong remedy for this specific view, independent of the
  grant issue: it's a deliberate "team directory" feature
  (`ClientUsersPage.tsx` shows the whole roster to every tenant member, not
  just admins/contacts — `canManagePortalUsers` only gates the invite
  button and per-row edit controls, not row visibility). Applying
  `tenant_users`/`users`' admin-centric RLS would have silently narrowed
  every ordinary member's view down to just themselves.
- No self-service path exists for #171 (cron.job PUBLIC SELECT revoke):
  Supabase's own pg_cron install docs grant only to `postgres`, never
  `PUBLIC` (this grant is legacy drift, not something current installs
  create), and their troubleshooting guide states `cron.*` access issues
  beyond normal privilege require a Support ticket — `supabase_admin`
  credentials are never exposed to customers. Same privilege wall as
  #173/#176 (pg_net relocation), still open from the prior audit.

## KB changes shipped
- no changes

## Codebase observations (read-only → became hotfixes)
- unicorn-cms-f09c59e5 @ 16a810af (branch
  `hotfix/client-tenant-users-tenant-scoped-rpc`, PR #185, merged): added
  `get_client_tenant_users(p_tenant_id)` — a `SECURITY DEFINER` RPC gated
  on superadmin/staff/actual-tenant-membership — and revoked direct
  `SELECT` on `v_client_tenant_users` from `anon`/`authenticated`.
  `service_role` (`ask-viv-fact-builder`) unaffected. Verified via
  rolled-back `SET LOCAL ROLE authenticated` dry-runs against real
  accounts (tenant isolation, superadmin/staff cross-tenant access,
  unrelated-tenant denial, direct-view-SELECT now correctly errors) before
  applying to prod, then smoke-tested end-to-end through the real
  `/client/users` page via View as Client preview as both a
  `primary_contact` and an `academy_user` on Test RTO A — full roster
  renders correctly for both, zero console errors.
- unicorn-cms-f09c59e5 @ 2f6f8b80 (branch
  `hotfix/document-cron-job-accepted-risk`, PR #186, not yet merged):
  documentation-only — records the #171 deferral decision inside the
  migration files themselves (`20260805051037_...` and
  `20260805051132_...`), no schema change.

## Decisions
- Shipped the `v_client_tenant_users` fix as a tenant-scoped RPC instead of
  flipping `security_invoker` on the view.
- Accepted #171 (cron.job PUBLIC SELECT grant) as a deferred risk. Not
  filing a Supabase Support ticket at this time — `cron` isn't in this
  project's PostgREST exposed-schema list, so the grant isn't reachable via
  the REST API for `anon`/`authenticated` today. Revisit if the exposed-
  schema config ever changes, or bundle into a Support ticket if one gets
  filed anyway for the pg_net relocation.

## Open questions parked
- #173/#176 (pg_net relocation) — still blocked on the same privilege wall
  as #171, no decision made yet on whether to ticket it.
- The `supabase db push` CI drift (~90 migrations' worth of history
  mismatch between git and remote) from the prior audit — still not
  remediated.

## Tag
audit-2026-08-06-client-tenant-users-fix-and-cron-deferral
