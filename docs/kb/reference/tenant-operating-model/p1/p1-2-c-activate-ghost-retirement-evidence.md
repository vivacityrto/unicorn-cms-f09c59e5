# TOM P1.2-c — `activate-ghost-user` retirement evidence

> **Last updated:** 2026-09-15 · **Status:** bounded caller closure implemented in PR #1356; retirement not authorized
> **Owner:** TOM, with RBAC and operations review
> **Related scope:** [P1.2 ghost-user retirement and contact promotion](p1-2-ghost-user-retirement-contact-promotion-scope.md)
> **Related execution gate:** [P1.2-b guarded dry-run execution packet](p1-2-b-ghost-contact-dry-run-execution-packet.md)

## Purpose and boundary

This packet records the independent repository caller census needed before the
legacy ghost activation Edge Function can be retired. It deliberately separates
static reachability from live invocation history. A source grep cannot prove
that a function is unused, and a short log window cannot prove that no old
cohort job or manually triggered path remains.

This packet now includes the bounded caller-closure implementation needed to
freeze legacy activation dispatch. It does not disable or delete the
`activate-ghost-user` function, drain or mutate existing jobs, alter
invitations, query provider logs, or change production data.

## Static caller census at current `origin/main`

The final candidate references were re-checked at implementation commit
`8a766d518` in [PR #1356](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1356)
on 2026-09-15. The direct per-row activation UI is absent, and both indirect
activation dispatch paths now fail closed before invoking the legacy sender or
leasing a cohort item. The function deployment/configuration and compatibility
references remain intentionally unchanged pending the later retirement gates.

| Path | Reference | Reachability | Retirement implication |
| --- | --- | --- | --- |
| `src/components/client/TenantUsersTab.tsx` | `supabase.functions.invoke('bulk-account-actions')`; the current `BulkAction` union is reset-only and the component no longer exposes ghost activation | Live reset path; no current activation caller observed | Preserve reset behavior; no activation removal is required in this component unless a future change reintroduces the action |
| `supabase/functions/bulk-account-actions/index.ts` | `action='activate'` returns 410 `GHOST_ACTIVATION_RETIRED` before user lookup or sender invocation; reset remains routed to `send-password-reset` | Fail-closed compatibility guard; no legacy sender invocation | Preserve the guard while completing job/log/account evidence; reset behavior remains supported |
| `src/pages/admin/CohortAccessSenderJob.tsx` | Invokes `cohort-access-sender-worker` | Live staff job UI path; indirect activation caller | Existing jobs and the activation action need a drain/hold decision |
| `supabase/functions/cohort-access-sender-worker/index.ts` | `job.action='activate'` returns 410 `GHOST_ACTIVATION_RETIRED` before leasing any item; reset remains routed to `send-password-reset` | Fail-closed compatibility guard; no legacy sender invocation or item lease | Must inspect existing job rows and worker history; the guard does not disposition existing job state |
| `supabase/config.toml` | `[functions.activate-ghost-user] verify_jwt = false` | Deployment/configuration reference | Keep deployment unchanged until caller and outstanding-account gates are complete |

The census found no other executable caller of the legacy function under `src/`,
`supabase/functions/`, or `scripts/`. It did find documentation, migration,
RBAC inventory, and `set-invite-password` compatibility references. Those are
not additional callers, but they are retirement evidence dependencies. The
candidate guard test also confirms both indirect paths reject before invoking
`activate-ghost-user` or leasing a cohort item.

## Evidence status after the approved QA projection

The approved P1.2-d QA projection is now complete: the one-row canary plus
5/5/4 bounded batches created 15 contact projections and 15 audit rows in
allowlisted `unicorn-qa`. Its terminal read-only reconciliation reported 15
existing-contact matches, zero eligible candidates, zero collision/manual
rows, and zero projected future inserts. This proves the bounded QA
replacement projection and its postflight contract only; it does not prove
that production ghosts, queued activation jobs, or historical invocations are
safe to retire. See the [P1.2-d bounded-batch audit](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-bounded-batch.md).

The P1.1 QA contact-promotion canary also passed the real contact → invitation
→ acceptance path with QA no-send, idempotent retry, cleanup, and audit
preservation. That is replacement-workflow evidence for the approved QA
fixture, not production retirement authority. See the [P1.1 QA audit](../../../../audit-log/entries/2026-09-15-tom-p11-contact-promotion-qa-canary.md).

## Compatibility dependencies that are not callers

- `set-invite-password` recognizes `ghost_activation` metadata and has a
  fallback for older activations without the flag. Retirement must not strand
  already-created auth users whose first password setup still follows that
  contract.
- `AcceptInvitation.tsx` still contains a compatibility branch for
  ghost-activated accounts. The standard contact invitation path must be
  proven for new promotions before that branch can be considered removable.
- `send-invitation-email` documents `activate-ghost-user` as a trusted internal
  sender. Its contract must be reconciled when the sender is retired so the
  email function does not retain a misleading internal mode.
- `bulk-account-actions` and `cohort-access-sender-worker` are shared sender
  orchestrators. Their reset behavior must remain intact when activation is
  removed; do not collapse the two actions without a separate characterization
  and verification packet.

## Evidence still required before retirement

1. **Static reachability closure:** the bounded implementation in PR #1356
   now rejects both indirect activation chains before sender invocation or item
   lease, and the candidate census shows no executable caller. After merge,
   re-run the repository census on `origin/main` and retain only intentional
   documentation, migration-history, configuration, and compatibility
   references.
2. **Job-state census:** inspect `cohort_send_jobs` and its item table for
   activation jobs in queued, running, failed, or retryable states. Freeze or
   disposition them explicitly; do not assume the absence of a cron schedule
   means no worker can be invoked.
3. **Live invocation history:** review the provider's function logs over an
   owner-approved window that covers the last possible manual, UI, bulk, and
   worker invocation. A single 24-hour query is insufficient for historical
   zero-caller proof; use repeated bounded windows or an equivalent retained
   log export and record the exact interval.
4. **Outstanding-account census:** reconcile existing `ghost_activation`
   metadata, auth users without passwords, pending invitations, and legacy
   profiles. The set must have a safe completion or explicit hold path before
   the old function is disabled.
5. **Replacement workflow evidence:** the approved QA fixture has now proven
   contact projection plus contact promotion → pending invitation → acceptance
   with exactly-once behavior, QA no-send, idempotent retry, cleanup, and audit
   preservation. Any production or broader-tenant observation remains a
   separate gate.
6. **RBAC/security review:** confirm the replacement preserves the capability
   boundary and that no browser or orchestrator caller can bypass the standard
   invitation path.

## Proposed retirement sequence

The safest sequence is additive and reversible:

1. freeze legacy ghost activation dispatch while preserving the reset sender;
   the bounded implementation is under review in PR #1356 and does not mutate
   existing job rows;
2. preserve the reset sender path and drain or explicitly close existing
   activation jobs;
3. observe the replacement contact/invitation path for the approved window;
4. re-run static reachability, job-state, outstanding-account, and live-log
   evidence; and
5. only then open a separate retirement/deployment packet for disabling or
   deleting `activate-ghost-user`, with rollback owner and audit entry.

Disabling the function before steps 1–4 would turn any stale UI, queued job, or
old invitation into a broken workflow. Deleting the deployment is a separate
operational action and is not implied by this packet.

## Current conclusion

The candidate is now **static-zero-caller after the bounded guard**: the direct
per-row staff UI path is absent, and the two indirect paths reject before any
legacy sender invocation or cohort-item lease. The approved QA replacement
evidence is complete; the job-state census, owner-approved historical log
review, outstanding-account census, post-merge repository census, and
RBAC/security review remain open. Retirement remains held until those gates
are independently complete and a separate deployment/retirement decision is
approved.

**Audit entry:** [2026-09-15 TOM P1.2-c freeze indirect ghost activation callers](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-activation-caller-freeze.md)
