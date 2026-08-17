# Audit: 2026-08-17 — tenant-lifecycle response request context

**Trigger:** security-remediation consequence audit.
**Scope:** Hosted `tenant-lifecycle` Edge Function after the request-aware CORS helper rollout.

## Finding

- The function was changed to import request-aware response helpers, but every response call still used the former parameter shape. In particular, `handleCors()` ran without the request on preflight, and error/success helpers were called without the request. The helpers read `req.headers` to apply the CORS allowlist, so those paths could throw at runtime instead of returning a lifecycle response.

## Remediation

- Pass the inbound `Request` to every CORS, common-error, success, and error helper, including the close/reactivate helper paths.
- Add a lightweight source-level regression check covering the helper call shapes.

## Deployment verification

- PR #317 was created before deployment, and the exact committed bundle was deployed to hosted `tenant-lifecycle` version 437 on 2026-08-17. The existing `verify_jwt: false` setting was preserved because this function validates callers in its handler.
- Retrieved the hosted source after deployment. It now passes `req` to the OPTIONS handler and every common-error and JSON response helper; no legacy request-less helper shapes remain.
- Local verification passed: `node supabase/functions/tenant-lifecycle/response-context.test.mjs` and `npx tsc --noEmit`.
