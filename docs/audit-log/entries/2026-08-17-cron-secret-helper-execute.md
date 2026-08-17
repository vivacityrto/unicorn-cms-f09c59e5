# Audit: 2026-08-17 — revoke cron secret helper direct execution

**Trigger:** Security-advisor drift follow-up.
**Scope:** `public.cron_presented_secret_matches(text, text)` grants only.

## Findings

- The source migration already intended this `SECURITY DEFINER` helper to be service-role-only, but production retained explicit `anon` and `authenticated` `EXECUTE` grants.
- The function body rejects every caller whose `auth.role()` is not `service_role`; its sole tracked caller is `_shared/cron-auth.ts`, which invokes it with an Edge Function service-role client.

## Remediation

- Revoke direct execution from `PUBLIC`, `anon`, and `authenticated`; retain the explicit `service_role` grant.
- The function body, vault lookup, Edge Function caller, and cron workflow are unchanged.

## Deployment verification

- Before apply: `anon`, `authenticated`, and `service_role` all had `EXECUTE`.
- After apply: verify `anon` and `authenticated` do not have `EXECUTE`, `service_role` does, and the function definition is unchanged.

## KB changes shipped

- No KB changes.

## Open questions parked

- None for this helper.
