# TOM P1.2-d — guarded ghost-contact apply-design packet

> **Last updated:** 2026-09-15 · **Reconsider by:** 2026-10-15 · **Confidence:** high — bounded by the accepted QA snapshot and the closed P1.2 lifecycle decisions
> **Parent plan:** [Tenant Operating Model data-architecture plan](../../tenant-operating-model-data-architecture-plan-2026-09-02.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** bounded QA batch complete; production/runtime separately gated
> **Owner:** TOM/Codex, with RBAC and Client Health review
> **Scope:** implement and execute allowlisted QA-only contact projection from frozen, separately approved candidate artifacts
> **Dependencies:** [P1.2 ghost-user retirement and contact-promotion scope](p1-2-ghost-user-retirement-contact-promotion-scope.md); [P1.2-a evidence contract](p1-2-a-ghost-contact-dry-run-evidence-packet.md); [P1.2-b guarded dry-run execution packet](p1-2-b-ghost-contact-dry-run-execution-packet.md); [P1.1 contact-promotion implementation packet](p1-1-first-contact-promotion-implementation-packet.md)
> **Exit criteria:** the reviewed apply sequence, frozen-input contract, idempotency/concurrency rules, rollback boundary, guarded QA-only implementation, one-row canary, 5/5/4 bounded QA batches, and read-only postflight evidence are complete; production/runtime work remains separately gated
> **Evidence:** [P1.2-b QA dry-run audit](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-dry-run.md); [P1.2-d one-row canary audit](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-apply-canary.md); [P1.2-d bounded-batch audit](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-bounded-batch.md)
> **Audit entry:** [2026-09-15 TOM P1.2-d bounded QA apply batches](../../../../audit-log/entries/2026-09-15-tom-p12-ghost-contact-bounded-batch.md)

## Purpose and hard boundary

This packet turns the accepted P1.2-b read-only evidence into a safe design
and bounded QA execution record for contact projection. The QA write was
authorized separately and is evidenced below. The packet does not authorize a
migration, invitation, Edge Function deployment, `activate-ghost-user`
retirement, production observation, or use of any redacted artifact as a write
input.

The operation designed here projects a pre-login ghost profile into
`tenant_contacts`. It does not create an auth identity, change
`tenant_users`/`tenant_members`, alter the legacy `public.users` profile, send
an invitation, or grant access. Acceptance through the standard invitation
path remains the later materialization boundary.

## Frozen evidence and input contract

The accepted QA evidence is workflow `34919427510`, report run ID
`453b20f5-510f-4f43-8322-8551dfedf689`, source commit
`77ab183dd37c23f11a01bccb24402b1aca94efc2`, with 15 eligible candidates and
zero holdouts. It is evidence and a reconciliation baseline only.

The artifact is redacted: tenant IDs and source UUIDs are hashed. It must not
be used to drive an apply. Before any canary, a new read-only snapshot must
be run against the same allowlisted QA project and produce two separately
handled outputs:

1. a redacted evidence report for normal review; and
2. an identifier-bearing candidate manifest containing only the fields needed
   to recheck and project the candidates.

The second output requires fresh approval for its narrower audience, private
encrypted storage, short retention, and operator access. It must carry:

- a new report `run_id`, `snapshot_at`, `source_commit`, target URL, and
  candidate count;
- one row per `(tenant_id, lower(trim(email)))` candidate;
- source profile UUID and source membership-row evidence;
- a deterministic candidate fingerprint over the source and target fields;
- the classification and expected action from the read-only report; and
- a manifest hash recorded in the apply batch metadata.

The apply must refuse a manifest whose source commit, target URL, candidate
count, row grain, or report contract does not match the approved packet. It
must not recompute a broader population during a write.

The approved first canary followed this contract. The fresh snapshot contained
15 candidate rows, selected row index `0`, and was consumed only by the private
identifier-bearing manifest and the protected QA runner. The remaining rows
were not processed.

The subsequent approved execution used source commit
`244abb06369b372fc86e5c9ec999583e79ad7079` and three fresh private snapshots:
workflow `34928094192` required 14 candidates and created 5, workflow
`34928192320` required 9 and created 5, and workflow `34928288672` required 4
and created 4. Each transaction passed its aggregate postflight before the
next batch started. The final read-only reconciliation workflow
`34928388148` reported 15 existing-contact matches, 0 eligible candidates,
and 0 projected future inserts.

## Proposed apply shape

The first implementation is a server-side, QA-only operation with a small
explicit batch, not a browser loop and not reuse of the read-only CLI with
write flags. The implementation, focused tests, and approval gates are now
landed and the one-row canary has completed successfully.

### Stage 0 — approval and freeze

Before obtaining a write-capable credential or starting a batch, record:

- exact `unicorn-qa` project URL and project ref;
- the approved manifest `run_id`, hash, source commit, and snapshot time;
- the canary row count and maximum batch size;
- operator, reviewer, artifact location, and retention owner;
- rollback owner and stop conditions; and
- confirmation that no invitation, activation, fixture-seed, or competing
  migration job is touching the same QA rows.

Production is out of scope. A production run would require a different packet
and explicit authority.

### Stage 1 — preflight and per-row recheck

For each manifest row, inside the same transaction that may create the
contact:

1. acquire a deterministic per-tenant/email serialization lock;
2. re-read the source profile and confirm it is still a ghost;
3. re-read both membership ledgers and confirm the tenant association and
   source fingerprint are unchanged;
4. re-read contacts and invitations for the normalized tenant/email key;
5. stop the row without writing if any source value, classification, or
   relationship has changed; and
6. stop the whole batch if the target, schema contract, credential identity,
   or write count is not the approved shape.

A changed row becomes `stale_manifest`/manual review evidence. It is never
silently refreshed into a new candidate inside the apply.

### Stage 2 — one-row QA canary

The first write batch contains exactly one approved `candidate` row. It must:

- insert one active `tenant_contacts` row with the approved name, normalized
  email, available phone/job-title/position data, tenant ID, and operator or
  batch actor metadata;
- record the batch ID, manifest hash, source UUID, source membership evidence,
  candidate fingerprint, and created contact ID in the durable audit/batch
  record selected by the implementation review;
- leave `public.users`, `auth.users`, `tenant_users`, `tenant_members`, and
  `user_invitations` unchanged; and
- return a redacted result that proves the created-row count and zero changes
  outside `tenant_contacts`/the audit record.

No invitation was sent in this stage. The canary is a contact projection, not
a promotion or account-activation test.

### Stage 3 — bounded QA batch

Only after the one-row canary passes its postflight did the operator proceed
to the remaining approved QA candidates, in the authorized deterministic
5/5/4 sequence. Each transaction enforced the exact remaining-candidate
count (14, then 9, then 4), used a maximum of five rows, and stopped before
writing if the count or any row contract differed.

The bounded execution was complete only when every manifest row was classified as
`created`, `already_contact`, `pending_invite_hold`, `stale_manifest`, or
`manual_review`, with no unclassified row and no implicit retry that changes
the frozen input.

### Stage 4 — postflight and reconciliation

The postflight must prove, using a separate read-only connection or protected
read step:

- created contact count equals the approved `created` result count;
- every created row has the expected tenant/email fingerprint and batch ID;
- no source profile, membership ledger, invitation, auth identity, or access
  row changed;
- no duplicate active contact exists for a candidate key;
- no outbound email or Edge Function invocation occurred;
- audit/batch records cover every created or held row; and
- a repeat of the read-only classifier reports the expected new contact
  matches without changing the source ghost population.

The redacted postflight summary is the shareable artifact. Any identifier-
bearing manifest and row-level audit details remain private.

## Classification and idempotency rules

The apply consumes only rows classified as `candidate` by the frozen report.
The following are non-write outcomes:

| Recheck result | Apply outcome |
| --- | --- |
| Source ghost, tenant membership, email, and fingerprint unchanged; no active contact or pending invitation | Create one contact projection |
| Active contact already matches tenant/email | `already_contact`; no insert |
| Active pending invitation matches tenant/email | `pending_invite_hold`; no invite and no duplicate projection until the pending-contact link contract is explicit |
| Archived contact matches tenant/email | `manual_review`; never silently reactivate or create a second active contact |
| Multiple source ghosts or incompatible source fields | `manual_review`; no insert |
| Missing tenant, unusable email, or changed source fingerprint | `manual_review`/`stale_manifest`; no insert |

The idempotency key is `(tenant_id, lower(trim(email)))`, while the source
UUID and candidate fingerprint prove which legacy row supplied the projection.
The implementation must not rely on a database uniqueness constraint that has
not been verified. It must use a transaction-scoped serialization mechanism
and repeat the active-contact/pending-invitation checks while holding that
lock. Adding a normalized-email uniqueness constraint would be a separate
schema packet, not an incidental part of this canary.

## Rollback and compensation boundary

Rollback is by an immutable batch ID, never by rerunning a broad inverse
query. For each created contact, the durable batch/audit record must retain
the created contact ID, candidate key, source fingerprint, manifest hash,
created-at timestamp, and actor.

A rollback may remove or archive only a contact created by that batch when:

- the row still has the same batch marker and fingerprint;
- it has not been edited, promoted, linked to an invitation, or referenced by
  a later workflow; and
- the rollback owner has reviewed the row-level result.

If any condition fails, the row is held for manual compensation. Rollback
never deletes or rewrites the source ghost profile, membership history,
invitation/audit history, or a contact that a user has subsequently edited or
promoted.

The chosen batch/audit storage must be resolved before implementation. A
private manifest alone is insufficient for operational rollback, while a new
table or RPC would require its own schema/RLS/security review.

## Security and cross-initiative gates

- A browser or client-supplied service credential must never perform the
  apply. The operation must run through a purpose-built server-side boundary
  with an allowlisted QA target and an explicit operation mode.
- Pre-login contacts receive no `tenant_members` access, relationship role, or
  access scope. The standard invitation/acceptance path remains the only
  access-materialization boundary.
- The write boundary must be checked by TOM for tenant/contact semantics and
  by RBAC for privilege and denial behavior. Claude reviews only any RBAC
  classification the implementation surfaces; this packet does not change
  RBAC capability rows.
- Client Health review is required only if source contact or membership data
  is consumed by a Client Health projection; the current candidate apply has
  no such consumer.
- Shared artifacts contain counts and hashes only. Raw email, source UUID,
  invitation token, service credential, and private row-level audit details
  remain in the restricted operator location.

## Required approvals before any implementation or canary

| Gate | Required evidence | Owner | Current status |
| --- | --- | --- | --- |
| Design | This packet reviewed; no hidden write path or scope expansion | Carl/TOM | approved and implemented |
| Target | Exact allowlisted `unicorn-qa` URL and no production flag | Carl/environment owner | approved; all hosted batches passed |
| Identifier-bearing manifest | Fresh snapshot, hash, narrow audience, private retention | Carl/security/operations | approved per batch; private artifacts cleaned up |
| Write boundary | Purpose-built server-side implementation, tests, and target fail-closed guard | TOM/security | implemented and verified |
| Canary scope | One row, then bounded chunks, with stop conditions | Carl/operator | one-row canary plus 5/5/4 batches complete |
| Batch/audit storage | Durable batch ID and row-level rollback evidence | TOM/security | complete for all 15 QA projections |
| Manual holds | Owner and disposition for stale, pending, archived, or collision rows | TOM/RBAC | defined; no current holdouts |
| Postflight | Read-only reconciliation and zero-unexpected-write proof | Codex/QA | complete |
| Production | Separate packet and explicit authority | Carl | out of scope |

## What this packet does and does not close

This packet closes the planning and execution gates for the approved QA
contact projections: one canary plus 5/5/4 bounded batches created 15 contact
projections and 15 audit rows, with per-batch postflight and a terminal
read-only classifier reconciliation. The private identifier-bearing manifests
and raw row-level details were operator-only and were removed after each
workflow completed. The packet does not authorize ghost retirement,
invitation activity, or production/runtime work. It also does not provide
zero-caller evidence for
`activate-ghost-user`; the P1.2-c retirement packet remains independently
gated until its UI, job-state, historical invocation, and outstanding-account
evidence are complete.

The next possible action is a separately scoped retirement or production
packet. No further QA contact rows remain eligible in the final snapshot.
