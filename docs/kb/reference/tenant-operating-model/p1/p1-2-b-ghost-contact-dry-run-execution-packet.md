# TOM P1.2-b — guarded ghost-contact dry-run execution packet

> **Last updated:** 2026-09-15 · **Status:** first approved QA snapshot complete; no apply authorized
> **Owner:** TOM, with RBAC and Client Health review
> **Dependencies:** [P1.2 ghost-user retirement scope](p1-2-ghost-user-retirement-contact-promotion-scope.md); [P1.2-a dry-run evidence contract](p1-2-a-ghost-contact-dry-run-evidence-packet.md); P0.1 owner dispositions
> **Scope:** one read-only, reproducible report run in the disposable QA project
> **Non-goal:** this packet does not authorize a live query, migration, invitation, Edge Function change, or production operation

## Purpose and boundary

P1.2-a defines what the ghost-to-contact report must mean. This packet defines
how an operator could run that report safely once the required environment,
credential, retention, and manual-review owners have approved it. It is an
execution plan, not execution authority.

The run must use the checked-in `tenant:ghost-dry-run` CLI. The CLI is guarded
to perform only reads and to refuse browser credentials. No command in this
packet may insert, update, delete, send an invitation, call a mutation RPC,
retire an Edge Function, or change a Supabase setting.

## Required approvals before a run

The following fields must be filled by the named owners before an operator
receives credentials or runs the command:

| Gate | Required decision/evidence | Owner | Current status |
| --- | --- | --- | --- |
| Target | Confirm the disposable `unicorn-qa` Supabase project and exact URL; production is out of scope | Carl / environment owner | approved; `https://qfpxvumcrnzrjyvqkicq.supabase.co` only |
| Credential | Issue a short-lived, read-only service identity scoped to the QA project, or approve an explicitly bounded QA service-role read | Carl / security owner | approved; existing protected `unicorn-qa` QA secret used only by the manual workflow |
| Operator | Name the person who may run the report and the observation window | Carl | approved; Codex, one snapshot on 2026-09-15 |
| Artifact | Name the encrypted, access-controlled output location and retention period | Carl / operations owner | approved; redacted JSON downloaded to a private local path; hosted transfer retained for one day |
| Manual review | Name owners for membershipless ghosts and collision holdouts | TOM/RBAC owners | satisfied for this snapshot; both holdout classes were zero |
| Cross-initiative review | Confirm that RBAC capability interpretation and Client Health provenance review the resulting classifications before any apply design | RBAC/Client Health owners | satisfied for this snapshot; no RBAC or Client Health classification was surfaced |

Until every row is resolved, the only permitted work is code review, fixture
preparation, and non-credentialed tests of the CLI's classification logic.

## Preflight checklist

The operator must record each result with the report's `run_id` and
`snapshot_at`:

1. Verify the checked-out commit is the reviewed `origin/main` commit and that
   `scripts/ghost-contact-dry-run.mjs` matches the merged implementation.
2. Verify the target URL is the approved QA URL. Abort if it is the production
   URL or any unrecognized project.
3. Verify the supplied secret is a service credential, is not a `VITE_` browser
   key, is held only in the process environment, and will not be copied into
   shell history or the report.
4. Run the CLI's help path and non-credentialed test suite before supplying
   the secret. The Node characterization tests must pass.
5. Confirm the output directory is private, encrypted at rest, and has the
   agreed retention owner. Do not write raw identifiers to a shared checkout,
   issue, chat, or PR.
6. Confirm no apply/migration job, invitation worker, or legacy activation
   process is being run against the same QA fixture during the snapshot.

The report is invalid if any preflight result is missing, the target cannot be
proved, or the credential scope is unclear.

## First approved QA snapshot — 2026-09-15

The first approved run completed through the protected manual workflow
`34919427510` after the narrow QA-only prerequisite correction workflow
`34918924306` succeeded. The prior attempt (`34918054173`) was rejected before
artifact creation because the security-invoker view could not read its
underlying `public.users`/`auth.users` relations with the QA service role.
PR #1330 merged the idempotent QA-only grants needed for that view contract;
no production project was targeted.

The accepted artifact records report run ID
`453b20f5-510f-4f43-8322-8551dfedf689`, source commit
`77ab183dd37c23f11a01bccb24402b1aca94efc2`, and the approved QA target. The
redacted JSON was downloaded to a private local path and was not committed or
posted to a shared channel. The workflow verified the report's read-only
contract and uploaded only the redacted artifact.

| Measure | Result |
| --- | ---: |
| Total ghost profiles | 15 |
| Membership-bearing profiles | 15 |
| Membershipless quarantine | 0 |
| Tenant candidate rows | 15 |
| Eligible candidates | 15 |
| Existing contact matches | 0 |
| Pending invitation matches | 0 |
| Collision/manual rows | 0 |
| Projected future inserts (not executed) | 15 |
| Writes performed | 0 |

Artifact inspection found no raw email addresses, no unapproved source UUIDs,
and no secrets. Because there were no membershipless or collision holdouts,
the named manual-review owners had no row-level exception to classify, and no
RBAC- or Client-Health-specific classification was surfaced. This snapshot is
accepted as P1.2 evidence only; it does not authorize contact inserts, ghost
retirement, invitation sends, or any production operation.

## Approved first run shape

The first run is a single QA snapshot with redacted identifiers and JSON output.
The command is illustrative and must be filled with the approved output path
by the operator; it is not an instruction to run now:

```powershell
$env:SUPABASE_URL = 'https://qfpxvumcrnzrjyvqkicq.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<short-lived-approved-qa-read-secret>'
npm run tenant:ghost-dry-run -- --json --out '<approved-private-path>\ghost-contact-dry-run.json'
```

`--include-identifiers` is not part of the first run. If manual review later
requires identifiers, that is a separate approval with a narrower artifact
audience and shorter retention. Production requires the CLI's explicit
`--allow-production-read-only` flag and a separate written authorization; it
is not an acceptable substitute for the QA run.

## Run-time safety assertions

The operator must inspect the completed artifact and record:

- `writes_performed: 0`;
- the target project and source commit;
- counts for total ghosts, membership-bearing profiles, membershipless
  quarantine, candidate rows, eligible candidates, contact matches, pending
  invitations, collisions, and projected future inserts;
- the deterministic ordering and one-row-per-tenant/email grain;
- the absence of secrets or unapproved identifiers;
- the CLI exit status and any rejected/invalid source rows.

The operator must also retain the command's read-only query log or equivalent
execution evidence showing reads only from the six approved source relations:
`v_auth_user_state`, `users`, `tenant_users`, `tenant_members`,
`tenant_contacts`, and `user_invitations`. Any unexpected relation, write
verb, RPC, email, or Edge Function invocation is an immediate abort and
security review event.

## Acceptance and reconciliation gates

The snapshot can be accepted as evidence only if:

1. the report reconciles the ghost-profile population into membership-bearing
   and membershipless groups without unexplained loss or duplication;
2. each membership-bearing ghost is represented once per tenant/email grain,
   with source UUID and source membership evidence retained;
3. collision, pending-invite, invalid-email, and no-tenant rows are held out
   from projected inserts;
4. `projected_future_inserts` equals the eligible `candidate` count and is
   explicitly labeled as expected, not executed;
5. a second run over the unchanged QA snapshot is deterministic apart from
   run metadata; and
6. TOM, RBAC, and Client Health owners sign off the holdouts, relationship
   provenance, access implications, and any unexpected data-quality pattern.

Acceptance of the report does not authorize contact inserts or ghost-profile
retirement. It authorizes only using the frozen evidence to decide whether a
separate apply packet is worth preparing.

## Abort conditions and rollback

Abort without retrying if the target is wrong, the key is a browser key or
over-broad credential, any write is observed, the source set changes during
the snapshot, counts do not reconcile, identifiers leak into an uncontrolled
artifact, or the report requires an implicit tenant assignment. Delete the
artifact according to the approved retention procedure and rotate the
credential if exposure is possible; do not attempt a compensating data write.

Because this packet performs no writes, it has no data rollback step. A later
apply packet must use a frozen `run_id`, declare its own canary and rollback
owner, preserve concurrent contact edits and accepted invitations, and carry a
separate audit entry and approval.

## Open decisions after the first report

The bounded apply-design follow-up is now recorded in the
[P1.2-d guarded apply-design packet](p1-2-d-ghost-contact-apply-design-packet.md).
It remains planning-only: the accepted redacted artifact cannot drive writes,
and any identifier-bearing manifest, write boundary, canary, or production
operation needs its own gate.

The following remain outside this execution packet:

- durable source-metadata and migration-batch storage;
- apply/reconciliation ordering and concurrency handling;
- disposition of the 55 membershipless ghosts and collision holdouts;
- complete zero-caller evidence and retirement authority for
  `activate-ghost-user`; and
- any schema, RLS, grant, Realtime, Edge Function, invitation, or production
  data change.

The next TOM decision point is therefore not “run the migration.” It is whether
the approved QA evidence is sufficient to open a separately authorized apply
design, after the report and all owner sign-offs are retained.

**Audit entry:** none needed — this is planning-only documentation and does not
change schema, permissions, production data, or operational schedules.
