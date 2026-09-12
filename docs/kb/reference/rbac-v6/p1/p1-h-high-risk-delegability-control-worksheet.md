# RBAC v6 — Packet P1-h: high-risk delegability control worksheet

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §5.7, §7 P1
> **Inputs:** [P1-b draft classification](p1-b-draft-classification.md), [P1-c enforcement and sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-d static enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [remaining gated approval packet](../../codebase-optimization/cross-cutting/remaining-gated-approval-packets-2026-09-12.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** preparation worksheet delivered 2026-09-13 — recommendation only; security approval and every runtime enforcement change remain gated
> **Owner:** RBAC v6 with product/security review required before any exception or implementation
> **Evidence:** repository source at `origin/main@7b7b39a8c4ab90ef23108101d1ca2f9fc4650e8e`; P1-d's 11 high-risk rows and static references
> **Audit entry:** none needed — analysis/documentation only; no permission, role, grant, RLS, schema, Edge, or production change

## Purpose and hard boundary

R2-d asked whether the 11 rows marked high-risk in P1-b should be delegable.
The safe interim answer is **no: keep every row non-delegable and
approval-controlled by default** until product/security approves a more
specific control model. This worksheet turns that answer into an evidence and
review checklist without pretending that a document can enforce it.

“Non-delegable” means an ordinary role bundle or user capability grant must not
make the action available. It does not, by itself, decide whether the eventual
operator is a hard-SA principal, a separately governed machine principal, or a
short-lived protected workflow. A true break-glass path is a separate decision;
it must not be smuggled into the ordinary Super Admin role or into
`admin.permissions.manage`.

Nothing here changes the current permission catalogue, role defaults, grants,
route guards, RLS, Edge Functions, credentials, migrations, or live data. The
source references below are a static repository map, not proof of the effective
live authorization boundary. P1-c/P0.6 still own the route/API/RPC/RLS
reconciliation and executable positive/negative probes.

## Common control contract for any future exception

No high-risk row may move from `non-delegable` to `delegable` merely because a
UI control exists or a caller currently passes `staff.internal`. Before an
exception is considered, the implementation packet must show all of the
following at the trusted server boundary:

1. **Named action and target:** the atomic action is separated from bundled
   `manage`/`use`; the server resolves the target and rejects a mismatched or
   missing tenant/resource ID.
2. **Principal class:** the caller is an active, non-archived, non-disabled
   human or an explicitly classified machine principal. A browser-supplied
   subject or service-role possession is never sufficient.
3. **Protected approval:** a named approver other than the requester, a reason
   or ticket, and any required reauthentication/MFA are captured before the
   action. Self-grant and self-approval are denied.
4. **Time and revocation:** the authorization has a start/expiry, explicit
   revocation state, and no path that silently extends it or treats an expired
   grant as active.
5. **Atomic audit:** one immutable record contains actor, action, target,
   before/after or requested effect, reason, correlation/idempotency ID, approver,
   and outcome. A failed audit must roll back the protected mutation; retries
   must not duplicate the effect or audit record.
6. **Negative proof:** direct authenticated probes cover an ordinary human,
   wrong tenant/target, disabled or archived principal, expired/revoked grant,
   missing context, requester-as-approver, and retry/concurrency behavior.
7. **Observation and rollback:** the authority mode, owner, alerting, review
   window, and pre-characterized rollback are named. A rollback must not restore
   known fail-open behavior or access for a revoked/disabled principal.

The default remains deny until every applicable item is evidenced and the
product/security owner records the exception in the golden matrix. There is no
standing break-glass or emergency bypass in this packet.

## Source-backed row worksheet

The “current evidence” column names representative references from the static
ledger. It is intentionally not an exhaustive live consumer inventory. The
“required target proof” column is the minimum evidence still missing before a
row can become an approved atomic matrix row.

| Capability | Current repository evidence | Why ordinary delegation is unsafe | Required target / control proof | Default disposition and denial cases |
| --- | --- | --- | --- | --- |
| `admin.permissions.manage` | `supabase/functions/update-role-permission/index.ts:39`; key declaration in `_shared/requireCaller.ts:55` | It changes the authorization system itself; a grantee could otherwise create privilege escalation or approve its own access | Split inspect, edit-role-permission, grant/revoke, and policy administration. Prove protected workflow, optimistic version/concurrency handling, one atomic audit, and no self-grant/self-approval or hard-SA assignment | **Non-delegable.** Deny ordinary grants, self-targeted escalation, self-approval, unknown/inactive capability, concurrent stale edits, and audit failure |
| `admin.system_config.manage` | 13 Edge consumers in the ledger, including `pdp-auto-evidence/index.ts:192`, `generate-excel-document/index.ts:171`, `tga-sync/index.ts:1730`, and `upload-sharepoint-file/index.ts:177` | One broad key currently spans diagnostics, generation, provisioning, repair, sync, and external writes with different targets and blast radii | Decompose by operation and target. Prove system/global scope, caller and machine classification, external-side-effect controls, idempotency, and per-operation audit/negative probes; do not let a broad key remain the policy boundary | **Non-delegable.** Deny ordinary role grants, missing target/config context, cross-tenant external writes, disabled principals, and partial/failed evaluation |
| `admin.email_templates.manage` | `supabase/functions/send-stage-email/index.ts:76`; key declaration in `_shared/requireCaller.ts:61` | System-wide templates can alter every outbound message and may affect content, recipients, and compliance evidence; the current reference is a downstream consumer, not proof of an admin CRUD boundary | Find and characterize the actual template view/edit/publish/delete writer, separate content editing from publish/send, prove recipient/tenant scope and approval for publication, and audit before/after content without leaking secrets | **Non-delegable.** Deny ordinary grants, publish without approval, cross-tenant template mutation, unscoped recipient selection, and edits by inactive/revoked principals |
| `admin.vector.manage` | `vector-index-update/index.ts:67`, `vector-index-remove/index.ts:56`, `vector-index-rebuild/index.ts:80`; embedding consumers and FAQ generation in P1-d | Index update, removal, and rebuild can destroy or reshape shared retrieval behavior and may ingest sensitive corpus content; one `manage` row bundles destructive and generative effects | Split inspect, update, remove, rebuild, and embedding generation. Prove corpus/document ownership, complete target context, safe rebuild/rollback, idempotency, audit of source/version, and machine versus human principal rules | **Non-delegable.** Deny ordinary grants, remove/rebuild without approval, unscoped corpus access, stale concurrent rebuilds, and partial-index success reported as allow |
| `admin.migration.unicorn1` | `import-unicorn1-client/index.ts:257`, `lookup-unicorn1-client/index.ts:78`, `mark-unicorn1-user-mapped/index.ts:19`, and `search-unicorn1-users/index.ts:19` | Legacy migration paths can create, map, or mutate identities and tenant records across schemas; reusing the row for routine access would expose a one-way or high-blast-radius tool | Identify each migration action, approved non-production/allowlisted target, idempotency key, dry-run/preview, rollback or compensating action, and operator audit. Keep legacy import paths isolated from ordinary human grants | **Non-delegable.** Deny production use without explicit packet, unallowlisted target, duplicate/replay, missing mapping proof, and browser/service-role subject substitution |
| `admin.testing.seed` | `supabase/functions/dashboard-test-seed/index.ts:36`; key declaration and static auth test in `_shared` | Seeding is destructive test-data control and can overwrite or contaminate real tenant data if target/environment checks fail | Prove disposable non-production target, environment allowlist, synthetic fixture identity, destructive-operation confirmation, run ID, cleanup/residue verification, and no production credential path | **Non-delegable.** Deny production URL/ref, missing allowlist, ordinary role grant, missing run ID, disabled operator, and cleanup/audit failure |
| `admin.integrations.xero_connect` | `supabase/functions/xero-auth/index.ts:58`; key declaration in `_shared/requireCaller.ts:59` | Connect/disconnect crosses an external trust boundary and handles shared credentials or tokens; failure can affect accounting integrations and tenant data | Prove secret-manager custody, no browser secret, explicit tenant/integration target, reauth/MFA as appropriate, connect/disconnect audit, token revocation behavior, and safe retry/idempotency | **Non-delegable.** Deny ordinary delegation, missing tenant target, token/secret in request data, inactive principal, repeated callback, and disconnect without revocation evidence |
| `clients.activate` | `src/components/tenant/TenantLifecycleActions.tsx:24` `usePermission`; client-lifecycle server boundaries remain to be reconciled | Reactivation changes tenant operating state and can re-enable jobs, access, or notifications; a frontend hook is only a UX gate | Trace the actual lifecycle writer and transition map. Prove active principal, allowed source state, target tenant ownership/assignment, reason/approval, dependent-job/session effects, idempotency, and reversal | **Non-delegable.** Deny ordinary grant, invalid transition, wrong tenant, disabled/archived requester, missing reason, and duplicate/reactivation race |
| `clients.deactivate` | `src/components/tenant/TenantLifecycleActions.tsx:23` `usePermission`; server boundary remains to be reconciled | Deactivation/close can cut off users, data access, jobs, and operational workflows; “close” may not be equivalent to a reversible disable | Separate deactivate, suspend, close, and archive if present. Prove target-state semantics, dependent access/session/job effects, notification/audit contract, approval, and pre-characterized reversal | **Non-delegable.** Deny ordinary grant, wrong tenant, invalid state transition, missing approval/reason, already-closed target, and partial dependent-state update |
| `audits.export_pack` | `supabase/functions/export-compliance-pack/index.ts:34`; frontend invocation through `src/hooks/useCompliancePacks.tsx:109` | Export can cross tenant boundaries and create an unredacted durable copy of sensitive compliance evidence; possession of a broad read role is not enough | Prove explicit export target/filter, tenant and record-set resolution, redaction/classification policy, recipient/storage destination, signed artifact expiry, download audit, and no sensitive existence leakage on denial | **Non-delegable.** Deny ordinary grants, missing target/filter, cross-tenant mismatch, unredacted destination, expired artifact, and disabled/revoked exporter |
| `admin.documents.bulk_generate` | `supabase/functions/provision-tenant-sharepoint-folder/index.ts:388` literal key; P1-d records the Bulk Generate Automation role | Bulk generation can fan out across tenants and create/deliver many artifacts; the existing machine-only role is a useful constraint, not proof of complete policy | Keep as a dedicated machine capability unless security explicitly approves otherwise. Prove fixed workflow identity, tenant allowlist, preview/dry-run, idempotency, output/delivery audit, rate/volume guard, and cancellation/partial-failure handling | **Non-delegable to humans.** Deny human ordinary grants, unallowlisted tenant, duplicate run, missing generation scope, partial success without ledger, and browser-supplied machine identity |

## Evidence state by row

All 11 rows currently remain `needs_security_review`, not
`implementation_ready`. The static ledger establishes keys, representative
callers, and broad risk rationale; it does not establish effective live policy,
RLS, role defaults, or the complete action branch. In particular:

- `admin.system_config.manage` and `admin.vector.manage` are demonstrably
  bundled keys. Their current consumers must not inherit one future grant.
- `admin.email_templates.manage` is observed at a send-stage consumer; the
  admin template CRUD/publish boundary still needs an explicit inventory.
- `clients.activate` and `clients.deactivate` have frontend hooks but no
  concrete Edge key in P1-d. The lifecycle writer and transition semantics are
  therefore an enforcement-reconciliation item, not an inferred allow.
- `admin.documents.bulk_generate` has a literal Edge gate and a machine-role
  design note, but still needs direct positive/negative probes and delivery
  failure evidence before any role/default decision.
- None of the rows in this packet is approved for a grant, role default,
  route cutover, migration, RLS change, or Edge deployment.

## Security/product decisions requested

The following are the only decisions this worksheet asks the owners to make:

1. Confirm the interim default: all 11 rows remain non-delegable and
   approval-controlled while their atomic boundaries are characterized.
2. Name the security reviewer and decision owner for each exception request;
   silence is not approval.
3. Decide whether any row may use a separately governed hard-SA principal,
   dedicated machine principal, or protected just-in-time workflow. This is
   distinct from ordinary role delegation and from a true break-glass account.
4. Confirm the required audit, expiry/revocation, reauth/MFA, target-resolution,
   and negative-probe contract above, or record a stricter alternative.
5. For lifecycle, export, Xero, migration, seeding, and bulk generation, name
   the safe synthetic/allowlisted fixture and rollback owner before runtime
   characterization begins.

An approval of the interim default does **not** authorize implementing the v6
evaluator, changing existing grants, adding approvers, creating a break-glass
path, restarting jobs, deploying Edge Functions, or changing live data.

## Exit criteria for a future implementation packet

R2-d is ready to leave the preparation stage only when:

- each row is decomposed into atomic actions with a named trusted boundary;
- target, tenant/resource relationship, principal class, and failure ordering
  are evidenced;
- product/security has approved any exception to non-delegability and named
  the owner, approver, expiry, revocation, and reauth/MFA rules;
- direct positive and negative probes cover wrong target, inactive principal,
  expired/revoked authorization, missing context, self-approval, concurrency,
  retry, and audit failure;
- one atomic audit owner and idempotency contract are proven;
- machine workflows have fixed principals and allowlisted scope; and
- a separate implementation packet names the exact code/schema/RLS/Edge change,
  observation window, rollback, and required audit entry.

Until then, safe unattended work is limited to source reconciliation, synthetic
negative-case design, and documentation updates. The next likely packet is
R2-e job-role defaults/AJ-CSC pilot, but it should remain held until the atomic
rows, golden matrix, personas, observation window, and rollback owner exist.

## Verification

Documentation-only change. Relevant checks are `node scripts/check-kb-links.mjs`,
`node scripts/check-kb-doc-size.mjs`, and `git diff --check`; the frontend and
Edge test suites are not applicable because no runtime source changed.
