# Audit: 2026-08-17 — revoke direct relationship-role helper execution

**Trigger:** security-remediation consequence audit and production security-advisor finding.
**Scope:** `public._apply_relationship_role_row(bigint, uuid, text, text, uuid, boolean, text)`.

## Finding

- The helper is `SECURITY DEFINER` and mutates `tenant_users`, `users`, `tenant_members`, and audit/timeline records.
- A direct grant allowed both `anon` and `authenticated` roles to invoke it through the public RPC surface. The function itself did not authorize its caller.
- The intended public entry point is `set_relationship_role`, which authorizes the caller before invoking this helper internally.

## Remediation

- Revoke direct execution from `anon` and `authenticated`; leave the authorized outer RPC and its internal function call intact.

## Deployment verification

- PR #319 was created before the production migration.
- Verified after applying the exact committed migration: `anon` and `authenticated` cannot execute the helper; `authenticated` retains execution on the authorized `set_relationship_role` RPC; `service_role` retains the helper grant for internal use.
