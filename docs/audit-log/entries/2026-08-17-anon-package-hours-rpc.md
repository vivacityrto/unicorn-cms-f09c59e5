# Audit: 2026-08-17 — revoke anonymous package-hours RPC access

**Trigger:** Security-advisor `SECURITY DEFINER` execution review.
**Scope:** Grants on `public.fn_package_used_minutes(bigint)` only.

## Findings

- The function accepts a sequential package-instance id, reads billable time totals under `SECURITY DEFINER`, and has no caller or tenant authorization check.
- Production granted execution to `PUBLIC`, `anon`, `authenticated`, and `service_role`. No tracked frontend caller, RLS-policy dependency, or internal function caller was found.

## Remediation

- Remove the `PUBLIC` and explicit `anon` grants.
- Retain `authenticated` and `service_role` execution so this narrow remediation does not change the contract for any authenticated integration while its ownership is verified.
- The function body and all calculations remain unchanged.

## Deployment verification

- Before apply: all four roles could execute the function.
- After apply: verify `anon` cannot execute, while `authenticated` and `service_role` retain execution.

## KB changes shipped

- No KB changes.

## Open questions parked

- Confirm whether any authenticated external integration still needs this RPC. If not, a follow-up may revoke `authenticated` as well or replace it with tenant-aware authorization.
