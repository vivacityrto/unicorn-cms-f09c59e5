# RBAC v6 — Packet P1-t: `staff.internal` replacement and negative-case worksheet

> **Last updated:** 2026-09-14 · **Status:** source-only preparation; no gate or catalogue change authorized
> **Parent:** [P1-g `staff.internal` consumer inventory](p1-g-staff-internal-consumer-inventory.md)
> **Inputs:** [P1-c sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-h high-risk controls](p1-h-high-risk-delegability-control-worksheet.md), [P1-m row ledger](p1-m-row-by-row-golden-preparation.md), [TOM P0.1 owner register](../../tenant-operating-model/p0/p0-1-owner-disposition-register.md)
> **Source cutoff:** `origin/main@1452c9b65c716252437faef605577772ec403211`
> **Owner:** RBAC v6 with product/security review; TOM owns tenant/resource relationships
> **Audit entry:** none needed — documentation-only analysis; no permission, role, grant, RLS, RPC, Edge, credential, or production change

## Purpose and boundary

P1-g found six direct production consumers of `staff.internal`. This worksheet
turns that inventory into a bounded replacement queue with explicit target,
relationship, denial, and oracle requirements. It is not a request to replace
the gate now. The current gate remains in place until every endpoint has a
reviewed action-specific boundary; deleting or weakening it early could turn a
staff-identity check into an authorization regression.

`staff.internal` answers only “is this an internal Vivacity principal?” It does
not establish the requested action, target tenant/resource, relationship,
external side effect, or approval state. The target decision remains:

```text
active principal + exact capability + resolved target scope + relationship proof
```

## Current consumer register

| Endpoint | Current source boundary | Actual operation | Candidate replacement | Current test evidence |
| --- | --- | --- | --- | --- |
| `create-client-audit` | `index.ts:65-71`; `staff.internal` or `hasTenantAccessSafe(subject_tenant_id)` | Inserts a client audit after validating an optional linked stage instance; staff path may launch best-effort research-audit intelligence | `audits.create` plus explicit target tenant and linked-stage relationship; keep research processing as a separate staff/action gate | `auth-gate.test.mjs`; shared stage/package binding tests |
| `generate-certificate-pdf` | `index.ts:54` through `requireCaller` | Reads a certificate, creates/returns signed PDF output, and updates certificate metadata | `academy.certificates.generate` with certificate owner/tenant proof and signed-output controls | No endpoint-specific test file found in the source cutoff scan |
| `notify-chat` | `index.ts:21` through `requireCaller` | Reads notification/integration settings and sends an external Slack notification | `notifications.send` or event-specific send capability plus tenant/event/recipient relationship | No endpoint-specific test file found in the source cutoff scan |
| `notify-suggestion-submitted` | `index.ts:66` calls `checkPermission` directly | Uses internal status to bypass Academy-only plan filtering while preserving item ownership/RLS checks | Suggestion submit/review action plus a narrowly documented internal-context branch | No endpoint-specific test file found in the source cutoff scan |
| `record-completed-audit` | `index.ts:20` through `requireCaller` | Records a completed/retrospective client audit with supplied tenant and snapshot evidence | `audits.record_completed` or `audits.create_retrospective` with auditor and tenant proof | `auth.test.mjs` |
| `tenant-lifecycle` | `index.ts:43`; later suspend/close/archive/reactivate checks remain | Changes tenant lifecycle and can cut off client access | Preserve existing `clients.activate`/`clients.deactivate` or a hard-Super-Admin action family; remove only the redundant identity gate after proof | `response-context.test.mjs`; `suspend-close-superadmin.test.mjs`; QA lifecycle tests are present but gated on approved QA configuration |

The line references are source evidence, not proof that a candidate capability
is approved. Existing tests prove only the behavior they actually exercise;
their presence does not fill target, relationship, or denial gaps.

## Endpoint replacement worksheet

Each row below must be resolved independently. A replacement must not be a
generic `staff.internal` alias, and an `old OR new` fallback must not preserve
an unintended allow path.

### 1. Create client audit

- **Trusted target:** resolve `subject_tenant_id` on the server; if
  `linked_stage_instance_id` is present, prove that the stage instance belongs
  to the same tenant before inserting the audit.
- **Relationship:** distinguish a tenant member creating an allowed audit for
  its own tenant from an internal staff operator with an approved cross-tenant
  audit scope. `hasTenantAccessSafe` is a relationship input, not the action
  capability itself.
- **External branch:** the staff-only research-audit-intelligence launch is a
  separate action and privacy boundary. It must not be implied by `audits.create`.
- **Negative cases:** missing target, invalid subject tenant, cross-tenant
  stage instance, inactive/disabled caller, arbitrary auditor identity, and
  tenant member targeting another tenant must deny before any insert or
  downstream fetch.
- **Oracle:** extend the existing focused auth/binding tests before any gate
  move; a later mutation change also needs an approved safe-QA negative and
  positive run covering insert and the external branch.

### 2. Generate certificate PDF

- **Trusted target:** resolve certificate ID to its learner, tenant, and
  certificate state before reading or producing signed output.
- **Relationship:** separate learner self/owner access from approved Academy
  staff generation; internal identity alone must not authorize another
  tenant's certificate.
- **External effect:** signed URL lifetime, output metadata update, and PDF
  contents require security review and an audit/retention decision.
- **Negative cases:** unknown certificate, another learner's certificate,
  wrong-tenant certificate, disabled/expired caller, unauthorized internal
  role, and replayed or stale output request must deny without issuing a URL
  or updating metadata.
- **Oracle:** write a focused contract test for target/tenant/owner outcomes
  if the handler boundary can be mocked cheaply; otherwise use a verbatim
  replacement plus authenticated safe-QA Playwright and a separate static
  contract test for signed-output denial.

### 3. Send chat notification

- **Trusted target:** resolve the tenant event and recipient from server-owned
  rows; do not trust a caller-supplied recipient or integration identifier.
- **Relationship:** require an explicit tenant relationship or approved staff
  notification scope, plus the tenant's enabled integration and recipient
  preference.
- **External effect:** Slack delivery is a consequential outbound action. The
  action capability, opt-in, audit record, failure behavior, and retry/replay
  contract must be explicit.
- **Negative cases:** wrong-tenant preference, spoofed recipient, disabled
  integration, unauthorized event, missing tenant, inactive caller, and
  duplicate/replayed notification must not send externally.
- **Oracle:** focused tests should assert the gate precedes preference reads
  and outbound delivery, with tenant and replay negatives. A hosted run is
  required for a later live external-effect change only with an approved
  non-production sink/fixture.

### 4. Process suggestion submission

- **Trusted target:** resolve the suggestion/item row and its tenant before
  applying plan filtering or notification behavior.
- **Relationship:** preserve the existing Academy-only restriction for
  non-staff callers and the submitter ownership rule. Internal status may be
  a context predicate for the documented plan branch, but cannot authorize
  the whole operation or bypass item RLS.
- **Negative cases:** Academy-only client, zero tenant membership, item from
  another tenant, non-submitter client, inactive caller, and unknown caller
  must deny or remain filtered as the current contract requires.
- **Oracle:** add focused tests around the existing `isStaff` branch and its
  two tenant-scope queries before changing the capability vocabulary; verify
  both the internal branch and client denial behavior.

### 5. Record completed audit

- **Trusted target:** resolve the submitted audit's tenant and immutable
  evidence fields; never let caller input manufacture an arbitrary completed
  audit for a different tenant.
- **Relationship:** require an approved auditor/assistant relationship or
  explicit internal action scope, with the caller identity written to the
  audit trail.
- **Negative cases:** arbitrary subject tenant, cross-tenant record,
  missing/future completion evidence, inactive caller, duplicate/replayed
  submission, and unauthorized internal role must deny before the write.
- **Oracle:** extend `auth.test.mjs` with target and replay contract cases,
  then use a safe-QA fixture for the full write/audit ordering if the handler
  changes. This is a high-impact write and remains security-review gated.

### 6. Tenant lifecycle

- **Trusted target:** resolve the tenant and validate the requested transition
  and reason before any suspend, close, archive, or reactivate side effect.
- **Relationship:** preserve the existing hard Super Admin checks for
  consequential transitions. Broad internal staff identity is redundant, not
  sufficient.
- **Negative cases:** Team Member/CSC/BGT/CET/Integrator/Team Leader suspend or
  close, invalid transition, missing reason, disabled/expired Super Admin,
  cross-tenant target, and replay must deny with no lifecycle write.
- **Oracle:** existing static auth tests and gated QA lifecycle tests are the
  starting oracle. A later gate removal requires focused coverage for every
  transition plus authenticated QA success and denial outcomes.

## Shared readiness and sequencing

| Step | Evidence required | Resulting state |
| --- | --- | --- |
| 1. Product/security review | Correct action name, scope, delegability, external-effect policy, and owner per endpoint | `needs_product_input` or `needs_security_review` until resolved |
| 2. TOM/RBAC target map | Server-resolved tenant/resource target, active relationship proof, and source-of-truth owner | `needs_cross_initiative_contract` until evidenced |
| 3. Focused characterization | Positive, wrong-tenant, unauthorized-role, inactive, missing-context, and side-effect ordering tests | `evidence_ready` only for the exact endpoint branch covered |
| 4. Replacement gate | New action is authoritative; no `old OR new` fallback-to-allow path | Separate implementation packet required |
| 5. Legacy retirement | All callers migrated, tests green, audit/rollback reviewed, and catalogue references reconciled | Separate schema/catalogue packet; never bundled with the first endpoint |

The six rows must not be bundled into one migration or one broad capability.
The safest first candidates for evidence are `create-client-audit` and
`tenant-lifecycle` because existing tests already cover part of their server
boundaries. `generate-certificate-pdf`, `notify-chat`, and
`record-completed-audit` need stronger external-effect/write characterization;
`notify-suggestion-submitted` needs special review of its internal plan-filter
semantics.

## Explicit non-decisions

This worksheet does not approve a replacement capability, remove
`staff.internal`, alter any role default, grant permission, change an Edge
Function, modify an RPC/RLS policy, enroll a pilot, or probe hosted data. It
also does not decide whether any endpoint should become client-accessible.
Those remain product/security/TOM decisions with their own implementation and
audit gates.

## Verification

Documentation-only packet. Run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Runtime, live-QA, authorization, migration, credential, and production
verification are not applicable until a separately approved endpoint packet
exists.
