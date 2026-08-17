# Audit: 2026-08-17 — retire legacy package-assignment function

**Trigger:** final security audit of deployed Edge Functions with
`verify_jwt=false`.

## Finding

`assign-package-to-tenant` was still active in production but had no tracked
source or in-repository caller. Its legacy implementation used wildcard CORS,
hand-rolled `users.unicorn_role = 'Super Admin'` authorisation, and a
service-role client to mutate the deprecated `tenants.package_id` workflow and
create task instances.

The auth gate prevented anonymous mutation, but the deployed-only implementation
was outside the current request-aware CORS and canonical authorisation guardrails.
No matching invocation appeared in the available 24-hour function-log window.

## Remediation

- Created and opened PR #323 before production deployment.
- Replaced the function with a source-controlled, request-aware 410
  `FUNCTION_RETIRED` response.
- Deployed the exact retirement bundle to production as version 82.
- Retrieved the hosted function after deployment and verified it contains the
  retirement response, no `SUPABASE_SERVICE_ROLE_KEY`, and no wildcard CORS.

## Consequence

Any unknown external caller of this retired, legacy endpoint now receives 410.
There are no repository callers and no observed recent invocations; current
package-instance flows remain unaffected.
