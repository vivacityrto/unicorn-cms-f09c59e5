# RBAC v6 — Packet P1-c: capability enforcement and sequencing worksheet

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P0.1-a static inventory](../p0/p0-1-a-static-inventory.md), [P0.1-b live inventory](../p0/p0-1-b-live-inventory.md), [P1-a review worksheet](p1-a-review-worksheet.md), [P1-b draft classification](p1-b-draft-classification.md)
> **Program index:** [Program Index](../../program-index.md)
> **Follow-up packets:** [P1-d static enforcement evidence ledger](p1-d-static-enforcement-ledger.md), [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md)
> **Status:** preparation worksheet; not a golden access matrix and not an authorization decision
> **Owner:** RBAC v6, with product/security approval required for target rows
> **Audit entry:** none needed — analysis/documentation only; no permission, role, RLS, grant, or production change

## Purpose and boundary

P1-b supplies a useful but intentionally unapproved action/scope strawman.
This worksheet adds the missing execution boundary: what must be characterized
at the enforcement layer before a row can become a golden access-matrix row,
which rows can be grouped for preparation, and which decisions remain with
product/security.

It does not reinterpret the strawman as policy, assign role defaults, alter
the live permission matrix, or authorize a route/Edge/RPC/RLS cutover. A row
is not implementation-ready merely because its feature name suggests a verb.

## Current evidence baseline

The delivered P0/P1 evidence establishes:

- 85 active permission features and 523 role-permission rows reconcile to the
  parent-plan figures;
- P1-b proposes action/scope/risk/delegability for all 85 rows, but marks the
  result as a discussion draft;
- 20 rows need product input, including 18 bundled `manage`/`use` features,
  `clients.details.edit`, and `staff.internal`;
- 11 rows are proposed high-risk/non-delegable candidates, including
  permission administration, system configuration, migration/testing,
  external credential connection, tenant lifecycle, export, and bulk document
  generation;
- 51 features have no recognized `usePermission()`/`PermissionGate` call site
  in the static scan. That is an enforcement-reconciliation queue, not proof
  of missing authorization; the real route, Edge, RPC, RLS, and relationship
  boundary must be identified before any conclusion; and
- ADR-030 permanently establishes broad internal-staff read access. It does
  not grant broad sensitive writes, exports, destructive actions, or scope
  bypasses.

## Row readiness states

Every feature row should carry one of these states in the next versioned
worksheet:

| State | Meaning | May become a golden row? |
| --- | --- | --- |
| `evidence_ready` | Current action, target resource, tenant scope, relationship rule, enforcement points, and negative cases are all cited | Only after product/security sign-off |
| `needs_enforcement_inventory` | Static feature exists but its real route/API/RLS/Edge boundary is not reconciled | No |
| `needs_product_input` | Current behavior does not answer the target policy question, or one label bundles multiple actions | No |
| `needs_security_review` | High-risk action, external credential, export, destructive behavior, or machine principal is involved | No |
| `needs_cross_initiative_contract` | Target depends on TOM identity/membership/ownership or Client Health/Ask Viv scope | No |
| `parked` | Explicitly deferred by an existing decision, such as person-picker classification or tenantless users | No |
| `implementation_ready` | Evidence and policy approvals exist, with a bounded vertical slice and rollback/observation plan | Yes, for that slice only |

No row may move to `implementation_ready` by inference from a feature label,
current frontend visibility, or a broad staff role.

## Preparation queue

### Queue A — decompose bundled verbs first

The 18 `*.manage`/`*.use` rows are not one action each. [P1-e](p1-e-bundled-verb-decomposition.md)
records the first source-backed decomposition pass; the next pass must still
enumerate each sub-operation's first privileged boundary:

| Feature family | Required decomposition | Stop condition |
| --- | --- | --- |
| Team users, tenant users, invites | list/read, edit profile, role/relationship change, disable, invite, resend, cancel, activate legacy path | Do not classify ghost activation or contact promotion without the TOM lifecycle contract |
| Email/system/vector/admin controls | view, edit, publish/apply, rotate/delete, export or external side effect | Security review required for secrets, system configuration, and destructive branches |
| Academy management and tenant access | course CRUD, publish, enrolment, certificate, client access, learner data | Preserve Academy-only client boundary and AJ/CSC pilot scope |
| Client email actions | compose, send, template, recipient selection, attachment/export | Messaging/privacy and tenant-scope evidence required |
| EOS configuration/rocks/scorecards | view, create, edit, publish/complete, own-resource actions | Separate EOS internal resources from client-facing operational data |
| Staff Add-in/AI/meetings/research/SharePoint | launch/read, search, write/send/share, external side effect | Identify machine/shared-secret paths and data sensitivity before delegation |

The pass should record callers and enforcement locations, not propose new
policy. A missing source or ambiguous branch becomes `needs_enforcement_inventory`
or `needs_product_input`.

### Queue B — reconcile the 51 features without recognized frontend gates

For each feature, inspect the route manifest, navigation, `usePermission`/
`PermissionGate` consumers, direct role predicates, RPC/Edge callers, RLS
policies, and resource-to-tenant binding. Record:

1. the user-visible entry point, if any;
2. the first server-side privileged read/write/subscription;
3. the subject and target-ID source at that boundary;
4. the tenant/resource relationship proof;
5. denial and cross-tenant negative behavior; and
6. whether the feature is staff-only, client-scoped, machine-only, or an
   inventory/identity predicate rather than an action.

The output is an enforcement evidence ledger. It must not silently fill a
missing frontend gate by granting a new one.

### Queue C — isolate special and high-risk rows

- `clients.details.edit` needs a product answer on whether current
  `limited`/`full` equivalence is intentional or an unwired distinction.
- `staff.internal` needs a product answer on whether it remains an identity/
  principal-state predicate or is retired from the capability catalogue.
- The 11 high-risk candidates need security review, explicit approval/control
  semantics, and direct negative probes before any role default is proposed.
- The four `owner_only` rows can use `own_resource` as a candidate scope from
  the plan's example, but still require enforcement evidence and review.

## Proposed sequencing after review

1. **Version the evidence ledger:** carry the P1-b feature keys forward and
   add readiness, enforcement boundary, relationship proof, and decision-owner
   columns. Preserve P1-b's JSON as historical draft input.
2. **Characterize Queue A:** split bundled verbs using repository source and
   existing static/live evidence. Do not change code or permissions.
3. **Characterize Queue B:** reconcile the 51 unrecognized frontend gates,
   prioritizing protected writes and resource/tenant resolution.
4. **Review Queue C:** product/security resolve the explicit policy rows and
   identify the non-delegable/high-risk controls.
5. **Build the golden access matrix:** only approved action/scope/relationship
   rows enter the versioned matrix; role defaults and grants are separate
   columns with named owners.
6. **Select one vertical slice:** prefer the AJ/CSC Academy/Package/Stage
   workflow only after its exact scope, persona fixtures, server enforcement,
   rollback, and 14-day shadow criteria are accepted.
7. **Cut over last:** route/nav metadata changes come after the server boundary
   and direct negative probes pass. No P1 worksheet authorizes that cutover.

## Decision ledger for product/security review

| Decision | Why it matters | Owner | Minimum evidence before approval |
| --- | --- | --- | --- |
| Exact sub-actions for the 18 bundled features | Prevents a single `manage` row from granting unrelated powers | Product + security | Source/caller decomposition and action-specific risk notes |
| `clients.details.edit` target semantics | Current `limited` and `full` are equivalent at the only observed gate | Product | Call-site review and intended role behavior |
| `staff.internal` catalogue fate | Identity visibility is not an action permission | Product + security | Principal-state model and replacement consumers |
| High-risk non-delegability and approval model | Prevents role/grant expansion through defaults | Security | Action branches, target resolution, audit/expiry/revocation contract |
| Job-role default bundles | Converts rows into actual seats without privilege creep | Product/operations | Named seat representatives and affected-feature review |
| AJ/CSC scope and pilot cohort | Determines tenant/resource relationship rules | Carl/Vivacity | Approved cohort, persona fixtures, observation and rollback owner |
| Golden-matrix ownership | Establishes who may approve future capability changes | Product/security | Review cadence, versioning, audit, and conflict handling |

## Exit criteria for this worksheet

This packet is ready for the next review when:

- all 85 rows have a readiness state and cited source input;
- the 18 bundled rows have source-backed sub-operation inventories or an
  explicit `needs_product_input` disposition;
- all 51 frontend-unrecognized rows have an enforcement-ledger entry or an
  explicit owner/blocker;
- the 11 high-risk rows have named security reviewers and no implicit
  delegability;
- the special `clients.details.edit` and `staff.internal` questions are
  isolated rather than silently classified; and
- one proposed vertical slice has a complete evidence/negative-test/rollback
  checklist, without changing live authorization.

The golden matrix, role defaults, grants, migrations, RLS changes, Edge
changes, and route cutovers remain separately gated deliverables.
