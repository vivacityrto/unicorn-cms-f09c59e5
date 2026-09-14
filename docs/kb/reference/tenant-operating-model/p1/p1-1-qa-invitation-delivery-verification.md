# TOM P1.1 — QA invitation-delivery verification and runbook

> **Status:** preparation-only; no runtime, hosted-QA, credential, invitation,
> data, or production action is authorized by this document.
>
> **Parent packet:** [first contact-promotion implementation packet](p1-1-first-contact-promotion-implementation-packet.md)
>
> **Related preparation:** [QA negative cases and cleanup/runbook contract](../p0/p0-4-qa-negative-cases-and-cleanup-runbook.md)
>
> **Companion runtime proposal:** PR #1281 (`feat: add QA no-send invitation
> delivery mode`). The values and behavior described below are a proposed
> verification contract; they are not current `origin/main` behavior until
> that separately reviewed runtime change is merged and configured.

## 1. Purpose and boundary

This packet makes the approved contact-promotion lifecycle testable in a
non-production QA environment without sending real Mailgun email. It binds
the existing invitation contract to an explicit QA-only delivery mode and
defines the evidence, negative cases, and cleanup needed before a future
authorized run.

The source cutoff for this preparation is `origin/main@e8043bc8b7ba7badc5ebeaab639f83076dbc2b0d`.
The current source evidence is:

```text
tenant contact
  → promoteContactViaInvite(..., relationship_role, skip_email: false)
  → invite-user
  → pending user_invitations row
  → recipient acceptance through accept_invitation_v2
  → auth.users/public.users/tenant_users/tenant_members materialization
```

`skip_email: false` is a required lifecycle assertion. The existing
`skip_email: true` branch creates `public.users`, `tenant_users`, and
`tenant_members` directly and intentionally bypasses the pending invitation
and acceptance boundary. It must not be reused as a QA no-email shortcut.

The proposed QA mode suppresses only the downstream email dispatch after the
pending invitation has been durably created. It must not suppress invitation
creation, alter token hashing, change the acceptance RPC, or grant access
before acceptance. Unknown or missing mode values must retain the current
send behavior, and the suppression must require an explicit QA environment
marker as well as the QA mode value.

## 2. Proposed QA delivery contract

The allowlisted QA project always suppresses downstream invitation delivery.
Its project URL is hard-coded as a fail-closed QA marker; production's
different project URL cannot activate suppression. The following secrets remain
documented for operator visibility, but the project-bound guard is authoritative:

```text
INVITATION_EMAIL_ENVIRONMENT=qa
INVITATION_EMAIL_MODE=qa-no-send
```

These values are a future operator configuration, not a request to set
secrets or environment variables in this packet. Production must not use the
QA mode. A production or otherwise unmarked environment must continue to
follow the normal email path, even if a mode value is accidentally present.

| Contract point | Required QA result | Evidence |
|---|---|---|
| Caller payload | Explicit selected `relationship_role`; `skip_email: false` | Redacted request shape and adapter test result |
| Invitation write | One pending `user_invitations` row with tenant, role, expiry, and hashed token | Row count/shape, no plaintext token |
| Delivery | No downstream `send-invitation-email` invocation and no Mailgun request in QA no-send mode | Function log/request assertion and provider-side QA observation |
| Recipient workflow | A separately provisioned synthetic recipient can accept through the normal acceptance flow | Authenticated QA result and redacted acceptance ledger |
| Access boundary | No auth or tenant membership is created before acceptance; expected identity/membership rows materialize once after acceptance | Before/after row counts and RPC result |
| Default safety | Missing, unknown, or non-QA mode continues the normal delivery behavior | Static contract test and environment matrix |

The delivery assertion is specifically “no outbound dispatch after a pending
invitation write,” not “no invitation.” The pending row, token hash, expiry,
acceptance link, and audit evidence remain part of the workflow.

## 3. Synthetic fixture manifest

Use only generated, run-scoped labels from the existing TOM fixture manifest.
Never copy production UUIDs, names, emails, tokens, browser storage state, or
credentials.

| Fixture | Required shape | Expected use |
|---|---|---|
| `contact-a` / `tenant-a` | Active contact with no auth identity or membership | Baseline promotion |
| `member-a` / `tenant-a` | Authenticated member with an explicit relationship role | Existing-member and actor boundary |
| `pending-a` / `tenant-a` | Contact with one active pending invitation | Duplicate suppression and pending presentation |
| `collision-a` / `tenant-a` | Same normalized email or conflicting source identity | Holdout; no automatic merge or second invitation |
| same labels / `tenant-b` | Separate tenant with same-named synthetic resources | Tenant isolation |
| `expired-a` / `tenant-a` | Expired or revoked invitation evidence | Reconsideration and stale-token denial |
| `disabled-actor` | Disabled or revoked synthetic operator | Promotion denial |
| `recipient-a` | Short-lived synthetic recipient identity | Acceptance only after pending state is evidenced |

Every fixture row and artifact must carry a generated `run_id` and
`fixture_tag`, an explicit tenant label, lifecycle state, source commit, and
cleanup disposition. A run that cannot prove it is targeting the allowlisted
non-production `unicorn-qa` project is `inconclusive` and must stop.

## 4. Characterization and negative-case sequence

This workflow crosses a mockable client adapter and a server-side invitation/
acceptance boundary. It therefore requires both focused contract tests and a
real authenticated QA pass before any runtime packet is considered ready.

### 4.1 Focused test oracle

The focused tests must exercise or statically assert the behavior that moves
or is configured:

1. The promotion adapter requires an authenticated session and sends the
   selected relationship role with `skip_email: false`.
2. The invitation writer creates a pending row before delivery handling.
3. Explicit `qa-no-send` plus explicit QA environment suppresses only the
   downstream email invocation.
4. Missing, unknown, or non-QA environment/mode values do not suppress the
   normal delivery path.
5. Existing pending invitations return the established duplicate contract;
   expired invitations follow the existing expiry handling.
6. Invalid role, missing tenant, wrong actor, disabled actor, collision,
   capacity, and malformed input produce a denial/error with no unintended
   membership or outbound email.

The tests must assert call order and side effects, not merely a successful
HTTP-shaped response. They must not embed a real email, token, service key,
Mailgun credential, or production identifier.

### 4.2 Authenticated QA oracle

After all operator and fixture gates are approved, run one exact synthetic
workflow:

1. Confirm `contact-a` is visible and has no auth or membership row.
2. Select an explicit relationship role and promote with the normal adapter.
3. Confirm the request uses `skip_email: false` and a pending invitation is
   created for the correct tenant and role.
4. In QA no-send mode, confirm there is no `send-invitation-email` dispatch,
   no Mailgun request, and no access materialization.
5. Confirm the contact remains visible as pending and a repeat promotion does
   not create a second active invitation.
6. Use only the synthetic recipient to complete the normal acceptance flow.
7. Confirm acceptance creates/relinks the intended identity and membership
   rows exactly once, preserves the relationship-role mapping, and writes
   the expected audit/timeline evidence.
8. Retry acceptance and test wrong-tenant, expired-token, and disabled-actor
   outcomes. No retry or negative case may create duplicate access.

If any browser-reachable server branch is not covered by the QA workflow, it
still requires a focused static or contract assertion. A page render alone is
not evidence of authorization, invitation delivery, or acceptance correctness.

## 5. Evidence and result vocabulary

The published result may contain only redacted metadata:

```json
{
  "run_id": "tom-p1-1-qa-invite-<generated>",
  "source_commit": "<40-char-sha>",
  "environment": "qa",
  "delivery_mode": "qa-no-send",
  "case_id": "promotion-pending-acceptance",
  "observed": "not_run",
  "classification": "inconclusive",
  "pending_invitation_count": null,
  "materialized_membership_count": null,
  "outbound_email_count": null,
  "writes_performed": null,
  "artifact_ref": "private-bundle-only"
}
```

Use `pass` only when the trusted actor, target tenant, first server boundary,
pending write, no-send assertion, and acceptance result are all evidenced.
Use `mismatch` for an evidenced contrary result, `inconclusive` for missing
credentials/observability/fixture or ambiguous evidence, and `not_run` for a
separately gated mutation or case intentionally excluded from the run.

Keep raw request/response bodies, invitation tokens, email addresses,
browser storage, credentials, and provider traces in the approved private
artifact bundle only. The shared summary should include case IDs, counts,
statuses, source/mode hashes, and artifact references.

## 6. Preflight, stop, and cleanup runbook

### Preflight gates

- Confirm `unicorn-qa` is the target and record the source commit and manifest
  hash.
- Confirm the environment marker and delivery mode are both explicit; do not
  infer QA from a URL, project name, or operator assumption.
- Name the operator, observation window, synthetic recipient, private
  artifact owner, retention period, and approved fixture/reset method.
- Confirm no real Mailgun credential, production identity, or production
  email can enter the fixture or artifact bundle.
- Confirm the focused tests are green and the exact negative cases are
  approved before any authenticated workflow.

Stop immediately and preserve private evidence if there is an unexpected
write, access row before acceptance, cross-tenant result, plaintext token,
credential exposure, or outbound email. Do not issue a compensating delete,
cancel, migration, or repair from this runbook. Classify the result as
`mismatch` or `inconclusive` and escalate the exact boundary to its owner.

### Cleanup gates

Cleanup is a separate authorized QA operation. Stop reads, record the final
run ledger, and remove only run-scoped synthetic data in reverse dependency
order: transient acceptance/audit evidence, invitations, contact and
membership projections, synthetic identities, then synthetic tenants. Revoke
or expire short-lived identities through the approved operator process. Never
use a broad email, tenant, or table-wide predicate.

Verify zero run-tag residue for each fixture relation. If a relation cannot be
checked, mark cleanup `inconclusive` and retain the evidence. The ledger must
record attempted, deleted/expired, residual, unverified, operator, timestamp,
and artifact reference. Cleanup must not delete audit evidence merely to make
the residue count appear clean.

## 7. Gates and exclusions

This preparation does not authorize:

- changing the Edge Function, invitation schema, RPC, trigger, RLS, grant, or
  email-provider configuration;
- setting QA or production environment variables;
- creating credentials, seeding hosted data, accepting an invitation, or
  sending an email;
- retiring `activate-ghost-user`, migrating legacy ledgers, or rewriting
  `public.users`, `tenant_users`, `tenant_members`, or `tenant_contacts`; or
- choosing broader RBAC roles, tenant scope, relationship defaults, pilot
  behavior, or enforcement cutover.

Before a runtime or hosted-QA packet proceeds, TOM, RBAC, security, the
environment owner, and the named operator must review the relevant gates.
Client Health must confirm whether invitation/membership events are a source
for health provenance or remain explicitly out of scope. The consultant
operational-data dependency remains external and is not satisfied by this QA
preparation.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No frontend, Edge, database, credential, hosted-QA, Mailgun, or live mutation
verification is applicable to this preparation document.
