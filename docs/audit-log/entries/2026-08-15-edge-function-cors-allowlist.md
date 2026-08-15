# Audit: 2026-08-15 — edge-function-cors-allowlist

**Trigger:** ad-hoc (security follow-up: replace wildcard CORS on Unicorn edge functions)
**Scope:** `supabase/functions/_shared/cors.ts` and every edge function that
defined or imported CORS headers. Did not change frontend fetch callers,
Supabase Auth redirect allowlists, or hosted function secrets.

## Findings

- `_shared/cors.ts` (and a second copy in `_shared/response-helpers.ts`)
  shipped `Access-Control-Allow-Origin: *`. Most functions duplicated that
  wildcard locally instead of importing the shared helper.
- The Outlook / Teams add-in is served from the same SPA (`/addin` on
  `APP_BASE_URL`). No separate Outlook host is required on the allowlist.
- Extra request headers used by a few functions (`idempotency-key`,
  `x-action`, `x-caller-authorization`) have to stay in Allow-Headers or
  those preflights fail even for an allowlisted origin.
- `xero-webhook` is server-to-server and does not send CORS headers.

## KB changes shipped

- `docs/kb/pinned/conventions.md`: canonical edge-function snippet now calls
  `corsHeaders(req)` instead of spreading a static object.

## Code changes (this entry accompanies one)

- `_shared/cors.ts` builds the allowlist from `APP_BASE_URL` (fallback
  `https://unicorn-cms.au`), the www/apex sibling, optional
  `CORS_ALLOWED_ORIGINS`, and Vite `localhost:8080`. Echoes `Origin` only
  when it matches; otherwise omits the header entirely.
- Shared helpers (`response-helpers`, `addin-auth`, `ask-viv-access`) take
  `req` so they can call the allowlist helper.
- Per-function wildcard objects deleted; every remaining function imports
  `_shared/cors.ts` (or a helper that re-exports it).
- Rolled out first to the retired C1 `create-session` / `create-session-v2`
  stubs and the same-pattern 410 functions, then the rest.

## Decisions

- Keep `http://localhost:8080` / `127.0.0.1:8080` on the allowlist so
  `npm run dev` against hosted Supabase still works.
- Extra origins (Lovable/Vercel previews) go in the `CORS_ALLOWED_ORIGINS`
  secret rather than being hardcoded.

## Open questions parked

- Hosted functions still serve the previous wildcard until each function is
  redeployed (`_shared` is bundled per function). C1 stubs are the intended
  first deploy; the rest follow in a later pass.
