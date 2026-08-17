# Audit: 2026-08-17 — record-completed-audit authorization and source reconciliation

**Trigger:** security-remediation consequence audit.
**Scope:** legacy hosted-only `record-completed-audit` Edge Function.

## Finding

- The hosted function was not represented in the repository, had `verify_jwt: false`, and returned wildcard CORS headers.
- Its staff check accepted any non-empty `users.unicorn_role`, including client roles such as `Admin`, before using the service key to create a completed audit record for an arbitrary tenant.

## Remediation

- Bring the function under source control.
- Require the canonical `staff.internal` permission, use request-aware CORS, and allowlist the insert payload.

## Deployment verification

- PR #321 was created before deployment. The exact committed bundle is active as hosted `record-completed-audit` version 12.
- Retrieved the hosted source after deployment and confirmed it requires `FeatureKeys.staffInternal`, uses request-aware CORS, contains no wildcard origin, and builds the database insert from an allowlisted payload.
- Local verification passed: `node supabase/functions/record-completed-audit/auth.test.mjs` and `npx tsc --noEmit`.
