# release-audit-report

Still ACTIVE on production (`yxkgdalkbrriasiyyrwk`). Real UI path for
"Release Report to Client" (`useReleaseReport` → this edge function). The
Postgres RPC `public.release_audit_report` is dead from the UI's perspective
(hardcoded portal_documents values violate later check constraints → 23514);
release logic lives here instead.

## L3 fix (15 Jul 2026 Unicorn security audit addendum)

After resolving `callerUserId` from the forwarded Authorization header, require:

```ts
check_permission(callerUserId, 'audits.report', 'full')
```

via the JWT-scoped `userClient`. Without this, any tenant user who can SELECT
their own in-progress audit row (`client_audits_tenant_read_active`) can
self-release, and any Vivacity staffer (`client_audits_staff_all` /
`is_vivacity_team_safe`) can release any tenant's report.

Feature key matches UI `usePermission('audits.report')` (Super Admin / Team
Leader only per `role_permissions` seed).

## Keeper-repo provenance

Cloud-agent environment cannot authenticate Supabase MCP (`needsAuth`;
interactive OAuth unavailable). Body reconstructed from:

- Dead RPC `release_audit_report` (intent)
- Corrected constraint values (`vivacity_to_client` / `shared` / `generated`)
- Frontend contract in `src/hooks/useAuditReport.ts` (200 / 403 / 409 / 422)

**Before deploy:** re-pull live via `get_edge_function` and confirm the only
intentional delta vs production is the `check_permission` gate (+ header /
README). If live has additional logic, merge the gate into the true live body
rather than blindly deploying this reconstruction.

## Deploy

```bash
supabase functions deploy release-audit-report --project-ref yxkgdalkbrriasiyyrwk
```

Or merge to `main` so `.github/workflows/deploy-supabase.yml` deploys.

## Persona checks (post-deploy)

| Caller | Expected |
|--------|----------|
| Tenant user with a legitimate in-progress audit | **403** Forbidden |
| Vivacity staff with `audits.report` = full (Super Admin / Team Leader) | **200** (or 409 if already released) |
| Vivacity staff without `audits.report` (e.g. CSC / CET / BGT) | **403** (behavior change from pre-fix ungated staff RLS) |

## Out of scope (flagged)

`client_audits_staff_all` still gates ALL on `is_vivacity_team_safe` alone —
too broad for protected-field writes / sensitive reads per the original audit
baseline. Track as a follow-up sweep; not fixed here.
