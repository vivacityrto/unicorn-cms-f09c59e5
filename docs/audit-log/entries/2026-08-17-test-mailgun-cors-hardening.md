# Audit: 2026-08-17 — test-mailgun CORS hardening

**Trigger:** Edge Function deployment-drift audit.
**Scope:** active production `test-mailgun` Edge Function. No database object,
secret, or Mailgun configuration changed.

## Findings

- Production version 55 was an active Super Admin Mailgun diagnostic endpoint
  with custom bearer-token validation, a role check, and service-role access,
  but it was not represented under `supabase/functions` and responded with
  `Access-Control-Allow-Origin: *`.
- The active endpoint had no tracked frontend invocation and no calls in the
  inspected 24-hour log window. That was not treated as retirement evidence:
  manual Super Admin workflows and external callers are possible.

## Code changes

- Captured the exact v55 live source in `supabase/functions/test-mailgun/`.
- Replaced only the static wildcard CORS object with the shared request-aware
  `corsHeaders(req)` helper. Bearer-token validation, the existing
  `Super Admin`/`SuperAdmin` role gate, request payload, Mailgun send, and
  audit logging are unchanged.
- Added a regression test asserting request-aware CORS and the retained
  authorization gate.

## Deployment verification

- Deployed from PR #326 as production version **56** with `verify_jwt=false`.
  That setting is intentional because the function validates its bearer token
  explicitly with `auth.getUser` before privileged work.
- Retrieved the deployed source after deployment: both `test-mailgun/index.ts`
  and `_shared/cors.ts` exactly match the committed files; no wildcard
  `Access-Control-Allow-Origin` header remains.

## Decisions

- Keep the endpoint active pending direct workflow confirmation. Source absence
  and quiet logs are not sufficient to retire an administrative utility.

## Open questions parked

- Confirm the current operator entry point and whether this diagnostic should
  eventually be surfaced in, or replaced by, a supported administration UI.
