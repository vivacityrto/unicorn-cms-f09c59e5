# Client Health H0.3a — run-ledger and shadow contract

> **Status:** preparation-only contract; no writer, forecast job, cron, score,
> schema, RLS, RPC, or production data change is authorized
> **Parent:** [Client Health Activity Analytics Plan](../../client-health-activity-analytics-plan-2026-09-03.md)
> **Inputs:** [H0.3 unknown-state packet](h0-3-risk-retention-consumer-unknown-state-packet.md), [H0.3b/c forecast disposition](h0-3b-3c-forecast-job-disposition-evidence.md), [H0.4 evidence schema](h0-4-consultant-report-template-and-evidence-schema.md)
> **Owner:** Client Health with TOM, RBAC, security, and consultant review
> **Audit entry:** none needed — local synthetic schema/validator and documentation only

## Purpose and boundary

The existing H0.3 packet names the minimum run-ledger fields required before
any future forecast repair or replacement. This packet makes that contract
machine-readable and defines the additive shadow boundary. It is a readiness
artifact, not an implementation packet and not approval to restart either
retired composite forecast job.

The contract must make incomplete work observable. A missing or failed run is
`source_unavailable`; a partial run may not be consumed as a complete
assessment. A status such as `normal` or `stable` is not produced by this
contract and is never inferred from an empty source.

## Versioned run-ledger record

The [run-ledger schema](data/run-ledger.schema.json) requires:

- run identity, metric identity, contract version, owner, retry key, and
  retention reference;
- requested, started, and completed UTC timestamps plus a source watermark;
- input row/distinct-tenant counts, skipped/invalid/error counts, and output
  row/distinct-tenant counts;
- freshness and coverage percentages; and
- a nullable protected error class/diagnostic reference.

The local validator and synthetic examples are intentionally offline:

```text
npm run client-health:run-ledger:validate
node --test scripts/validate-client-health-run-ledger.test.mjs
```

The validator rejects success records with skipped, invalid, or error inputs,
or output tenant coverage that does not equal input coverage. It requires a
protected error class for failed/aborted records and rejects unknown fields,
invalid percentages, and non-UTC timestamps. These checks establish ledger
integrity; they do not establish that a source is correct, fresh, or useful.

## Shadow comparison contract

A future replacement must use a distinct contract version and additive output
while retaining the legacy snapshot/history as evidence. Each comparison row
must carry, at minimum:

| Field | Requirement |
| --- | --- |
| subject grain and scope | service-engagement/package instance/client or approved cohort; tenant/resource scope resolved by TOM/RBAC |
| legacy evidence | source status, source watermark, and caller-safe unavailable reason where applicable |
| shadow evidence | contract version, run ID, source watermark, output status, reason code, and freshness/coverage |
| comparison | `same`, `changed`, `legacy_unavailable`, `shadow_unavailable`, `inconclusive`, or `out_of_scope` with a machine-readable reason |
| review | owner, review state, reviewed-at, and protected diagnostic reference when needed |

Shadow output must not be client-facing or authoritative by implication. The
safe sequence is:

1. freeze the approved subject/scope and synthetic fixtures;
2. generate a versioned run ledger and additive shadow output;
3. reconcile input/output counts, distinct tenants, skipped/invalid/error
   rows, source watermarks, freshness, and tenant-scope proofs;
4. compare old/new outputs with unknown states preserved and no raw notes or
   sensitive source copied into logs;
5. review discrepancies with Client Health, TOM, RBAC, security, and the
   consultant-data owner; and
6. only after separate policy, pilot, rollback, and production approvals may a
   later packet discuss canary or cutover.

No shadow contract may restart `run-tenant-risk-forecast` or
`run-retention-forecast`, repair their inputs, schedule a cron, alter a view,
or change the current unavailable consumer behavior by assumption.

## External and cross-initiative gates

- AJ/Ezel operational reports remain outstanding. They are required before
  metric definitions, thresholds, confidence semantics, pilot cohorts, or
  usefulness acceptance criteria become policy.
- TOM owns tenant identity, subject grain, and operating-context relationships.
- RBAC owns the caller scope, relationship proof, and denial/visibility
  boundary; broad staff read does not imply health writes or exports.
- Security/data owners must approve retention, diagnostics, redaction, and any
  hosted source access before a shadow writer exists.

## Stop boundary

This packet authorizes no credential creation, hosted query/write, schema/RLS/
RPC/trigger/grant/Realtime/Edge/cron change, AI processing, score, label,
pilot, client communication, production observation, or cutover.
