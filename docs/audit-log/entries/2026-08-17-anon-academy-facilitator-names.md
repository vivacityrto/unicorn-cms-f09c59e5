# Audit: 2026-08-17 — revoke anonymous Academy facilitator-name RPC access

**Trigger:** Security-advisor `SECURITY DEFINER` execution review.
**Scope:** Grants on `public.get_academy_facilitator_names_safe(uuid[])` only.

## Findings

- The helper intentionally exposes names only for facilitators of published Academy courses, but production granted direct execution to `PUBLIC` and `anon`.
- The actual caller is the authenticated Academy UI hook `src/hooks/academy/useFacilitatorNames.ts`; it invokes the RPC through the normal authenticated Supabase client.

## Remediation

- Remove `PUBLIC` and anonymous execution while retaining `authenticated` and `service_role` access.
- No function body, published-course filter, or UI request contract changes.

## Deployment verification

- Before apply: `anon`, `authenticated`, and `service_role` could execute the function.
- After apply: verify `anon` cannot execute while the authenticated Academy UI path remains authorized.

## KB changes shipped

- No KB changes.

## Open questions parked

- None for this grant-only remediation.
