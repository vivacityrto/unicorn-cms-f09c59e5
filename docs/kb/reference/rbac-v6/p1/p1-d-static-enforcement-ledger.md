# RBAC v6 — Packet P1-d: static enforcement evidence ledger

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1
> **Inputs:** [P1-a review worksheet](p1-a-review-worksheet.md), [P1-b draft classification](p1-b-draft-classification.md), [P1-c sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-e bundled-verb decomposition](p1-e-bundled-verb-decomposition.md), [P0.1-a static inventory](../p0/p0-1-a-static-inventory.md)
> **Machine-readable ledger:** [P1-d static enforcement ledger JSON](data/p1-d-static-enforcement-ledger.json)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** static enforcement ledger delivered; bundled-verb decomposition is in [P1-e](p1-e-bundled-verb-decomposition.md); remaining rows are not a golden access matrix or authorization decision
> **Source:** `origin/main@49fa5e71c401e046c82071a7ba3b05e6d78c373f`
> **Owner:** RBAC v6 with product/security review required for target rows
> **Audit entry:** none needed — repository analysis only; no permission, role, RLS, grant, Edge, credential, or production change

## Purpose and method

This is the first evidence-ledger pass authorized by R1. It carries all 85
P1-b feature keys forward, joins them to the generated P0.1-a
`usePermission()`/`PermissionGate` inventory, and scans `src/**` and
`supabase/functions/**` for exact feature-key references. A second Edge pass
resolves `FeatureKeys.*` constants and literal keys in non-test Edge entry
points to concrete `requireCaller`/`check_permission` call sites. References in
shared authorization registries and tests are retained for traceability but
are not counted as live caller evidence. The ledger deliberately leaves the
server boundary, relationship proof, and negative case unresolved until each
row is reconciled against its actual route, RPC, Edge, and RLS path.

This prevents two opposite errors: treating a missing frontend gate as proof
of missing enforcement, and treating a string in a shared auth allowlist as a
real feature caller. No row is promoted to `implementation_ready` by this
packet.

## Current static counts

| Measure | Result | Interpretation |
| --- | ---: | --- |
| Active feature rows | 85 | Matches the P0.1/P1-a catalogue |
| Recognized frontend gate call sites | 41 | 36 `usePermission()` calls plus 5 `PermissionGate` usages |
| Feature rows with a recognized frontend gate | 34 | Direct caller evidence exists, but server enforcement is still unverified |
| Feature rows without a recognized frontend gate | 51 | Reconciliation queue; not proof of an authorization gap |
| Feature keys with concrete Edge gate references | 25 | 122 `FeatureKeys.*`/literal references in non-test Edge entry points |
| Feature rows with any recognized frontend or Edge gate | 56 | Direct client or Edge evidence exists; target/RLS scope is still unverified |
| Feature rows with neither recognized frontend nor Edge gate | 29 | Highest-priority reconciliation queue; not proof that RLS or another boundary is absent |
| Feature keys referenced in migrations | 85 | 319 historical/seed references; migration text is not proof of current live enforcement |
| Raw `unicorn_role` comparisons | 59 | Context for direct-role and route-boundary review |
| Edge Function inventory entries | 192 | Context from P0.1-a; 122 concrete key references are mapped in the ledger |
| Bundled `manage`/`use` rows | 18 | **Correction:** 13 `manage` + 5 `use`, not the 14 stated in earlier packet prose |
| Additional special policy rows | 2 | `clients.details.edit` and `staff.internal` |
| High-risk rows | 11 | Security review before delegation or role defaults |

The earlier “20 product-input rows” remains directionally correct as a
deduplicated policy-question count: 18 bundled verbs plus the two special
rows. In the machine ledger, readiness precedence assigns high-risk rows to
`needs_security_review`, so its non-overlapping distribution is 58
`needs_enforcement_inventory`, 16 `needs_product_input`, and 11
`needs_security_review`.

## Readiness states

| State | Meaning in this ledger | Next action |
| --- | --- | --- |
| `needs_enforcement_inventory` | A target row may be mechanically plausible, but route/API/RPC/Edge/RLS and relationship evidence is not reconciled | Trace the first privileged boundary and negative case |
| `needs_product_input` | A bundled verb or semantic distinction cannot be resolved from current behavior alone | Decompose live sub-actions and send the exact question to product |
| `needs_security_review` | High-risk, destructive, export, credential, system, or machine-principal behavior is involved | Name security reviewer and control/negative-probe contract |
| `needs_cross_initiative_contract` | Target depends on TOM identity/membership/ownership or Client Health scope/provenance | Join the owning initiative's contract before classification |
| `parked` | Existing decision explicitly defers the row | Preserve the decision and unblock only through its named owner |
| `evidence_ready` | Current boundary, relationship, and denial evidence are cited | Product/security may review; not implementation authority |

## Bundled-verb decomposition seed

The following 18 rows end in `.manage` or `.use`. The proposed sub-actions are
an evidence-collection checklist, not a policy assignment. Exact direct gate
references and all other source references are in the JSON ledger.

| Feature row | Direct gate evidence in current source | Sub-actions to reconcile before policy review |
| --- | --- | --- |
| `academy.tenant_access.manage` | `src/pages/superadmin/AcademyTenantAccessPage.tsx:43` | view access, grant/revoke access, tenant/client scope, learner-data boundary |
| `admin.team_users.manage` | none recognized | list/detail, profile edit, role/relationship change, disable, invite/resend/cancel, legacy activation |
| `admin.tenant_users.manage` | none recognized | tenant-user list/detail, membership edit, relationship/role change, disable, tenant scope |
| `admin.invites.manage` | none recognized | create, resend, cancel, expiry, recipient/tenant resolution, email side effect |
| `admin.email_templates.manage` | none recognized | view, edit, publish/apply, recipient/template side effect |
| `admin.system_config.manage` | none recognized | view, edit, apply/rotate/delete, system-wide scope and audit |
| `admin.permissions.manage` | none recognized | inspect, create/edit/revoke grant, role default, break-glass/audit |
| `admin.vector.manage` | none recognized | inspect, index/write/rebuild/delete, source data and external side effect |
| `admin.academy_mgmt.manage` | none recognized | course CRUD, publish, enrolment, certificate, client access, learner data |
| `clients.emails.manage` | none recognized | compose, template, recipient selection, send, attachment/export |
| `eos.configurations.manage` | `src/components/eos/configurations/EosConfigurationEditor.tsx:143`; `src/pages/EosMeetings.tsx:33` | view, edit, publish/apply, internal-versus-client target |
| `eos.rocks.own.manage` | `src/pages/EosRocks.tsx:81` | create, edit, complete/archive, own-resource proof, delegated ownership |
| `eos.scorecard.manage` | `src/pages/EosScorecard.tsx:67` | view, edit, publish/complete, scorecard ownership and team scope |
| `staff.addin.use` | none recognized | launch/read, search, write/send/share, external side effect |
| `staff.ai.use` | none recognized | launch, structured context, retrieval, write/send, tenant-fact scope |
| `staff.meetings.use` | none recognized | launch/read, create/update, participant scope, recording/external side effect |
| `staff.research.use` | none recognized | search/read, export/share, external source and data sensitivity |
| `staff.sharepoint.use` | none recognized | search/read, write/share, site/document scope, external side effect |

The 18-row count is itself a corrected evidence finding. Any prior packet text
that calls this queue “14” should be read as stale; this ledger is authoritative
for the static count at the stated source commit.

## Queue B — no recognized frontend gate or concrete Edge key

The full 51-key frontend-gap list and the narrower 29-key no-recognized-gate
list are retained in the JSON ledger. The queue must be handled as an evidence
reconciliation, not a blanket “add a gate” exercise. A feature can be in the
51-key list and still have a concrete Edge gate; it is in the 29-key list only
when neither the recognized frontend inventory nor the Edge key pass found a
concrete reference. Migration references are useful for locating seed/catalogue
history, but do not turn a row into current enforcement evidence without a
live-schema or source-boundary reconciliation. Prioritize
in this order:

1. protected writes, destructive actions, exports, credential/external side
   effects, and machine-principal paths;
2. resource and tenant resolution for package/stage/client data; and
3. read-only views where route guards, direct role checks, RPCs, Edge Functions,
   and RLS may already provide the boundary.

For each row record the entry point, first privileged server boundary,
subject/target ID source, tenant or relationship proof, denial behavior, and
whether the row is staff-only, client-scoped, machine-only, or actually a
principal-state predicate. A missing `usePermission()` call must never be
silently repaired by granting a new capability.

## Special and high-risk rows

- `clients.details.edit` remains a product question: the only observed gate
  (`src/pages/ClientDetail.tsx:263`) asks for `limited`, while the ordinal
  `usePermission` check makes `full` and `limited` behaviorally equivalent at
  that call site. The ledger does not infer whether this is intentional.
- `staff.internal` is an identity/principal-state predicate in the plan's
  model, not automatically an action capability. Its catalogue fate needs
  product/security review.
- The 11 high-risk rows remain non-delegable candidates pending security
  review: permission administration, system configuration, migration/testing,
  external credential connection, tenant lifecycle, export, bulk generation,
  and other destructive/system actions listed in P1-b/P1-c.
- ADR-030 establishes broad internal-staff tenant read access. It does not
  establish broad sensitive writes, exports, destructive actions, or scope
  bypasses.

## Acceptance and remaining gates

The next ledger revision is accepted when every row has a source-backed first
boundary, subject/target relationship proof, denial/error case, owner, and
readiness state, with ambiguous policy rows explicitly forwarded rather than
guessed. Product/security still own the exact sub-actions, high-risk
delegability, `clients.details.edit`, `staff.internal`, job-role defaults, the
golden access matrix, and any eventual vertical slice.

This packet does not authorize grants, role defaults, RLS, Edge deployment,
route cutover, live QA, or production changes. The approved next unattended
work is to continue the static ledger and shared `AdminStageDetail` packet,
stopping at those gates.
