# RBAC v6 — Packet P1-b: draft atomic action/scope classification (discussion draft, not a decision)

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md) — §7 P1, §5.1-5.4
> **Sibling packet:** [P1-a review worksheet](p1-a-review-worksheet.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** draft delivered 2026-09-11 — **this is a straw-man for Carl/product to react to and correct, not an approved classification.** Carl chose this path explicitly (over "you/product take the first pass" or "hold P1 for now") when asked how to proceed. The bundled rows now have a source-backed decomposition in [P1-e](p1-e-bundled-verb-decomposition.md).
> **Next preparation worksheet:** [P1-c capability enforcement and sequencing](p1-c-capability-enforcement-sequencing.md)
> **Owner:** Claude Code (draft only — approval owner is product/security per plan §7 P1 exit gate)
> **Evidence:** generated 2026-09-11 from [P1-a's worksheet](data/p1-a-worksheet.json) + P0.1-a's static inventory, at `origin/main@dac48b268`
> **Audit entry:** none — analysis/documentation only, no schema/RLS/grant/data change

## What this is, and what it explicitly is not

Per plan §7 P1: *"For every feature, classify current `full`, `limited`, and
`owner_only` behavior into atomic actions and scopes. Mark unknown cases; do
not guess."* This packet does that classification pass for all 85 features —
proposing an action verb, a scope (`own_resource` / `all_tenants` / `global`
per §5.4), a risk class, and a delegability flag for each — but it is
explicitly a **discussion draft**, not the "separately reviewed, versioned
golden access matrix owned by product/security" the plan's exit gate
actually requires. Full machine-readable output:
[`data/p1-b-draft-classification.json`](data/p1-b-draft-classification.json).

**Method, so the confidence level is honest:** most features were classified
from `feature_key`/`label`/`module` semantics plus two already-settled
decisions this program has made (ADR-030's "broad staff tenant access is
permanent policy," §5.4's explicit `owner_only → action=edit + scope=
own_resource` example). Only the genuinely ambiguous cases below were
checked against actual source — this is not a full re-audit of all 85
features' live enforcement (that's P0.6's job).

## Proposed scope defaults, by module

| Module | Proposed scope for a `full` grant | Why |
|---|---|---|
| Academy, Audits, Clients, Packages | `all_tenants` | Client-organization data; ADR-030 makes broad staff read/write access across tenants the permanent policy |
| EOS, Administration, Staff, Resource Hub, Documents | `global` | Vivacity-internal operations (EOS is Vivacity's own operating system, not client data; Resource Hub is a shared internal library; Documents' one feature is a machine-only automation account) |

`owner_only`-level rows (4 features: `eos.qc.own`, `eos.scorecard.update_own`,
`eos.rocks.own.manage`, `eos.todos.own`) map to `scope=own_resource` per the
plan's own example — the only mechanical, non-ambiguous scope conversion in
this draft.

## 11 features flagged high-risk / non-delegable (plan §5.7)

| Feature | Why |
|---|---|
| `admin.permissions.manage` | Permission/role/grant administration itself |
| `admin.system_config.manage`, `admin.email_templates.manage`, `admin.vector.manage` | System configuration |
| `admin.migration.unicorn1` | Migration tooling |
| `admin.testing.seed` | Destructive seeding/test-data control |
| `admin.integrations.xero_connect` | External shared-credential connect/disconnect |
| `clients.activate`, `clients.deactivate` | Destructive tenant lifecycle |
| `audits.export_pack` | Cross-tenant/unredacted export |
| `admin.documents.bulk_generate` | Bulk cross-tenant document generation (already machine-only via the `Bulk Generate Automation` role) |

Proposed: non-delegable, approval-controlled per §5.7 until product/security
says otherwise. Not applied anywhere — this is a proposal, no capability was
changed.

## 20 features marked `needs_product_input` (not classified with confidence)

Three distinct reasons, not one blanket "unsure":

**1. The verb may bundle multiple sub-actions of different risk (§5.3 rule 3)
— 18 features.** Every `*.manage` and `*.use` feature key
(`academy.tenant_access.manage`, `admin.team_users.manage`,
`admin.tenant_users.manage`, `admin.invites.manage`,
`admin.email_templates.manage`, `admin.system_config.manage`,
`admin.permissions.manage`, `admin.vector.manage`,
`admin.academy_mgmt.manage`, `clients.emails.manage`,
`eos.configurations.manage`, `eos.rocks.own.manage`,
`eos.scorecard.manage`, `staff.addin.use`, `staff.ai.use`,
`staff.meetings.use`, `staff.research.use`, `staff.sharepoint.use`) — none of
these were decomposed into their actual sub-operations here; that requires
reading each one's real UI/RPC surface, which is a proportionate next step,
not something to guess from a label.

**2. Real evidence found a distinction that may not exist — 1 feature.**
`clients.details.edit`: checked source directly
(`src/pages/ClientDetail.tsx:263`). The only call site is
`usePermission('clients.details.edit', 'limited')` — a single boolean gate.
Since `usePermission`'s ordinal check is `level >= minLevel`, **`full` and
`limited` are behaviorally identical today** at this call site; there is no
second call site that distinguishes them. Proposing this collapses to one
`edit` action with no separate `limited` scope in the target model, but
flagging explicitly since a distinction may have been *intended* and simply
never wired — that's a product question, not something to infer from
absence of code.

**3. A feature that isn't really an "action" at all — 1 feature.**
`staff.internal` ("Vivacity staff (generic)") gates being staff at all, not
a specific operation. Plan §5.1 explicitly warns against reusing an
identity/visibility check as an authorization predicate. This likely belongs
in principal-state/role-seat modeling, not the capability catalogue —
flagged for a product decision on whether to retire it as a "capability"
entirely, not decided here.

(Some features appear in more than one category above; 20 is the deduplicated
count in the JSON.)

## A finding this pass surfaced, not present in the plan's own framing

**51 of the 85 features have no `usePermission()` or `<PermissionGate>` call
site anywhere in `src/`** (per P0.1-a's static scan). This is *not* the same
as "unenforced" — most are very likely gated through direct RLS on the
underlying tables, a route-level role guard, or a pattern this scan doesn't
recognize (e.g. a direct `unicorn_role`/`isVivacityStaffRole()` check instead
of the `usePermission()` hook). It is flagged per-feature in the JSON
(`observed_frontend_gate: false`) rather than investigated individually here
— reconciling this against actual RLS/route/Edge enforcement for each of the
51 is squarely P0.6's "operational and feature-boundary baseline" job, not
something to hand-wave in a classification draft.

## What Carl/product needs to do with this

This is an input to react to, per the path chosen: correct any
module-default scope that's wrong, decide the 18 bundling-verb features'
real sub-actions, confirm or reject the `clients.details.edit` finding,
decide `staff.internal`'s fate, and — separately, not started here at all —
define job-role defaults with a seat representative and stand up the
separately-owned golden access matrix. None of that is attempted in this
draft.

## Verification

Docs-only change (`docs/**` only, plus a generated JSON data file) — no
`src/`, `supabase/`, dependency, or workflow file touched.
`node scripts/check-kb-links.mjs` and `node scripts/check-kb-doc-size.mjs`
are the relevant checks; no lint/typecheck/test suite applies since no code
changed.
