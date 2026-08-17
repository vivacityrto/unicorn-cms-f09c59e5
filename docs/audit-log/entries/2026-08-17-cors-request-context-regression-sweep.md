# Audit: 2026-08-17 — CORS request-context regression sweep

**Trigger:** post-security-remediation consequence audit. Production error logs were reviewed after the confirmed SharePoint template-browse regression.
**Scope:** Edge Functions changed by the PR #303 CORS migration, their live error logs, and invitation-password error paths. No database objects, data, or credentials were changed.

## Findings

- `embed-ask-viv-corpus` and `embed-ask-viv-documents` defined `json()` outside their request handler. PR #303 changed their response header construction to `corsHeaders(req)` without adding a `req` parameter, so both scheduled embedding runs failed with `ReferenceError: req is not defined`.
- Production recorded 43 failed runs for each function in the sampled 24-hour window. This stops Ask Viv corpus/document embedding, leaving new or changed material unavailable to semantic search until a later successful run.
- `set-invite-password` contained the same missing-request issue only on non-success error paths. It could mask a consumed or invalid invitation with a server error instead of returning the intended status.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Make each JSON helper explicitly accept the originating `Request` and pass it at all call sites.
- Add a Node regression test that rejects CORS-aware JSON helpers without request context.

## Decisions

- The post-#303 sweep now treats every helper-level `corsHeaders(req)` call as a runtime regression risk, not merely a CORS-policy review item.

## Open questions parked

- The invite acceptance state machine has a separate, higher-priority completion defect: a ghost account can set a password after the single-use claim but receive `ALREADY_ACCEPTED` before tenant membership is created. Its production function body is not represented by a repository migration, so the remediation must first restore migration parity.
- The cron schedules send `x-cron-invoke-secret` and the Vault secret exists, but cron-only functions continue returning 401. This indicates the deployed `CRON_INVOKE_SECRET` is absent or does not match the Vault value; the secret cannot be read through the available tooling and needs a controlled secret rotation/verification.
