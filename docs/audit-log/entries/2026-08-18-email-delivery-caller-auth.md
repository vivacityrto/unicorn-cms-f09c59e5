# Audit: 2026-08-18 — restore caller context for email-delivery functions

**Trigger:** Edge Function deployment-drift follow-up.
**Scope:** `get-email-status` and `report-delivery-issue` database client authentication.

## Findings

- Both gateway-JWT-protected functions created an anon-key Supabase client without forwarding the verified caller bearer token.
- Their target tables enforce Super-Admin-only RLS. The anon client therefore always evaluated `auth.uid()` as null: status reads returned the function's 404 path and delivery-issue inserts returned its 500 path for every real caller.

## Remediation

- Forward the incoming `Authorization` header into the existing anon-key client's global headers, creating the intended user-scoped PostgREST context.
- Preserve request validation, queries, inserts, response statuses/shapes, and the existing gateway JWT requirement.

## Verification

- Source regression test covers bearer-token forwarding in both functions.

## KB changes shipped

- No KB changes.

## Open questions parked

- The legacy static wildcard CORS on these captured functions is deliberately unchanged in this contract-repair PR.
