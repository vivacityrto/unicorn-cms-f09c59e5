# Audit: 2026-08-15 — OAuth redirect allowlisting and caller binding

**Trigger:** ad-hoc — security hardening of `outlook-auth` and `xero-auth`
**Scope:** `oauth_states` schema (`consumed_at` only), the two OAuth edge
functions, their shared helpers, and the frontend connect/callback callers.
Did not change Microsoft or Xero app registrations (console-only follow-up).

## Findings

- Both functions previously accepted `redirect_uri` from the request body and
  stored it in `oauth_states`. A caller on any origin (Lovable preview,
  localhost, a phishing page with a valid session) could start OAuth with
  their own callback URL. Token exchange then reused that stored URI.
- `get-auth-url` already bound `user_id` to `admin.auth.getUser()` (verified
  JWT). `exchange-code` did not: it trusted `state` alone and wrote tokens
  for `stateData.user_id` without requiring a session or asserting
  `caller.id === stateData.user_id`. `OutlookCallback` documented this as
  intentional so preview-domain redirects could finish without a session.
- `oauth_states` already had a 10-minute `expires_at`. After a successful
  exchange the row was deleted, so a replay raced the delete rather than
  being marked used. There was no `consumed_at`.
- No Postgres functions or triggers write `oauth_states` (write-path sweep
  via `pg_proc` / `pg_trigger` plus `src/` grep). The only writers are the
  two edge functions using the service role. Adding a nullable column does
  not tighten an existing constraint.
- The live callback routes are `/calendar/outlook-callback` and
  `/admin/integrations/xero-callback`, not a generic
  `/integrations/{provider}/callback`. The allowlist uses the live routes
  derived from `APP_BASE_URL` so production OAuth keeps working.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- `36c35c86`: edge-function + frontend hardening and the `consumed_at`
  migration file.
- `oauth_states.consumed_at timestamptz` (nullable) plus a partial index on
  unused rows. Applied via Supabase MCP `apply_migration` as
  `oauth_states_consumed_at` on `yxkgdalkbrriasiyyrwk`. Verified live:
  column is nullable timestamptz; a throwaway row consumed once then
  refused a second `UPDATE ... WHERE consumed_at IS NULL` (0 rows).
- Edge functions deployed the same session: `outlook-auth` v602,
  `xero-auth` v35 (`verify_jwt` still false; auth is in-function). Live
  smoke: `exchange-code` without a session is 401 (Outlook) / 403 (Xero)
  and does not write tokens. Git keeps `../_shared/` imports (repo
  convention); the hosted bundle uses `_shared/` paths because the
  deploy bundler rejected `../_shared/` plus object-literal
  `{ ok: true, redirectUri }` as a type-member parse error.
- Frontend connect/callback callers no longer send `redirect_uri`. Callback
  pages require a signed-in session before invoking `exchange-code`.

## Decisions

- Prefer omitting `redirect_uri` from the client entirely and always using
  the single env-derived URI for that provider. A leftover body value is
  still accepted only if it equals that canonical URI (and is therefore in
  `ALLOWED_REDIRECTS`); anything else is 400.
- Consume the state *after* the caller-binding check and *before* the
  provider token request, so a mismatched caller cannot burn a valid state
  and a replay cannot race the first exchange.
- Keep consumed rows until they expire rather than deleting them, so reuse
  is a distinct "already used" failure.

## Open questions parked

- **Microsoft Entra and Xero app-registration redirect URIs** must be
  reviewed in the vendor consoles (not in this repo). Remove any wildcard,
  preview-domain, or localhost redirect URI that is no longer needed. This
  environment cannot see those registrations. Register only
  `{APP_BASE_URL}/calendar/outlook-callback` and
  `{APP_BASE_URL}/admin/integrations/xero-callback`.
- Lovable preview / localhost OAuth connect flows will now fail by design
  (allowlist is production `APP_BASE_URL` only). Connect Outlook or Xero
  from the production origin while signed in.
