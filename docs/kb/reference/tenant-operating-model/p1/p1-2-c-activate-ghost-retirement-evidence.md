# TOM P1.2-c — `activate-ghost-user` retirement evidence

> **Last updated:** 2026-09-15 · **Status:** static closure and read-only census complete; retirement not authorized
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
freeze legacy activation dispatch and the first aggregate-only live census.
It does not disable or delete the `activate-ghost-user` function, drain or
mutate existing jobs, alter invitations, or change production data.

## Static caller census at current `origin/main`

The final candidate references were re-checked at merged `origin/main` commit
`c09bcac99` from [PR #1356](https://github.com/vivacityrto/unicorn-cms-f09c59e5/pull/1356)
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

## Read-only live census (2026-09-15)

The first approved aggregate-only census ran against the configured hosted
project. It returned counts only; no identifiers, emails, job rows, auth rows,
invitations, or memberships were exported or changed.

### Job state

- Activation jobs: 4 total — 2 completed and 2 cancelled.
- Completed activation jobs account for 2 sent items.
- The 2 cancelled activation jobs retain 2 pending item rows. No queued,
  running, failed, or currently locked activation items were observed.
- Reset jobs were present separately and were not touched.

The cancelled jobs and their pending items are an explicit disposition gate;
the census did not close, delete, retry, or mutate them.

### Pending-item reconciliation

The two pending rows are a stale snapshot rather than the outstanding
ghost-password cohort: both carry `state_snapshot = 'ghost'` and
`planned_action = 'activate'`, but both currently resolve to active
`primary_contact` profiles with no `ghost_activation` flag. Both are
never-signed-in, have never been locked or attempted, and have no recorded
reason. The cancelled jobs and their pending items date from 2026-06-03 UTC;
neither pending item has a `processed_at` timestamp. Each matches an expired
`sent` invitation with no token hash; neither
matches a pending, accepted, or revoked invitation. This narrows the required
decision to stale-job/invitation disposition and does not authorize either.

### Accounts and invitations

- `auth.users`: 223 total; 41 carry `ghost_activation = true`, of which 31
  have never signed in and 10 have signed in. All 41 have a matching public
  profile. One auth user has no stored encrypted password overall; none of
  the 41 ghost-flagged users are in that subset.
- `public.users`: 627 total; 411 profiles have no matching auth identity.
  This is a broad legacy-profile population and must not be treated as a
  ghost-activation set without per-row reconciliation.
- `user_invitations`: 35 `sent` rows have no token hash and all 35 are
  expired; 57 `pending` rows remain, of which 2 are currently open by the
  expiry/revocation test.

A correlated aggregate check over the 41 current ghost-flagged auth users
found 1 with no invitation match, 1 with a currently open pending invitation,
and 38 with some pending-status invitation history. These status-history
counts are not additive; they are separate existence checks because one user
can have multiple invitation records. This is an account-level reconciliation
signal, not authorization to repair or close any row.

The 31 never-signed-in ghost-flagged accounts and the expired legacy
invitation ledger need a safe hold or completion plan before any function
disable/delete decision. No such plan was applied by this census.

### Provider function logs

The available unified function-log window covered
`2026-09-14T05:12:00.908` through `2026-09-15T05:10:02.917` (provider-reported
timestamps). It contained zero requests to
`/functions/v1/activate-ghost-user`. This is a clean 24-hour observation only;
it is not historical zero-caller proof. A longer owner-approved window or an
equivalent retained export is still required.

### Approved hold and historical invocation review (2026-09-15)

Carl approved a non-destructive hold for the two stale cancelled-job items
and the 31 never-signed-in current `ghost_activation` accounts. This work
does not retry, close, delete, bulk-repair, or newly invite any of those
rows. Any future account completion must use individually classified standard
contact/invitation flow, and the existing password-reset path remains
supported. The hold is a disposition decision, not a live state mutation.

The hosted fail-closed guards are active in `bulk-account-actions` version
284 and `cohort-access-sender-worker` version 283, both deployed at
`2026-09-15T05:07:04.936Z`. The approved historical review covered the
retained contiguous window from `2026-06-17T05:00:00Z` through that deployment
timestamp. The provider returned no retained function rows for the queried
`2026-06-03` through `2026-06-16` slices; this is a retention/coverage gap,
not proof of zero usage. In the retained window it returned 109 requests to
the exact `/functions/v1/activate-ghost-user` path: 50 `OPTIONS`/200,
55 `POST`/200, and 4 `POST`/403. No exact-path request was observed in the
final `2026-09-13T05:00:00Z` to guard-effective slice. The logs expose HTTP
status but not the response body or row-level outcome, so the 55 `POST`/200
responses are historical legacy invocations, not proof of 55 distinct account
activations or successful mutations.

The durable `public.audit_eos_events` trail provides row-level corroboration
without exporting identifiers. It records 8 distinct `ghost_user_activated`
target users in the pre-retained June 3–16 period and 56 distinct target users
in the retained period through guard deployment. In the retained set, all 56
still have current auth and public-profile rows, 39 still carry the current
`ghost_activation` flag, 31 have never signed in, and 55 have some invitation
match. The audit details report `email_sent = true` for 52 and `false` for 4
of those retained events. There are zero `ghost_user_activated` audit rows
after the guard-effective timestamp. This is stronger account-level evidence
than the HTTP status alone, but it does not turn the 55 POST/200 responses into
a one-to-one request/event mapping; the audit insert is best-effort and the
provider log body is unavailable. See the [durable audit correlation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-audit-correlation.md).

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

1. **Static reachability closure:** complete on merged `origin/main` at
   `c09bcac99`; the final census retains only intentional documentation,
   migration-history, configuration, compatibility, and fail-closed guard
   references.
2. **Job-state disposition:** the census and aggregate reconciliation are
   complete. The 2 cancelled activation jobs contain stale ghost snapshots
   for active primary contacts and match expired sent/no-token invitations;
   Carl approved a non-destructive hold, with no retry, close, delete, or
   mutation performed. Do not assume the absence of a cron schedule is a
   disposition.
3. **Live invocation history:** the approved provider-log review is complete
   for the retained period, and the durable audit trail supplies aggregate
   account-level corroboration for 8 pre-retained and 56 retained historical
   activation events. The queried June 3–16 provider-log slices still have no
   retained rows, so they cannot establish zero-caller proof; the 109 retained
   HTTP requests and 64 durable activation audit events show historical use,
   not retirement safety. No alternative export is required to keep the
   function held, but it would be needed for a complete request-by-request
   historical reconstruction.
4. **Outstanding-account disposition:** the first census found 31
   never-signed-in `ghost_activation` accounts, 35 expired sent/no-token
   legacy invitation rows, and a broad 411-row public-profile/auth mismatch
   population. Durable activation-audit reconciliation confirms 56 retained
   historical target users are still present, including the 31 never-signed-in
   current ghost-flagged accounts; Carl approved a non-destructive account-level
   hold, and no row-level completion, invitation, repair, or mutation has been
   performed. The broad mismatch population remains outside the ghost set until
   individually classified.
5. **Replacement workflow evidence:** the approved QA fixture has now proven
   contact projection plus contact promotion → pending invitation → acceptance
   with exactly-once behavior, QA no-send, idempotent retry, cleanup, and audit
   preservation. Any production or broader-tenant observation remains a
   separate gate.
6. **RBAC/security review: complete 2026-09-15 (Claude/RBAC v6).** Traced the
   actual replacement-path authorization chain (`swap_tenant_user_to_contact`,
   `mark_tenant_contact_promoted`, `invite-user`, `user_invitations`' own RLS)
   and found two related but distinct issues:
   - **Fixed:** `is_tenant_parent_safe` (behind the swap/promote RPCs) and
     `has_tenant_admin_safe` (behind `user_invitations`' RLS) never excluded
     disabled/archived accounts — 359 and 338 currently-affected accounts
     respectively. Both now correctly denied; zero regression for active
     accounts. See
     [audit entry](../../../../audit-log/entries/2026-09-15-gate-tenant-parent-and-admin-safe-on-disabled.md).
   - **Confirmed safe, not a gap:** a direct browser `INSERT` into
     `user_invitations` cannot escalate to an internal Vivacity role —
     `trg_enforce_invitation_role_ceiling` independently blocks that for
     every caller, service-role or browser alike.
   - **Flagged, not fixed (non-escalation, doesn't block retirement):** a
     direct browser insert can still bypass `invite-user`'s own business
     rules (capacity cap, rate limit, tenant-admin relationship-role
     allowlist) for a same-tenant client-role invitation; and `invite-user`'s
     own `isTenantAdmin` branch doesn't filter `disabled` on the caller's
     profile. Both are pre-existing, orthogonal to ghost-activation
     retirement specifically, and are follow-up candidates for RBAC v6 or
     TOM, not blockers for this gate.

## Proposed retirement sequence

The safest sequence is additive and reversible:

1. preserve the merged fail-closed activation guards and reset sender;
2. retain the approved non-destructive hold for the 2 cancelled jobs and
   their 2 pending items, without assuming that a cancelled status is enough;
3. retain the approved account-level hold for the 31 never-signed-in ghost
   accounts and reconcile the expired legacy invitation ledger only through
   individually classified, separately authorized work;
4. retain the current guarded deployment, optionally obtain an alternative
   request-log export if request-by-request reconstruction is required — the
   RBAC/security review is now complete (see item 6 above); and
5. only then open a separate retirement/deployment packet for disabling or
   deleting `activate-ghost-user`, with rollback owner and audit entry.

Disabling the function before steps 1–4 would turn any stale UI, queued job, or
old invitation into a broken workflow. Deleting the deployment is a separate
operational action and is not implied by this packet.

## Current conclusion

The candidate is now **static-zero-caller after the bounded guard**: the direct
per-row staff UI path is absent, and the two indirect paths reject before any
legacy sender invocation or cohort-item lease. The approved QA replacement
evidence, non-destructive job/account holds, and retained-window log review
are complete. Durable audit correlation now confirms 64 historical activation
events across the provider-retention gap and retained window, including 31
never-signed-in current ghost-flagged accounts in the retained set, with zero
post-guard activation audit rows. Retirement remains held because the request
log has a June 3–16 retention gap and the broader legacy profile set is not
classified. The RBAC/security review is now complete (item 6 above): the
replacement path's protection against privilege escalation was confirmed
already correct, a real disabled-account gap in its authorization chain was
found and fixed, and two smaller, non-escalation, non-blocking gaps were
flagged as follow-ups. A separate deployment/retirement decision is still
required.

**Audit entries:** [2026-09-15 TOM P1.2-c freeze indirect ghost activation callers](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-activation-caller-freeze.md); [2026-09-15 TOM P1.2-c read-only census](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-read-only-census.md); [2026-09-15 TOM P1.2-c pending-item reconciliation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-pending-item-reconciliation.md); [2026-09-15 TOM P1.2-c hold and historical invocation review](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-hold-and-history.md); [2026-09-15 TOM P1.2-c durable audit correlation](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-retirement-audit-correlation.md); [2026-09-15 RBAC/security review — tenant-parent/admin disabled-account gap](../../../../audit-log/entries/2026-09-15-gate-tenant-parent-and-admin-safe-on-disabled.md)
