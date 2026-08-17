# Audit: 2026-08-17 — Academy thumbnail backfill CORS hardening

**Trigger:** Edge Function deployment-drift audit.
**Scope:** active `academy-backfill-course-thumbnails` Edge Function. No
database object, secret, Vimeo configuration, or thumbnail data changed.

## Findings

- Production v3 was a Super Admin-maintenance function with custom token
  validation and a full-backfill workflow, but it was not represented in the
  repository and returned wildcard CORS headers.
- No tracked frontend invocation or recent 24-hour log entry was found. This
  is not proof that a manual administrative workflow is retired.

## Code changes

- Captured the exact v3 source under
  `supabase/functions/academy-backfill-course-thumbnails/`.
- Replaced only the static wildcard CORS object with request-aware shared CORS.
  Super Admin validation, Vimeo lookup, full-backfill behavior, and response
  fields remain unchanged.
- Added a regression test for CORS request wiring and retained authorization.

## Deployment verification

- Deployed PR #327 as production version **4** with `verify_jwt=false`.
  This is intentional because the function validates its bearer token and
  Super Admin role inside the handler.
- Retrieved production after deploy: function source and `_shared/cors.ts`
  exactly match the committed PR files, and no wildcard origin header remains.

## Decisions

- Keep the function active. Verify the operator entry point before any future
  lifecycle decision or bounded-batch redesign.
