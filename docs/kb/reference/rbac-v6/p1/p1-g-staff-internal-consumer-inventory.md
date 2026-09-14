# RBAC v6 — Packet P1-g: `staff.internal` consumer inventory

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-c sequencing worksheet](p1-c-capability-enforcement-sequencing.md), [P1-d static enforcement ledger](p1-d-static-enforcement-ledger.md), [P1-f client-details semantics](p1-f-client-details-capability-semantics.md), [R2 approval packet](../../codebase-optimization/cross-cutting/remaining-gated-approval-packets-2026-09-12.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** R2-c consumer inventory delivered 2026-09-13; recommendation is to retire `staff.internal` as an action capability after replacement gates are approved
> **Source:** `origin/main@976c69f5f3c93de8532670a26d1f01737002e194`
> **Owner:** RBAC v6 with product/security review; TOM owns tenant relationship semantics
> **Audit entry:** none needed — repository analysis only; no permission, role, grant, RLS, RPC, Edge, credential, or production change

## Plain-language conclusion

`staff.internal` answers “is this person internal Vivacity staff?” It does not
answer what the person may do, which tenant/resource they may target, or which
relationship they have to that target. The catalogue currently grants it at
`full` to internal roles, so using it as a function gate makes every internal
role look equally authorized for that operation.

The source inventory found six production Edge consumers and no frontend
`usePermission()`/`PermissionGate` consumer. Five of the six are action
endpoints that should have action-specific capabilities; one (`notify-chat`)
also has a tenant-member path and needs a notification-specific contract. The
shared `FeatureKeys.staffInternal` entry and migration seed are registry/data
history, not additional live consumers.

**Recommendation:** retire `staff.internal` from the action-capability
catalogue after each consumer has an approved replacement. Preserve internal
staff identity as principal state (`is_vivacity_internal`/canonical internal
role resolver) and continue to evaluate capability, scope, relationship, and
target separately. Do not delete the catalogue row or change any gate as a
side effect of this packet.

## Consumer inventory

| Consumer | Current use of `staff.internal` | What the endpoint actually does | Recommended replacement shape | Current disposition |
| --- | --- | --- | --- | --- |
| `create-client-audit/index.ts:65` | `requireCaller` with `orAllow` for tenant access | Creates a `client_audits` row for a requested tenant; validates linked stage belongs to that tenant | `audits.create` plus server-resolved target tenant/relationship; retain a separate approved staff cross-tenant path if required | Action gate needed; do not treat internal identity as sufficient |
| `generate-certificate-pdf/index.ts:54` | `requireCaller` with owner fallback | Reads an Academy certificate, creates/returns a signed PDF URL, and updates certificate output metadata | `academy.certificates.generate` or a similarly named certificate-output action, plus owner/tenant relationship proof | Action gate needed; signed output and long-lived URL require security review |
| `notify-chat/index.ts:21` | `requireCaller` with `allowTenantMember` fallback | Reads notification preferences/integration settings and sends a Slack notification for a tenant event | Notification/send capability plus tenant membership or approved staff target scope; external side effect must be explicit | Action gate needed; do not use generic internal identity |
| `notify-suggestion-submitted/index.ts:66` | `checkPermission` result used as an `isStaff` branch | Allows internal staff to bypass Academy-only plan filtering while submitting/processing a suggestion | Separate suggestion action and an explicit internal-staff context check only for the documented plan branch; item RLS remains authoritative | Requires product/security review of bypass semantics |
| `record-completed-audit/index.ts:20` | `requireCaller` with `staff.internal` only | Records a completed/retrospective client audit with supplied tenant and audit snapshot fields | `audits.record_completed`/`audits.create_retrospective` plus target tenant and auditor relationship rules | High-impact write; action-specific gate and audit contract required |
| `tenant-lifecycle/index.ts:43` | `requireCaller` first, then Super Admin checks for transitions | Suspends, closes, archives, or reactivates tenants; validates transitions and reasons | Existing `clients.activate`/`clients.deactivate` semantics or explicit hard-Super-Admin action gates at the Edge boundary | `staff.internal` is redundant and historically dangerous; removal must preserve Super Admin checks |

## Evidence and non-consumers

### Registry and tests

- `supabase/functions/_shared/requireCaller.ts:45` exposes
  `FeatureKeys.staffInternal` alongside action keys. This is a registry entry,
  not a caller.
- `supabase/migrations/20260815080000_permission_features_edge_function_taxonomy.sql:36,90`
  seeds the catalogue and taxonomy. Migration text is historical/current-schema
  evidence only; it does not establish that the key is the correct gate for any
  endpoint.
- `supabase/functions/_shared/requireCaller.test.mjs:58` checks that the key is
  present in the shared registry. It does not authorize a production workflow.
- `src/` contains no direct `staff.internal` feature-key gate. Frontend code
  uses `isVivacityStaffRole`, `is_vivacity_internal`, or more specific
  capabilities in the relevant places; those checks still need normal
  capability/relationship review, but they are not consumers of this row.

### What the current gate does not prove

The current `requireCaller` call proves that the caller must satisfy the
`staff.internal` row (or, for some functions, a separate `orAllow` path). It
does not prove:

- that every internal role should perform the endpoint's action;
- that the supplied tenant/resource belongs to the caller's allowed scope;
- that the caller is the named auditor, certificate owner, notification target,
  or relationship owner;
- that the caller may trigger an external Slack or signed-document side effect;
  or
- that a staff-only endpoint should remain staff-only instead of becoming an
  action available to an approved client/member relationship.

Those are separate target, relationship, and action decisions.

## Replacement map

The following map is intentionally a design worksheet, not a new active
catalogue. Names may be corrected by product/security before implementation:

| Current consumer | Candidate action | Required context | Negative cases that must deny |
| --- | --- | --- | --- |
| Create client audit | `audits.create` | target tenant, linked stage/package tenant match, approved auditor/assistant fields | cross-tenant linked stage, inactive caller, arbitrary subject, missing target |
| Generate certificate PDF | `academy.certificates.generate` | certificate owner or approved Academy staff scope, certificate/tenant binding | another user's certificate without staff action, unknown certificate, inactive caller |
| Send chat notification | `notifications.send` or event-specific notification action | target tenant, recipient preference, authorized event/actor, external integration scope | tenant-B preference, unauthorized event, disabled integration, spoofed recipient |
| Process suggestion | `suggestions.submit`/`suggestions.review` plus internal plan-context check | suggestion row's tenant, Academy access scope, caller identity | academy-only client bypass, another tenant's item, missing/unknown caller |
| Record completed audit | `audits.record_completed` | target tenant, auditor role/relationship, immutable audit evidence/audit log | arbitrary completed audit for another tenant, future date, missing reason/evidence, inactive caller |
| Tenant lifecycle | `clients.activate`/`clients.deactivate` or hard-SA action family | transition, reason, target tenant, Super Admin policy | Team Member/CSC suspend or close, invalid transition, archive/reactivate without required authority |

The first five rows should not be solved by replacing one broad key with one
other broad key. Each must be traced through its server-side write/read,
resource relationship, and negative case. The lifecycle function is different:
the code already performs action-specific Super Admin checks after the broad
gate, so the safe future shape is to preserve those checks and remove only the
redundant identity capability once replacement coverage is proven.

## Principal-state replacement

Retiring the capability row does not mean removing internal-staff identity.
The application still needs a canonical principal-state resolver for questions
such as:

- Is this an active Vivacity employee/service principal?
- Is this a human or machine principal?
- Which internal seat/role is active?
- Is an internal-only UI surface visible?

That resolver must not be reused as the sole authorization decision for a
tenant mutation, export, credential action, external side effect, or other
sensitive operation. The target decision remains:

```text
active principal + exact capability + resolved target scope + relationship proof
```

For broad internal tenant reads, ADR-030 is the policy authority. It does not
grant broad sensitive writes or make a Vivacity tenant membership row a
substitute for staff identity.

## Safe retirement sequence

1. Approve this consumer map and correct candidate action names where product
   or security requires.
2. For each endpoint, characterize the positive path, unauthorized internal
   role, client/member path, cross-tenant target, inactive principal, and
   external side effect as applicable.
3. Add or confirm the action-specific capability and server check in a bounded
   vertical slice; keep the old gate as a temporary compatibility guard only
   when that does not create an `old OR new` fallback-to-allow path.
4. Verify the new gate is authoritative, then remove the `staff.internal`
   call from that endpoint and update its focused auth test.
5. After all consumers are migrated and the role/catalogue references are
   reconciled, retire the row from the catalogue in a separately reviewed
   authorization/schema packet with an audit entry if the live schema changes.

No step above is authorized by this documentation packet. In particular,
there is no deletion of the feature row, role-permission update, Edge deploy,
RLS change, RPC change, or production data change here.

## R2-c decision and remaining gate

R2-c is approved for the principal-state design direction: `staff.internal`
should not remain an action capability. The consumer inventory is complete for
the direct production references found on the source commit. Implementation
remains blocked until product/security approves the replacement action and
relationship semantics for each endpoint, with particular attention to
completed-audit writes, signed certificate output, notifications, and the
suggestion plan bypass.

The next unattended preparation is recorded in the [endpoint-by-endpoint
replacement worksheet and focused negative-case contract](p1-t-staff-internal-replacement-and-negative-case-worksheet.md).
That work remains source-only and must stop before changing a gate or live
catalogue row.

## Verification

This is a docs-only packet. Relevant checks are:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

No frontend, Edge, migration, schema, authorization, credential, or live-QA
verification is applicable because no runtime source changed.
