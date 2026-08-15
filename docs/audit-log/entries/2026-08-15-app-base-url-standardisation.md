# Audit: 2026-08-15 — APP_BASE_URL standardisation

**Trigger:** ad-hoc (standardise Unicorn's base URL on `APP_BASE_URL`)
**Scope:** Every `supabase/functions/` read of an app origin — env-var aliases
(`APP_URL`, `SITE_URL`, `SITE_BASE_URL`), hardcoded preview/legacy hosts
(`lovable.app`, `app.unicorn-cms.au`, `www.unicorn-cms.au`,
`unicorn.vivacity.com.au`), and `payload.base_url` on the Teams outbox
worker. Did not change frontend hardcoded `unicorn-cms.lovable.app` links
in `EosQCSession`, `QCScheduler`, or `StaffTaskActionMenu` (outside the
edge-function sweep). Did not change the Vimeo allowlist hint in
`academy-fetch-vimeo-transcript` (operator instruction, not a link builder).

## Findings

- In-repo functions already read `APP_BASE_URL` but each had its own
  fallback (`https://unicorn-cms.au`, and `https://www.unicorn-cms.au` in
  `generate-recovery-link`). A missing secret would silently send users to
  whichever fallback that file happened to hardcode.
- `process-notification-outbox` ignored the env var entirely and built
  Teams deep links from `payload.base_url` with a
  `https://unicorn-cms.lovable.app` default. Frontend callers
  (`noteNotifications`, `TasksManagement`) sent `window.location.origin`,
  so a preview-domain session would emit preview-domain links.
- `process-notification-queue`, `send-notification-email`,
  `send-automated-email`, and `send-enhanced-email` were ACTIVE on
  production (`yxkgdalkbrriasiyyrwk`) but absent from git. Live source
  used `APP_URL` → `https://unicorn.vivacity.com.au`,
  `https://unicorncms.lovable.app/assets/brand/unicorn-cms-email-logo.png`
  (already 404), and `APP_BASE_URL` → `https://app.unicorn-cms.au`.
- The dedicated email-logo PNG path 404s on both `unicorncms.lovable.app`
  and `unicorn-cms.au`. `https://unicorn-cms.au/unicorn-logo.svg` is live
  but is a 636 KB embedded-raster SVG, unsuitable as an email header.
- Edge-function secrets cannot be listed via the Supabase MCP toolset
  (no `list_secrets`; `vault.secrets` is the DB vault and does not include
  `APP_BASE_URL`). Auth `flow_state.referrer` values since 2026-06-03 are
  consistently `https://unicorn-cms.au/post-sign-in?...`. The 2026-06-04
  invitation-cohort audit recorded `APP_BASE_URL=https://unicorn-cms.au`
  being added to edge-function secrets. Independent dump of the current
  secret value was not possible from this session.

## KB changes shipped

- no changes

## Code changes (this entry accompanies one)

- New shared helper `supabase/functions/_shared/app-base-url.ts` reads
  exactly `Deno.env.get("APP_BASE_URL")` and throws at module load if
  unset. All in-repo URL builders now import it.
- `process-notification-outbox` deletes `payload.base_url` and builds the
  deep link from `APP_BASE_URL` + `payload.deep_link`.
- Restored the four production-only functions into git and pointed them
  at the same helper. Email logo URL is
  `${APP_BASE_URL}/assets/brand/unicorn-cms-email-logo.png`.
- Added `public/assets/brand/unicorn-cms-email-logo.png` (copy of the
  existing 500×500 favicon) so the canonical domain can serve the asset
  after the frontend deploy.
- Frontend emitters no longer send `base_url`.

## Decisions

- Fail loudly at module load rather than keep a
  `|| "https://unicorn-cms.au"` fallback. A missing secret should page,
  not silently mint links.
- Host the email logo on the canonical app origin (not a new Storage
  bucket). The previous Lovable URL was already dead.

## Open questions parked

- Confirm `APP_BASE_URL` in the Supabase Dashboard → Edge Functions →
  Secrets UI (MCP cannot list that store). Expected value:
  `https://unicorn-cms.au`.
- Three remaining frontend `unicorn-cms.lovable.app` hardcodes
  (`EosQCSession`, `QCScheduler`, `StaffTaskActionMenu`) were out of the
  edge-function sweep.
