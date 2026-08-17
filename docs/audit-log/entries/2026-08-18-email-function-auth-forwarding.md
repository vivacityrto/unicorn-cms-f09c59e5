# Audit: 2026-08-18 — forward caller identity to legacy email functions

**Trigger:** Edge Function drift audit follow-up.
**Scope:** `get-email-status` and `report-delivery-issue` client construction only.

## Finding

- Both functions were gateway-JWT protected but created an anon-key Supabase client without forwarding the request's bearer token. Their force-RLS tables permit only authenticated Super Admins, so a real Super Admin was evaluated as anonymous and received an empty result or RLS failure.
- No tracked frontend caller or production invocation was found in the inspected 24-hour log window. This is a source correctness fix, not evidence that either legacy workflow is currently active.

## Remediation

- Forward `req.headers.get('Authorization')` through the anon-key client's global headers in both functions.
- Preserve the existing database policies, request/response contracts, wildcard-CORS behavior, and service boundaries. No production deploy is included in this PR.

## Verification

- Static regression tests assert both functions forward the caller header.
- Production deployment remains gated on confirming ownership/callers for these legacy endpoints.

## Open questions

- Identify whether either legacy function still has an operator or external caller before deploying; do not broaden `email_delivery_issues` access without a product decision.
