# RBAC v6 — Packet P1-p: AJ/CSC stage read-boundary review

> **Last updated:** 2026-09-13 · **Status:** preparation-only review; no golden row, capability, role, route, RLS, RPC, Edge, pilot, or production state changed
> **Parent:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Inputs:** [P1-o package read-boundary review](p1-o-packages-read-boundary-review.md), [P1-n enrolment read-boundary review](p1-n-aj-csc-enrolment-read-boundary-review.md), [P1-m Academy builder read-boundary review](p1-m-aj-csc-academy-read-boundary-review.md), [P1-l golden-matrix review draft](p1-l-aj-csc-golden-matrix-review-draft.md), [TOM P0.1 source inventory](../../../codebase-state/tenant-p0-source-inventory.md), [Program Index](../../program-index.md)
> **Owner:** RBAC v6, with TOM review for package/stage/tenant relationships and product/security review for policy
> **Source baseline:** `origin/main` after PR #1240 (`b87ef70f83e9165a56d3ea83ddc3a5679b067ab0`)
> **Audit entry:** none needed — repository source and migration-history review only

## Purpose and boundary

This packet reviews the fourth initial read candidate, `stages.view`. The
current source has no direct `stages.view` feature-key caller. Stage reads are
instead spread across Super Admin stage administration, package-stage
relationships, client package journeys, stage-version history, and template
content. A stage is therefore not a single unscoped catalogue object.

This is a preparation finding, not a policy or security remediation. No live
schema or policy was queried in this pass, and no role, grant, route, pilot,
RPC, Edge, or production state changed.

## Current source evidence

| Surface | Evidence on `origin/main` | Review implication |
| --- | --- | --- |
| Admin stage routes | `src/routes/dashboardRoutes.tsx:571-576` puts `/admin/stages`, `/admin/stages/:stage_id`, package builder, and stage builder under `ProtectedRoute requireSuperAdmin`. | A Super Admin route tier is a navigation boundary for several read/write tools, not an atomic `stages.view` policy row. |
| Stage catalogue | `src/pages/AdminManageStages.tsx:180-207` selects all rows from `stages`, then reads `package_stages` and `client_package_stages` joined to active client packages to calculate usage. | The list reveals catalogue data plus package/client usage relationships; its scope and sensitivity differ from a client’s own stage journey. |
| Stage detail | `src/pages/AdminStageDetail.tsx:301-325` reads package IDs from `package_stages` and then package metadata; the page also delegates template content, dependency, impact, quality, and version hooks. | Detail reads cross package, stage, document, task, email, and client-impact boundaries and cannot be represented by a bare stage row. |
| Version reads | `src/hooks/useStageVersions.tsx:80-109` selects all `stage_versions` for a stage; `:214-254` reads `package_stages`, `stage_versions`, and latest published versions. | Version history and published snapshots need a separate data-sensitivity and relationship decision. |
| Client journey | `src/hooks/use-client-package-stages.ts:25-44` reads `v_client_package_stages` for an active tenant and package instance. | This is a tenant/client-scoped stage-instance view, not the Super Admin stage-template catalogue. |
| Package linkage | The package-to-stage relation is used by package builders, client package views, time capture, documents, and task flows. | TOM must define whether the target is a global stage template, a package-stage mapping, a tenant instance, or a client-visible instance. |

## Historical server-boundary evidence

The migration history shows multiple policy generations:

1. `supabase/migrations/20260105014522_c020bb23-c93e-4e3b-9042-e1bece4e2af9.sql:19-33`
   creates `package_stages` as a package-to-stage catalogue mapping and enables
   RLS. Its `package_stages_select_authenticated` policy at lines 176-178
   uses `FOR SELECT TO authenticated USING (true)`. The same migration also
   creates unconditional authenticated insert/update/delete policies.
2. `supabase/migrations/20260204063305_4d65f0a8-45c6-4bca-bc66-60d1262ac2fa.sql:22-54`
   drops the unconditional package-stage write policies and replaces them with
   `is_staff() OR is_super_admin()` checks. It does not drop the earlier
   unconditional SELECT policy in the shown migration, so whether that broad
   read remains effective is an explicit live verification item.
3. The same corrective migration adds staff-only insert/update policies for
   `stage_versions`, but the effective SELECT policy and any view/RPC access
   still need current-schema reconciliation.

These are migration-history facts, not claims about the deployed schema. The
`package_stages` SELECT history is important enough to preserve as a targeted
security probe: a future `stages.view` decision must not assume that a broad
authenticated read is either intended or safely tenant-scoped.

## Review disposition

`stages.view` remains **`needs_cross_initiative_contract`** and
`needs_enforcement_inventory` until the target resource class is chosen.

Before any golden row can be approved, the next evidence packet must:

1. Reconcile current live RLS, grants, view security mode, RPC boundaries,
   and Realtime visibility for `stages`, `package_stages`, `stage_versions`,
   `client_package_stages`, and the stage-related views used by the client
   journey.
2. Split at least these candidate reads: global stage-template catalogue;
   package-stage mapping; stage-version history/snapshot; tenant/client stage
   instance; and stage-derived task/document/email metadata.
3. Have TOM define the package-to-stage-to-tenant relationship and whether
   internal staff broad tenant reads apply to each class. A route guard or
   assignment label is not relationship proof.
4. Define positive and negative QA-safe cases for AJ/CSC, ordinary CSC,
   client, disabled/archived/expired principal, wrong tenant, wrong package,
   wrong stage, and direct API/view access. Include the permissive-history
   `package_stages` SELECT probe explicitly.
5. Have product/security classify stage-template metadata, version snapshots,
   client-visible stage state, and embedded task/document/email data by action
   and sensitivity. Publishing/applying a version is not a view action.

No page render, route reachability result, or successful table query is an
authorization oracle. No frontend gate should be added as a side effect of
this review.

## Scope intentionally held

This review does not authorize stage creation/edit/delete, certification,
publish/apply, package assignment, recurrence changes, client-stage writes,
role defaults, capability grants, route rewrites, hosted QA, pilot enrollment,
RLS/RPC/Edge changes, migrations, or production observation.

## Next review order

The four initial read candidates have now been source-reviewed. The safe next
step is not to approve a broad `stages.view` row: reconcile the live boundaries
and TOM relationship contract, then return the smallest resource class for
product/security review. Any implementation candidate should begin with a
read-only, named resource and separately characterize the server denial cases.

## Verification

Documentation-only packet. Before review, run:

```text
node scripts/check-kb-links.mjs
node scripts/check-kb-doc-size.mjs
git diff --check
```

Frontend, Edge, database, authorization, credential, hosted-QA, and live
verification are not applicable because no runtime or environment changed.
