# TOM P1.2-c — `activate-ghost-user` retirement decision packet

> **Last updated:** 2026-09-15 · **Status:** planning-only; retirement not authorized
> **Owner:** TOM, with RBAC and operations review
> **Evidence source:** [P1.2-c retirement evidence](p1-2-c-activate-ghost-retirement-evidence.md)
> **Operational packet:** [P1.2-c operational retirement packet](p1-2-c-activate-ghost-retirement-operational-packet.md)

## Purpose and authority boundary

This packet turns the completed P1.2-c evidence into an explicit decision
record for a possible future retirement of `activate-ghost-user`. It is a
planning and reconciliation artifact only. It does not disable, delete, or
redeploy an Edge Function; drain or mutate a job; repair an account; send an
invitation; change a credential; or authorize any production, migration, RLS,
grant, or schema operation.

The packet separates evidence that is complete from evidence that remains
bounded or unavailable. A retirement decision must not be inferred from the
static caller closure, the QA replacement evidence, or the absence of recent
requests alone.

## Current decision state

| Gate | Current evidence or disposition | Decision state |
| --- | --- | --- |
| Direct and indirect caller closure | The direct staff action is absent; `bulk-account-actions` and `cohort-access-sender-worker` reject activation before sender invocation or item leasing. | Complete; guards remain deployed |
| Reset compatibility | Both shared orchestrators retain the reset path. | Preserve; no reset change authorized |
| Cancelled activation jobs | Two cancelled jobs retain two stale pending items whose current profiles are active primary contacts; no retry, close, delete, or repair was performed. | Carl-approved non-destructive hold |
| Current ghost accounts | Thirty-one never-signed-in current `ghost_activation` accounts remain unchanged. | Carl-approved account-level hold |
| QA replacement | P1.2-b and P1.2-d evidence passed in allowlisted `unicorn-qa`; no production write followed. | Complete as QA evidence only |
| Operational target | Carl approved `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`) only; production is explicitly out of scope. | QA target approved; no action authorized |
| Action shape | Carl approved disable-first in `unicorn-qa`; direct deletion is deferred until after a separate clean observation and approval. | Action shape approved; execution not authorized |
| Historical invocation review | Eight audited target users fall in the June 3–16 provider-log gap; 56 fall in the retained period. An all-source sweep of every day in that gap found no retained rows from any current log source. Retained logs show 109 exact-path requests, while durable audit has 64 distinct target users. | Aggregate evidence complete; request-by-request reconstruction incomplete |
| RBAC/security review | The replacement path's role ceiling blocks internal-role escalation for browser and service-role callers. Disabled-account gaps in `is_tenant_parent_safe` and `has_tenant_admin_safe` are fixed live and merged; two non-escalation follow-ups remain separate. | Complete for this TOM gate; follow-ups remain separate |
| Broad legacy profile population | Four hundred eleven public profiles have no matching auth identity. Aggregate classification finds 356 membership-bearing and 55 membershipless profiles, with overlapping archived/disabled/contact/invitation indicators; no identifiers were exported. | Aggregate evidence complete; individual disposition remains explicitly out of scope for bulk retirement; hold |
| Edge retirement | No deployment or deletion packet has been approved. | Not authorized |

## Evidence reconciliation

### What the evidence establishes

- The repository has no remaining executable activation caller in `src/`,
  `supabase/functions/`, or `scripts/` after the bounded fail-closed guards.
- The guards are active in `bulk-account-actions` version 284 and
  `cohort-access-sender-worker` version 283, both effective at
  `2026-09-15T05:07:04.936Z`.
- The retained provider-log window contains 50 `OPTIONS`/200, 55 `POST`/200,
  and 4 `POST`/403 requests to the exact legacy path. These are request
  observations, not proof of 55 distinct successful mutations.
- The durable audit trail records 8 distinct target users in the pre-retained
  June 3–16 period and 56 in the retained period through the guard timestamp.
  It records 52 retained events with `email_sent = true` and 4 with
  `email_sent = false`, and zero `ghost_user_activated` rows after the guard.
- The durable audit trail is account-level corroboration. It does not create a
  one-to-one mapping from provider requests to mutations because the audit
  insert is best-effort and provider response bodies are unavailable.
- The bounded June 3–16 sweep checked all current provider-log sources for each
  day and found no retained rows from any source. This confirms the retention
  gap, not zero historical use.
- The 411-row mismatch population is now classified only in aggregate: 356
  rows have membership evidence (`tenant_members` or `tenant_users`), 55 are
  membershipless, 54 have no `tenant_id`, 4 have a contact-email match, 3 have
  an invitation-email match, 1 has an auth-email match, and 0 have an
  email-conflict indicator. These indicators overlap and do not justify a
  row-level conversion.
- The QA replacement path has been proven only in the approved QA fixture. It
  does not authorize production contact insertion, invitation, or retirement.

### What the evidence does not establish

- The provider's missing June 3–16 request rows cannot establish zero caller
  activity for that period. The all-source sweep confirms the gap but does not
  repair it. An alternative retained export is optional for aggregate hold
  evidence but required if Carl wants complete request-by-request historical
  reconstruction before a retirement decision.
- The two stale cancelled-job items have not been closed, deleted, retried, or
  repaired. A cancelled status is not itself a disposition.
- The 31 never-signed-in current ghost accounts have not been bulk-repaired,
  re-invited, or converted. Their hold is intentional and non-destructive.
- The 411-row public-profile/auth mismatch population is not a ghost set. Its
  aggregate indicators are recorded, but no row-level disposition, bulk
  classification, or conversion is justified by the current evidence.

## Recommended disposition

The recommended decision for the current checkpoint is **keep the guarded
deployment in place and do not retire the Edge Function yet**.

1. Preserve both fail-closed guards and the reset sender.
2. Preserve the approved hold for the two stale job items and the 31
   never-signed-in ghost accounts.
3. Treat the June 3–16 log gap as an explicit evidence limitation. Obtain an
   alternative provider export only if Carl requires request-level
   reconstruction; do not imply that the current aggregate evidence proves
   zero historical use.
4. Keep the 411 unmatched public profiles outside the ghost-retirement scope.
   The aggregate classification (356 membership-bearing, 55 membershipless)
   is evidence only; any row-level disposition requires a separately
   authorized packet.
5. Treat the RBAC/security review as complete for this gate. Track the two
   non-escalation invitation-path follow-ups separately; they do not authorize
   or require an activation retirement change.
6. Open a separate operational retirement packet only after Carl explicitly
   approves the exact target, timing, rollback owner, observation window, and
   audit requirements.

This recommendation preserves reversibility and prevents an old queued job,
stale UI, or legacy invitation from becoming a broken workflow while the
remaining evidence limitations are handled.

## Required contents of a future retirement packet

A later packet must be separately approved and must include, at minimum:

- exact Edge Function target and deployment state;
- confirmation that both indirect activation guards and the reset path remain
  deployed and verified;
- explicit treatment of the two cancelled-job pending items and 31 held
  accounts, with no implied bulk repair;
- the chosen disposition of the June 3–16 all-source log-retention gap and
  whether an alternative export is required for request-level reconstruction;
- the aggregate classification and row-level boundary for the 411 unmatched
  public profiles, with any conversion requiring a distinct approved packet;
- rollback owner, rollback mechanism, observation window, and post-action
  request/audit checks;
- a dated operational audit entry; and
- a fresh approval for the actual deployment, disable, or deletion action.

Until that packet exists and its gates are approved, the current guarded
deployment is the intended safe state.

**Related audit entries:** [caller freeze](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-activation-caller-freeze.md); [read-only census](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-read-only-census.md); [pending-item reconciliation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-pending-item-reconciliation.md); [hold and historical invocation review](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-hold-and-history.md); [durable audit correlation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-audit-correlation.md); [aggregate legacy-profile classification](../../../../audit-log/entries/2026-09-15-tom-p12c-aggregate-legacy-profile-classification.md); [operational retirement packet](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-operational-packet.md); [action-shape approval](../../../../audit-log/entries/2026-09-15-tom-p12c-retirement-action-shape-approval.md); [disabled tenant-parent/admin authorization gap](../../../../audit-log/entries/2026-09-15-gate-tenant-parent-and-admin-safe-on-disabled.md)
