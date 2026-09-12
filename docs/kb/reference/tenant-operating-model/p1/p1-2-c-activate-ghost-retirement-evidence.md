# TOM P1.2-c — `activate-ghost-user` retirement evidence

> **Last updated:** 2026-09-12 · **Status:** repository evidence; retirement not authorized
> **Owner:** TOM, with RBAC and operations review
> **Related scope:** [P1.2 ghost-user retirement and contact promotion](p1-2-ghost-user-retirement-contact-promotion-scope.md)
> **Related execution gate:** [P1.2-b guarded dry-run execution packet](p1-2-b-ghost-contact-dry-run-execution-packet.md)

## Purpose and boundary

This packet records the independent repository caller census needed before the
legacy ghost activation Edge Function can be retired. It deliberately separates
static reachability from live invocation history. A source grep cannot prove
that a function is unused, and a short log window cannot prove that no old
cohort job or manually triggered path remains.

This is evidence and planning only. It does not remove UI, change a worker,
disable a function, delete a deployment, alter invitations, or change
production data.

## Static caller census at current `origin/main`

The following references remain in the checked-in code at `origin/main` after
PR #1201:

| Path | Reference | Reachability | Retirement implication |
| --- | --- | --- | --- |
| `src/components/client/TenantUsersTab.tsx` | Direct `supabase.functions.invoke('activate-ghost-user')` in `handleActivateGhost`; ghost detection calls `is_ghost_user`; staff-only activation UI renders in the same component | Live per-row UI path | Must be replaced by the contact/promotion flow before retirement |
| `src/components/client/TenantUsersTab.tsx` | `supabase.functions.invoke('bulk-account-actions')` with an `action` selected from the bulk UI | Live bulk UI path; indirect activation caller | The activation action must be removed, rejected, or explicitly migrated before the sender can be retired |
| `supabase/functions/bulk-account-actions/index.ts` | `senderName = action === 'activate' ? 'activate-ghost-user' : 'send-password-reset'` and internal invoke | Live Edge-to-Edge path when `action='activate'` | Must account for queued/in-flight requests and reject new activation requests before retirement |
| `src/pages/admin/CohortAccessSenderJob.tsx` | Invokes `cohort-access-sender-worker` | Live staff job UI path; indirect activation caller | Existing jobs and the activation action need a drain/hold decision |
| `supabase/functions/cohort-access-sender-worker/index.ts` | `senderName = action === 'activate' ? 'activate-ghost-user' : 'send-password-reset'` | Live worker-to-Edge path when a job action is `activate` | Must inspect job rows and worker history; source comment says `pg_cron` is not permitted, but that is not historical proof |
| `supabase/config.toml` | `[functions.activate-ghost-user] verify_jwt = false` | Deployment/configuration reference | Keep deployment unchanged until caller and outstanding-account gates are complete |

The census found no other direct function-name invocation under `src/`,
`supabase/functions/`, or `scripts/`. It did find documentation, migration,
RBAC inventory, and `set-invite-password` compatibility references. Those are
not additional callers, but they are retirement evidence dependencies.

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

1. **Static reachability closure:** remove or migrate the direct UI and both
   indirect activation chains, then re-run the repository census on the final
   candidate commit. The result must show no executable caller, while retaining
   only intentional documentation or migration-history references.
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
5. **Replacement workflow evidence:** use the approved QA fixture to prove
   contact promotion → pending invitation → acceptance creates/relinks the
   intended profile and membership exactly once, with the relevant denial and
   duplicate cases covered.
6. **RBAC/security review:** confirm the replacement preserves the capability
   boundary and that no browser or orchestrator caller can bypass the standard
   invitation path.

## Proposed retirement sequence

The safest sequence is additive and reversible:

1. freeze new ghost activation job creation and remove the UI activation entry
   points in a separately approved implementation packet;
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

The function is **not yet a zero-caller candidate**. The direct staff UI and
two indirect activation chains are still present and reachable in source. The
previous short-window “no invocation” observation is useful but insufficient
to override that evidence. The immediate safe next step is the approved QA
replacement characterization plus a separately authorized historical job/log
census; retirement remains held until both are complete.

**Audit entry:** none needed — repository evidence and planning only; no
schema, permission, deployment, production-data, or operational schedule
changed.
