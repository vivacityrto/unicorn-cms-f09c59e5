# RBAC v6 — Packet P1-j: AJ/CSC shadow evidence and observation contract

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §5.9, §5.10, §7 P1, §12 P4
> **Inputs:** [P1-i job-role defaults and AJ/CSC pilot worksheet](p1-i-job-role-defaults-aj-csc-pilot.md), [P1-h high-risk delegability controls](p1-h-high-risk-delegability-control-worksheet.md), [R2 approval packet](../../codebase-optimization/cross-cutting/remaining-gated-approval-packets-2026-09-12.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation contract delivered 2026-09-13 — proposed evidence shape only; no logger, table, telemetry, grant, or pilot state created
> **Owner:** RBAC/security with product, operations, and environment owners
> **Evidence:** parent-plan shadow requirements and current P1-i pilot boundary at `origin/main@999a23f374570c2c3407219e68dd688b7c33b533`
> **Audit entry:** none needed — analysis/documentation only; no schema, RLS, permission, credential, or production change

## Purpose and boundary

This packet answers how the AJ/CSC shadow period should record and review
decisions. Shadow mode evaluates the v6 policy beside the current authoritative
path, records both outcomes, and leaves the current path in control of the user
experience. It must never combine old and new allows.

This is an evidence contract, not authorization to add a table or logger. No
grant, role assignment, or pilot enrollment is authorized by this packet. The
storage choice, retention period, access grants, and production telemetry must
be approved in the implementation packet that introduces them.

## Recommended evidence flow

```text
request -> current authoritative decision -> user-visible outcome
       \-> v6 shadow decision -> sanitized event -> daily aggregate -> review
```

For every in-scope AJ/CSC request, both evaluators receive the same verified
subject, action, target, tenant/resource context, and policy-version snapshot.
The current result remains authoritative. The v6 result is observational only;
it cannot open a route, authorize a write, change a query, or alter a denial.

The event writer should be asynchronous where possible, but a failed shadow
write must not change the authoritative allow/deny result. If the shadow
evaluator fails or returns partial context, record `shadow_unavailable` and keep
the current result; never treat a missing shadow event as parity.

## Event contract

The recommended event is an immutable, append-only record in a private schema or
equivalently protected observability sink. It is separate from
`permission_change_log`: a policy evaluation is not a permission mutation.

| Field | Requirement | Privacy/quality rule |
| --- | --- | --- |
| `event_id` | Unique event ID | Generated server-side; never client supplied |
| `correlation_id` | Request/workflow correlation ID | Stable across a bounded workflow; no bearer token |
| `occurred_at` | UTC timestamp | Server clock; retain timezone explicitly |
| `policy_version` | v6 version evaluated | Required for reproducibility |
| `subject_ref` | Pseudonymous subject reference | HMAC/tokenized ID; do not store email or raw auth token |
| `principal_class` | Human, machine, disabled, archived, or unavailable | Derived at trusted boundary |
| `profile_ref` | Seat/profile label or pseudonymous profile ID | Record only the approved profile context |
| `action` | Atomic capability key | No bundled `manage`/`use` label as final decision |
| `target_ref` | Tokenized tenant/resource target | Must be the server-resolved target, not a body claim |
| `scope_kind` | Named tenant/resource, assigned, own, global, or missing | Record resolver result and missing-context reason |
| `relationship_code` | Sanitized relationship outcome | No sensitive row contents |
| `current_decision` | Allow/deny plus reason code | Authoritative outcome |
| `v6_decision` | Allow/deny/unavailable plus reason code | Shadow outcome |
| `mismatch_class` | Parity, v6-only-allow, legacy-only-allow, evaluator-error, context-mismatch | Derived server-side |
| `latency_ms` | Current and v6 evaluation duration | Numeric only; useful for cutover readiness |
| `review_state` | Unreviewed, accepted, corrected, inconclusive | Must have an owner for non-parity |
| `review_ref` | Ticket/commit/decision reference | Required before closing a mismatch |

Do not store access tokens, secrets, full request bodies, message/document
contents, unredacted export contents, or unnecessary personal data. If a target
identifier is needed to investigate a mismatch, tokenize it consistently and
restrict detokenization to the named security reviewers.

## Mismatch taxonomy and required action

| Result | Meaning | Required action |
| --- | --- | --- |
| Current allow / v6 allow | Parity | Sample and aggregate; no exception needed |
| Current deny / v6 deny | Parity | Confirm reason codes agree or classify an intentional reason difference |
| Current deny / v6 allow | Potential privilege escalation | Immediate review; do not activate the v6 path |
| Current allow / v6 deny | Potential operational lockout | Review before cutover; do not widen the current path to hide it |
| Either evaluator unavailable | Incomplete evidence | Mark `Inconclusive`; keep current authoritative and extend observation |
| Context differs | Input-resolution defect | Compare server-resolved subject/target/scope; fix before policy comparison |

Every non-parity event must receive an owner, classification, evidence link, and
disposition. “Expected” is not a sufficient disposition without a documented
policy reason and product/security sign-off. Security-sensitive mismatches are
zero-tolerance for pilot progression.

## Aggregates and review cadence

Generate daily sanitized aggregates grouped by:

- action/capability and mismatch class;
- approved persona/profile and tenant/resource cohort;
- reason code and policy version;
- evaluator error/unavailable count; and
- p50/p95 latency for current and v6 paths.

The daily review should answer: did any v6-only allow occur, did any legacy
allow become a v6 deny, did any inactive/missing-context principal pass, did any
wrong-tenant/resource request pass, and did the shadow path add material
latency? Reviewers should close or escalate mismatches before the next daily
window, with a final signed summary at the end of 14 days.

The raw-event retention period, aggregate retention period, reviewer list, and
redaction policy must be named before implementation. Recommended default:
retain raw events for the 14-day observation plus a short investigation window,
then retain only sanitized aggregates and closed-mismatch references. Security
may require a stricter or longer period for an unresolved incident.

## Acceptance and rollback gates

The shadow evidence is sufficient to consider the AJ/CSC pilot only when:

1. all in-scope actions and personas have events or an explicit
   `shadow_unavailable` disposition;
2. there are zero unexplained v6-only allows;
3. there are zero unexplained legacy-allow/v6-deny lockouts;
4. no inactive, archived, expired, revoked, unknown, missing-context, or
   wrong-tenant/resource case is allowed by v6;
5. audit events are complete, immutable, access-controlled, and deduplicated;
6. evaluator errors and missing events are within an explicitly approved
   threshold (recommended threshold: zero for security-sensitive paths); and
7. product/security and the observation owner sign the final report.

Rollback is observationally simple: keep the current path authoritative, stop
the shadow run, revoke/disable any pilot-only profile if one was activated under
a separate approval, preserve the evidence for investigation, and correct the
v6 rule or input resolver. Never rollback by restoring a known fail-open allow.

## Implementation packet prerequisites

Before introducing a logger or storage object, the implementation packet must
name:

- the private schema/sink and exact grants or service boundary;
- the single event writer and failure behavior;
- tokenization/HMAC key custody and detokenization access;
- retention, deletion, redaction, and incident-preservation rules;
- the approved QA/production cohort and persona credentials;
- the mismatch reviewer, escalation owner, and daily review window;
- the policy version and authority-mode control; and
- the audit entry required if a database object or security boundary changes.

This packet does not authorize that implementation. Until those fields are
approved, safe work remains limited to synthetic event fixtures, report-schema
validation, and source-boundary characterization. No role assignment, grant,
pilot enrollment, route cutover, shadow telemetry, schema/RLS change, Edge
deployment, or production observation is authorized here.

## Verification

Documentation-only change. Relevant checks are `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check`; runtime suites and
hosted QA are not applicable because no logger, table, permission, or live
environment changed.
