# Audit: 2026-08-17 — edge-function deployment drift

**Trigger:** drift-surfaced — security review found deployed Edge Functions
whose source is not represented by a current directory in this repository.
**Scope:** production Edge Function inventory (218 deployments), repository
`supabase/functions` directories, direct frontend `functions.invoke` calls,
and a source review of the untracked privileged endpoints. This was a
read-only review: no database object, secret, or Edge Function changed.

## Findings

- Production has **218** Edge Function deployments. Twenty deployed slugs do
  not have a matching active source directory in this checkout. This is a
  source-control/reproducibility gap, not evidence that any function is unused.
- Three UUID-slug deployments are already inert HTTP 410 stubs with no
  credentials or data access: `e77f4567-…` (old ClickUp mock),
  `dcd6c745-…`, and `c22daa64-…` (duplicate `send-test-email` copies).
  They are recorded as retired; no action was taken here.
- The following active endpoints are deployed but untracked in the current
  source tree: `get-email-status`, `report-delivery-issue`, `invite-to-tenant`,
  `schedule-task-reminders`, `import-vimeo-training`, `test-mailgun`,
  `admin-change-password`, `generate-audit-report`, `create-client-audit`,
  `record-completed-audit`, `validate-ai-assist`,
  `tmp-backfill-sharepoint-drive-ids`, `academy-backfill-course-thumbnails`,
  `export-pdp-audit-pack`, and `academy-fetch-vimeo-showcase`.
- `assign-package-to-tenant` and `backfill-vimeo-durations` are also absent
  from `main`, but their current production states are represented by open PRs
  #323 and #324 respectively. They must not be treated as orphaned while those
  PRs are awaiting review.
- `test-mailgun`, `generate-audit-report`, `create-client-audit`,
  `academy-backfill-course-thumbnails`, and `export-pdp-audit-pack` use custom
  bearer-token validation and service-role clients while retaining wildcard
  CORS. The reviewed code authenticates callers before privileged work, so
  wildcard CORS is defence-in-depth remediation rather than proof of anonymous
  access. They should be moved to the shared request-aware CORS helper when
  their source is captured.
- `create-client-audit` allows any user whose `users.unicorn_role` is non-empty
  to create an audit for any tenant. That may be the intended Vivacity-staff
  workflow, but it is broader than the current canonical permission pattern.
  It needs an explicit product/RBAC decision before it is narrowed; changing it
  by inference could block legitimate consultants.
- `academy-backfill-course-thumbnails` and `backfill-vimeo-durations` are
  privileged maintenance workflows. Neither should be retired merely because a
  repository search finds no caller. The latter has a confirmed current UI
  caller; the former requires workflow verification before any lifecycle change.
- No tracked frontend invocation or recent 24-hour function log entry was
  found for `test-mailgun` or `academy-backfill-course-thumbnails`. This is
  insufficient evidence to retire either endpoint, particularly for manual
  administrative workflows and external clients.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Documentation only. No production change accompanies this entry.

## Decisions

- **No-retirement rule:** a missing repository caller, an untracked deployment,
  or a quiet 24-hour log window is not sufficient authority to retire an Edge
  Function. Retirement requires direct verification of the live workflow and
  its replacement, with the result documented in the PR.
- Reconcile drift in two stages: first capture/verify live source without
  changing behaviour; then make narrowly reviewed CORS and authorization
  changes. This keeps a security cleanup from becoming a feature regression.

## Open questions parked

- Which Vivacity roles are intended to create a client audit for another
  tenant? The answer determines the replacement for the broad
  `create-client-audit` role check.
- Which operator workflow, if any, invokes `academy-backfill-course-thumbnails`
  and `test-mailgun`? A Super Admin should exercise each before a lifecycle
  decision.
- The remaining untracked endpoints need their live source captured and
  compared with any historical source before a deployment-alignment PR is
  proposed.
