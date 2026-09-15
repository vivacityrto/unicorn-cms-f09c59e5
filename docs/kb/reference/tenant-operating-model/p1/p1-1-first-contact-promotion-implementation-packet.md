# TOM P1.1 — first contact-promotion implementation packet

> **Status:** draft implementation packet; static characterization refreshed
> 2026-09-15 and the authorized QA canary passed; production/runtime rollout,
> schema, data, credential, invitation, and migration work remain separately
> gated and are not authorized by this document.
>
> **Parent:** [P1.1 membership and ownership compatibility
> scope](p1-1-membership-ownership-compatibility-scope.md)
>
> **Related lifecycle design:** [P1.2 ghost-user retirement and contact
> promotion scope](p1-2-ghost-user-retirement-contact-promotion-scope.md)
>
> **QA delivery verification:** [QA invitation-delivery verification and
> runbook](p1-1-qa-invitation-delivery-verification.md)
>
> **Owners:** TOM (relationship and lifecycle semantics), RBAC (capability and
> denial interpretation), Client Health (provenance if a source is consumed),
> security (identity, invitation, and privileged-boundary review)
>
> **Audit entry:** [2026-09-15 TOM P1.1 hosted QA contact-promotion canary](../../../../audit-log/entries/2026-09-15-tom-p11-contact-promotion-qa-canary.md)

## 0. Decision record — 2026-09-14

The following decisions were confirmed by Carl for the next bounded TOM
evaluation. They narrow the packet; they do not authorize schema, RLS, Edge,
email-provider, production-data, or other behavior-bearing changes.

1. **Bounded lifecycle:** cover only `contact → invite-user` pending
   invitation → `accept_invitation_v2` acceptance materialization.
2. **Canonical writer path:** treat `TenantContactsSection` /
   `promoteContact` as the initiating UI and adapter, `invite-user` as the
   pending-invitation writer, and `accept_invitation_v2` as the acceptance
   materializer. Legacy writers remain out of scope.
3. **Acceptance contract:** deny wrong-tenant and disabled actors; make
   acceptance retry-safe and idempotent; and prevent partial materialization.
4. **Final approval owner:** Carl owns final approval of the contract, QA
   evidence, rollback plan, and audit evidence.
5. **Rollback owner:** Carl owns rollback approval and execution.
6. **Audit owner:** Carl owns the audit evidence.
7. **Hosted QA authorization:** hosted QA may proceed against the existing
   allowlisted `unicorn-qa` project (`qfpxvumcrnzrjyvqkicq`). Before any
   fixture write or acceptance run, the operator must still identify the
   approved QA identities, synthetic tenant/contact fixture, reset/cleanup
   method, and execution window. Secrets must remain in the protected QA
   environment and must not be pasted into chat or committed.
8. **Delivery and acceptance evidence:** exercise the standard invitation
   path with the approved controlled plus-alias, capture the `inviteUrl`
   returned by `invite-user`, and open that URL directly as the recipient. If
   the allowlisted QA deployment has its existing fail-closed no-send mode
   enabled, no mailbox access is needed; otherwise Mailgun webhook status is
   supplementary delivery evidence, not the source of the invitation token.
9. **Hosted QA inviter:** use a dedicated synthetic primary-contact persona
   provisioned by the protected QA seed workflow. Do not change the existing
   `Client Admin A` fixture to make the canary reachable; its current
   `relationship_role=user` state remains an intentional baseline.

## 1. Packet recommendation

The first TOM runtime packet should establish the already-approved lifecycle
boundary for a **known contact who has no authenticated Unicorn account**:

```text
tenant contact (no seat/access)
  → explicit relationship-role promotion and invitation
  → pending invitation (contact remains visible, duplicate promotion disabled)
  → recipient acceptance
  → auth.users + public.users + tenant_users + tenant_members
```

This is smaller and safer than beginning with a global `tenant_users` →
`tenant_members` read swap, a ghost backfill, or retirement of
`activate-ghost-user`. It uses a live, named caller and an existing acceptance
boundary while preserving the current ledgers as compatibility evidence.

The packet's first implementation candidate is therefore the standard contact
promotion/acceptance writer family:

| Boundary | Current source evidence | Proposed packet treatment |
|---|---|---|
| Promotion UI | `TenantContactsSection.tsx:247-277` calls `promoteContactViaInvite(tenantId, contact, promoteRole)` and exposes an explicit relationship-role selector | Characterize and preserve role selection; no label-based Parent/Child inference |
| Promotion adapter | `src/features/client-identity/promoteContact.ts` invokes `invite-user` with `skip_email: false` | Keep the current production invitation contract; send the canary to the controlled QA alias and use the returned invitation URL for acceptance; define idempotency, pending-state, and error contract |
| Invitation writer | `supabase/functions/invite-user/index.ts` validates `relationship_role` and creates the pending invitation path | Review authenticated caller, tenant-admin boundary, role mapping, duplicate/seat behavior, and audit evidence |
| Acceptance materialization | `accept_invitation_v2` creates/relinks `public.users`, `tenant_users`, and `tenant_members` after acceptance | Treat acceptance as the access materialization boundary; prove exactly-once behavior |
| Contact presentation | `TenantContactsSection.tsx:282` filters active, unpromoted contacts; pending state is a documented target | Preserve contact visibility with `Pending invitation`; block duplicate promotion |

The legacy `activate-ghost-user` path, bulk activation action, cohort worker,
ghost projection/backfill, and any global ledger read swap are explicitly out
of this first packet. They need separate caller, migration, operational, and
retirement evidence.

### 1.1 Static characterization refresh (2026-09-14)

The current source confirms the following exact flow. This is evidence for the
packet, not an authorization to change any of these boundaries:

| Step | Current behavior and source evidence | Gate/implication |
|---|---|---|
| Contact surface | `TenantContactsSection.tsx:102-134` reads `tenant_contacts` and pending `user_invitations`; `:282-287` presents active, unpromoted persisted contacts plus legacy contacts. | Pre-login contacts have no seat or access row. Pending state is inferred by normalized email and must not be treated as acceptance. |
| Role selection | `TenantContactsSection.tsx:241-250` defaults to `user`, lets the operator choose a `RelationshipRole`, and calls the adapter with the selected value. | Relationship role is explicit UI input; no Parent/Child inference is performed by the caller. |
| Adapter | `src/features/client-identity/promoteContact.ts:10-41` requires a session, invokes `invite-user`, maps `primary_contact`/`secondary_contact` to legacy `Admin` and other roles to `User`, and always uses `skip_email: false`. | The adapter preserves the standard invitation contract. Its focused test oracle is `src/test/client-identity/promote-contact.test.ts:26-60` (payload plus unauthenticated denial). |
| Tenant-admin guard | `invite-user/index.ts:64-120,199-236` resolves the bearer identity, loads `public.users`, verifies target-tenant membership in `tenant_users`, and restricts client invites to `academy_user`, `secondary_contact`, or `user`; non-staff may assign only `Admin` or `User`. | **Resolved policy:** primary-contact promotion is staff-only. Preserve the current tenant-admin denial (`RELATIONSHIP_ROLE_NOT_ALLOWED`) and do not widen the Edge allowlist; any future change requires a separate RBAC/security packet. |
| Pending invitation | `invite-user/index.ts:613-681` performs capacity checking, rejects an active same-email/tenant pending invitation with `INVITE_EXISTS`, deletes an expired one, inserts `user_invitations` with the explicit `relationship_role`, conditionally invokes `send-invitation-email` under the fail-closed QA delivery seam, and returns the generated invitation URL. | The pending-invitation canary uses the standard path with a controlled QA alias; acceptance uses the returned URL whether delivery is enabled or QA no-send is active. The `skip_email` flag is excluded because it creates membership directly and bypasses acceptance. Concurrent duplicate-attempt behavior and email-dispatch failure semantics remain separate cases. |
| Acceptance | `20260827020000_contact_swap_promote_timeline_events.sql:190-254` authenticates the token/user relationship, handles pending/accepted/expired states, and resolves the invitation relationship role. Lines `262-343` derive legacy role/access fields and upsert `public.users`, `tenant_users`, and `tenant_members`; `:345-363` updates the profile, marks the invitation accepted, and archives/matches the contact; `:365-413` writes timeline/audit evidence. | This is a `SECURITY DEFINER` materialization boundary and is out of scope for a compatibility-only frontend change. Exactly-once retry and concurrent acceptance require direct server-side characterization before authorization. |

The current mapping is therefore:

| Selected relationship role | Current legacy/access mapping at acceptance |
|---|---|
| `primary_contact` | `tenant_users.role=parent`, `primary_contact=true`, `access_scope=full`; `public.users.unicorn_role=Admin`, `user_type=Client Parent`; `tenant_members.role=Admin`, `status=active` |
| `secondary_contact` | `tenant_users.role=parent`, `secondary_contact=true`, `access_scope=full`; `public.users.unicorn_role=Admin`, `user_type=Client Parent`; `tenant_members.role=Admin`, `status=active` |
| `user` | `tenant_users.role=child`, `access_scope=full`; `public.users.unicorn_role=User`, `user_type=Client Child`; `tenant_members.role=General User`, `status=active` |
| `academy_user` | `tenant_users.role=child`, `access_scope=academy_only`; `public.users.unicorn_role=Academy User`, `user_type=Client Child`; `tenant_members.role=General User`, `status=inactive` |

This mapping describes current compatibility behavior only. It does not
approve a future RBAC capability, role default, or tenant-membership authority.
The existing adapter tests are a focused unit oracle for the client-side
payload/auth guard; they do not prove the Edge denial matrix or the
`SECURITY DEFINER` acceptance transaction. Those remain required before a
runtime or server-boundary packet can be authorized.

### 1.2 Writer contract reconciliation and evidence gaps (2026-09-14)

This reconciliation is limited to the first contact-promotion writer family.
The legacy ghost, bulk-invitation, cohort, and M365 provisioning writers stay
outside this packet and require their own caller, operational, and retirement
evidence.

| Boundary | Current contract evidence | Evidence status and remaining gap |
|---|---|---|
| Contact UI and pending presentation | `TenantContactsSection.tsx` reads active contacts and pending `user_invitations` rows, normalizes pending email state, exposes an explicit relationship-role selector, and calls `promoteContactViaInvite`. | Static source evidence is complete for the current flow. No focused component oracle was found for loading/empty/pending/duplicate states or pending-state refresh after an error. |
| Promotion adapter | `promoteContact.ts` requires an authenticated session, preserves the `invite-user` payload, maps relationship roles to the current legacy role field, and keeps `skip_email: false`. `promote-contact.test.ts` covers the payload and unauthenticated denial. | Adapter contract is unit-tested. UI error mapping, pending-state side effects, and the Edge boundary remain unproven by an integrated oracle. |
| Invitation writer | The standard `invite-user` path checks caller/tenant and role boundaries, capacity, active duplicate invitations, expiry cleanup, pending-row insertion, audit/event side effects, conditionally invokes `send-invitation-email` through the fail-closed QA seam, and returns an invitation URL. | Static evidence exists. The bounded canary will use the controlled QA alias and returned URL; Mailgun webhook status or QA suppression is recorded when observable. A complete direct contract matrix is still required for wrong tenant/actor, disabled actor, collision, concurrent duplicate attempts, capacity, audit failure, and email-dispatch failure semantics. |
| Acceptance materialization | `accept_invitation_v2` authenticates the invited identity, handles pending/accepted/expired states, derives the compatibility mapping, upserts `public.users`, `tenant_users`, and `tenant_members`, archives the matching contact, and records timeline/audit evidence. | No dedicated acceptance test was found in the repository. Exactly-once retry, concurrent acceptance, identity collision, wrong-tenant/disabled-actor denial, and no-half-materialization behavior remain unproven. |

The resulting evidence ledger is:

- **W-01 — UI oracle:** focused component coverage for pending and duplicate
  promotion states is required before a runtime UI change.
- **W-02 — invitation boundary:** direct Edge contract coverage must prove the
  negative authorization and idempotency cases without sending real email.
- **W-03 — acceptance boundary:** a server-side/static contract plus an
  approved authenticated QA oracle must prove retry, concurrency, and
  reconciliation behavior.
- **W-04 — execution ownership:** the QA target and rollback/audit ownership
  are now recorded above. The approved QA identities, synthetic fixture,
  reset/cleanup method, artifact owner/retention, execution window, and
  security review remain unchecked execution gates.

This register records evidence gaps only. It does not approve a hosted run,
credential use, fixture seeding, runtime change, migration, invitation, Edge
deployment, or production action.

## 2. Canonical contract and invariants

The packet carries forward the approved TOM directions:

| Lifecycle state | Canonical records | Access/seat meaning | Required invariant |
|---|---|---|---|
| Contact | `tenant_contacts` | No login, no tenant access, no relationship role or access scope | Contact may be edited/archived/promoted but cannot authenticate through a membership row |
| Invitation pending | `tenant_contacts` + one linked pending `user_invitations` state | Pending promotion reserves a seat per the approved product decision; no authenticated access yet | Contact remains visible as pending and repeated promotion is idempotently rejected or suppressed |
| Accepted tenant user | `auth.users`, `public.users`, `tenant_users`, `tenant_members` | Access derives from accepted relationship role and explicit scope | Materialization occurs once, with audit provenance and no duplicate membership |
| Cancelled/expired invitation | Contact plus cancelled/expired invitation evidence | No authenticated access; contact can be reconsidered under policy | No stale invitation can materialize access or create a duplicate promotion |

`tenant_members` is the future canonical authenticated membership/access ledger.
`tenant_contacts` is the pre-login contact surface. `tenant_users` remains a
compatibility projection during transition. `relationship_role` is distinct
from authorization capability, and legacy Parent/Child values are derived
compatibility data only.

The packet must preserve these invariants:

- tenant association is always explicit; email/name/domain never selects a
  tenant;
- a contact receives no access role or tenant membership before acceptance;
- promotion accepts an explicit `relationship_role` and derives any legacy
  fields from the approved mapping;
- the same tenant/contact cannot receive two active pending invitations;
- acceptance does not create duplicate `public.users`, `tenant_users`, or
  `tenant_members` rows when retried;
- a failure does not leave an apparently active access row or silently lose
  the invitation/contact link;
- contact, invitation, membership, and audit records retain actor, tenant,
  effective time, and source provenance; and
- no current legacy row is deleted, rewritten, or treated as corrected by this
  packet.

## 3. Exact scope and exclusions

### In scope for a future authorized canary

1. One approved synthetic QA tenant, one dedicated primary-contact inviter,
   and one contact with no auth identity.
2. The existing contact promotion UI and standard `invite-user` path,
   exercised in QA with the controlled plus-alias. The current production
   `skip_email: false` behavior is characterized but not changed by this
   packet; the QA run captures the returned invitation URL and does not
   require inbox access.
3. One explicit relationship role selected from the approved role set.
4. Pending invitation presentation and duplicate-promotion suppression.
5. One recipient acceptance through `accept_invitation_v2`.
6. Exactly-once reconciliation across the four identity/membership records.
7. Cancellation/expiry and retry/error characterization without client data.
8. Direct negative authorization cases for wrong tenant, wrong actor, disabled
   actor, expired invitation, and cross-tenant acceptance.

### Explicitly out of scope

- production contact projection or ghost-profile conversion;
- any deletion, archival, or remapping of `public.users`, `tenant_users`, or
  `tenant_members` source rows;
- removing or deploying `activate-ghost-user`, `bulk-account-actions`, or the
  cohort sender worker;
- changing RLS, grants, RPCs, triggers, Realtime, Edge configuration, or
  email-provider settings;
- choosing the final contact schema or replacing `tenant_users` reads;
- assigning a relationship role to a pre-login contact;
- broad role-default, RBAC pilot, or staff-portfolio policy changes; and
- using real client identities, production emails, production invitations, or
  production data as fixtures.

## 4. Required fixture and canary manifest

The future run must use a generated run ID and an allowlisted non-production
target. The minimum synthetic matrix is:

| Fixture | Purpose | Expected state |
|---|---|---|
| `contact-a` in `tenant-a` | Baseline promotion | Active contact, no auth identity, no membership/access row |
| `member-a` in `tenant-a` | Existing tenant user | Authenticated member with an explicit relationship role |
| `pending-a` in `tenant-a` | Idempotency | Contact plus one pending invitation; duplicate promotion suppressed |
| `collision-a` in `tenant-a` | Collision holdout | Same normalized email or conflicting source identity; no automatic merge or invitation |
| same labels in `tenant-b` | Tenant isolation | Same-named resources do not resolve across tenants |
| `membershipless-ghost` | Quarantine | No usable tenant association; not projected or promoted automatically |
| disabled/revoked actor | Denial | Cannot promote, accept, or read another tenant's contact |

The fixture manifest must record only synthetic identifiers, expected role and
scope, source commit, run ID/tag, and cleanup disposition. It must contain no
browser storage state, service key, real email, invitation secret, or copied
production UUID. A hosted run is a separate authorization gate; absent
credentials/personas are `Inconclusive`, never a substituted pass.

### QA delivery and acceptance

The standard invitation path is the lifecycle under test: it creates a
pending `user_invitations` row, conditionally invokes
`send-invitation-email` through the existing fail-closed QA seam, and returns
the generated invitation URL. The bounded canary uses only the approved
controlled plus-alias if delivery is enabled; it does not use the existing
`skip_email` request flag, because that flag creates identity and membership
rows directly and bypasses acceptance.

The private QA harness captures the returned URL, opens it directly as the
run-scoped recipient, and records Mailgun webhook/delivery status or the
absence of a delivery message when it is available. No inbox access or manual
email click is required. Tokens, raw emails, storage state, and credentials
remain outside the repository and shared chat.

## 5. Characterization and verification plan

The implementation packet is not ready to execute until the owner gate below
is signed. Once authorized, use both of these oracles because the workflow
crosses a mockable UI adapter and a real authenticated server-side acceptance
boundary:

### Oracle A — focused tests first

Add focused component/adapter/Edge contract tests for:

- loading/selected/empty contact states and explicit relationship-role choice;
- successful invitation request and pending-state display;
- duplicate pending invitation suppression;
- invalid role, missing tenant, collision, capacity, and invitation errors;
- wrong-tenant/wrong-actor/disabled-actor denial; and
- acceptance retry, cancellation/expiry, and no-half-materialization outcomes.

The tests must assert side effects and row-shape contracts, not merely that a
toast or route rendered. Any server branch not cheaply reachable through the
focused harness still needs a static/contract assertion.

### Oracle B — authenticated QA workflow

Run the exact promotion → invitation pending → acceptance workflow with a
short-lived approved QA identity and synthetic recipient. Assert:

- the contact is visible before promotion and remains visible as pending;
- the selected relationship role is preserved;
- repeated promotion does not create a second pending invitation;
- pre-acceptance access is denied;
- acceptance creates/relinks the intended identity and both membership records
  exactly once;
- a wrong-tenant or disabled persona is denied; and
- a failed/cancelled/expired flow leaves no active access row.

Raw emails, tokens, storage state, identifiers, and response bodies remain in
the private approved artifact bundle. The published result contains redacted
case IDs, counts, statuses, and manifest/source hashes only.

## 6. Hosted QA evidence — 2026-09-15

The approved hosted QA authorization was exercised only against the existing
allowlisted `unicorn-qa` project (`qfpxvumcrnzrjyvqkicq`) through protected
workflow run [`34912755544`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34912755544),
from source commit `eab991c2d8fa9287ce0f65da2dacb24e737dc8d9`. The dedicated
synthetic primary-contact inviter was provisioned by the protected seed run
`34829648697`; the existing `Client Admin A` fixture was not changed.

The run used a generated, run-scoped recipient alias and the normal
`contact → invite-user → accept_invitation_v2` path. QA no-send returned the
invitation URL without an outbound delivery observation. Because `unicorn-qa`
requires email confirmation and has no mailbox, the harness confirmed only the
new run-scoped QA recipient through the protected service-role admin API, then
re-submitted the same invitation form. Acceptance therefore remained
browser-driven: `browser_flow=true`, `url_token_used=true`, and the retry
returned `ALREADY_ACCEPTED`.

The redacted result recorded all required materialization and cleanup outcomes:

| Assertion | Result |
| --- | --- |
| Invitation writer returned a usable invitation identity/URL | pass |
| Contact archived and linked to the accepted recipient | pass |
| `public.users`, `tenant_users`, and `tenant_members` materialized once | pass |
| Relationship role / access scope | `user` / `full` |
| Idempotent acceptance retry | `ALREADY_ACCEPTED` |
| Audit evidence retained | pass |
| Run-scoped cleanup | complete; no errors |

This is a QA characterization result, not production rollout approval. Wrong
tenant, expired-token, disabled-actor, and broader negative-case execution
remain named gates before a runtime implementation packet can be closed.

## 7. Rollback, reconciliation, and audit gates

Before execution, name one owner for each gate:

| Gate | Required evidence | Stop condition |
|---|---|---|
| Canary | One synthetic tenant/contact, selected role, acceptance path, and exact source commit | Fixture or relationship semantics are ambiguous |
| Idempotency | Before/after counts and retry evidence for invitation and four identity/membership records | Any duplicate or half-materialized state |
| Authorization | Direct positive/negative result at the first trusted boundary | UI-only result, cross-tenant allow, or disabled access |
| Contact state | Pending/cancelled/expired presentation and duplicate suppression | Contact disappears without link or can be promoted twice |
| Audit | Actor, tenant, role, effective time, action, result, and correlation/run ID | Missing or unverifiable audit provenance |
| Rollback | Named operator, stop switch/revert action, pending-invite handling, and residue check | Rollback would delete evidence or strand a valid invitation |
| Retention | Private artifact owner, retention period, and redaction reviewer | Raw sensitive data would enter repo/shared chat |

Rollback for a failed canary is observational and reversible: stop new
promotion attempts, preserve the invitation/contact and audit evidence, prevent
further materialization under the bad packet version, and revert the reviewed
application change. Do not delete or rewrite source identity rows to make the
counts appear clean. Any cancellation, identity repair, or data correction
must be a separately approved operation with its own evidence.

The reconciliation ledger must balance, at minimum:

```text
eligible contacts
  = pending invitations
  + accepted/materialized users
  + collision/quarantine holdouts
  + explicitly cancelled/expired states
```

Every skipped or failed row needs a reason. A missing result is not a success.

## 8. Approval checklist before implementation

The following are packet gates, not implied approvals:

- [ ] TOM confirms contact versus authenticated membership semantics and the
      exact pending-invitation presentation.
- [ ] RBAC confirms the promotion actor, tenant scope, relationship-role
      handling, direct denial expectations, and the staff-only primary-contact
      promotion boundary.
- [ ] QA characterization uses only the approved controlled plus-alias when
      delivery is enabled, captures the returned invitation URL, and records
      delivery status or QA suppression when observable; no production Mailgun
      behavior is changed by this packet.
- [ ] Security reviews the identity-linking, invitation, acceptance, retry,
      and audit boundaries.
- [ ] Client Health confirms whether any contact/invitation/membership event is
      a source for its provenance or explicitly remains out of scope.
- [ ] Carl/environment owner names the QA target, operator, window, fixture
      approval, and private artifact owner/retention.
- [ ] The focused characterization tests are written and green before any
      runtime extraction or workflow change.
- [ ] The authenticated QA pass is approved and its negative cases are named.
- [ ] Rollback, reconciliation, and legacy-caller holdout evidence is complete.
- [ ] Any schema/RLS/RPC/trigger/grant/Edge/email/data change has a distinct
      implementation packet, audit entry, and explicit authorization.

Until every applicable box is complete, this document remains a draft and the
only permitted work is review, static source inspection, fixture design, and
non-credentialed test preparation.

## 9. What this packet does not decide

This packet does not decide the final contact table design, the complete
`tenant_users`/`tenant_members` migration order, the fate of 349 tenant-orphan
membership rows, the 55 membershipless ghost profiles, the legacy activation
Edge Function, or the broad RBAC role defaults. Those remain in their existing
TOM/RBAC decision packets and must not be smuggled into this canary.

The first implementation recommendation is therefore narrow: prove the
contact-promotion acceptance boundary with synthetic data and direct negative
evidence, then use that result to decide whether a subsequent contact
projection or ledger-compatibility packet is safe to authorize.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

The hosted QA evidence above is separately recorded in the linked audit entry;
the remaining runtime, frontend, Edge, database, credential, migration, and
production gates still require their own authorization.
