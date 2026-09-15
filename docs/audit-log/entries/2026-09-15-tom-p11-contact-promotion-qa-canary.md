# 2026-09-15 — TOM P1.1 hosted QA contact-promotion canary

> **Tag:** `audit-2026-09-15-tom-p11-contact-promotion-qa-canary`
> **Owner:** Codex
> **Target:** `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`)
> **Boundary:** QA-only synthetic contact, invitation, acceptance, and cleanup

## Trigger and authorization

Carl authorized the bounded hosted QA run against the existing allowlisted
`unicorn-qa` project. The purpose was to verify the approved TOM P1.1
`contact → invite-user → accept_invitation_v2` lifecycle without sending real
Mailgun email or touching production. No production schema, RLS, grant,
trigger, tenant, identity, invitation, credential, or email operation was
performed.

## Preflight and implementation boundary

- Dedicated synthetic primary-contact inviter provisioned by protected seed
  workflow run `34829648697`; the existing `Client Admin A` fixture was not
  changed.
- QA no-send boundary merged in PR #1304 and deployed to QA `invite-user`
  version 4 (`32b1dec3-83de-4573-aae2-ab9249acbf1c`). The exact QA project URL
  is the fail-closed boundary; the normal production path remains unchanged.
- `APP_BASE_URL=http://localhost:8080` was configured only in QA so the
  returned invitation URL could be opened by the hosted browser harness.
- Follow-up QA harness PRs #1307, #1308, #1310, #1312, #1313, #1315, #1316,
  and #1318 addressed inviter role alignment, real signup, accepted-state
  assertions, controlled recovery, unique aliases/audit retention, and the
  no-mailbox confirmation retry. These are test/QA harness changes; no
  production behavior was altered.

## Hosted verification

Protected workflow run
[`34912755544`](https://github.com/vivacityrto/unicorn-cms-f09c59e5/actions/runs/34912755544)
completed successfully from source commit
`eab991c2d8fa9287ce0f65da2dacb24e737dc8d9`.

The redacted artifact recorded:

| Assertion | Result |
| --- | --- |
| Invitation writer returned a usable invitation identity/URL | pass |
| QA delivery status | `not_observed` under no-send; no mailbox required |
| Browser signup and token possession | pass |
| QA-only email confirmation fallback | pass; run-scoped recipient only |
| Acceptance retry | `ALREADY_ACCEPTED` |
| Invitation accepted | pass |
| Profile / tenant user / tenant member materialization | all pass |
| Contact archived and linked | pass |
| Relationship role / access scope | `user` / `full` |
| Cleanup | complete; zero errors |
| Audit evidence | retained; auth user retained because audit FK pins actor |

The harness retained the auth row only when the audit ledger referenced the
recipient, preserving actor provenance. It removed the run-scoped contact and
invitation/application rows and reported no cleanup errors. Raw aliases,
tokens, passwords, storage state, and service credentials remain outside the
repository and shared chat.

## Limits and follow-up

This is a successful bounded QA characterization, not production rollout
approval. Wrong-tenant, expired-token, disabled-actor, and broader delivery
observability cases remain separate gates. No production migration, runtime
cutover, schema/RLS/trigger/grant change, or outbound email behavior was
authorized by this entry.
