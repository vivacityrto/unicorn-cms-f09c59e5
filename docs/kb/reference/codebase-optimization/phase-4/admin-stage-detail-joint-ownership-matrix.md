# `AdminStageDetail.tsx` — joint ownership and characterization matrix

> **Last updated:** 2026-09-12 · **Status:** planning matrix; no extraction or policy decision authorized
> **Parent:** [Phase 4 P6 exit re-audit joint recommendation](p6-exit-reaudit-joint-recommendation.md)
> **File:** `src/pages/AdminStageDetail.tsx` (about 2,703 lines at the 2026-09-11 re-audit)
> **Owners:** Codebase Optimization coordinates; TOM and RBAC are required reviewers; Client Health is conditional on a proven consumer link
> **Audit entry:** none needed — repository characterization only; no code, schema, permission, or production change

## Why this matrix exists

`AdminStageDetail.tsx` was the largest frontend file in the Phase 4 exit
re-audit and the one remaining candidate with no existing initiative owner.
It combines stage identity/settings, package relationships, template content,
certification, audit history, export/import, and several mutation-heavy hooks.
The file must be characterized once across the four initiatives before anyone
extracts state, queries, or mutations. A Codebase-Optimization refactor must
not silently choose TOM's source of truth, RBAC's capability boundary, or
Client Health's metric semantics.

This matrix is a routing and evidence packet. It does not open a Phase 4 slice
9, authorize a code extraction, redefine package/stage behavior, or change
staff/client access.

## Current reachability and boundary evidence

| Boundary | Current evidence | Initial disposition |
| --- | --- | --- |
| Route | `/admin/stages/:stage_id` lazy-loads this page under `ProtectedRoute requireSuperAdmin`; `/admin/stages` is the management entry point | RBAC-owned access boundary; preserve and characterize denial behavior |
| Stage identity | `stage_id` route param is parsed to a numeric `stageIdNum`; `stages` is read directly for the selected row and for replacement choices | TOM reviews stage/package identity and legacy field normalization; no inferred canonical rename |
| Direct page writes | `stages` update, `audit_events` inserts, and `cascade_stage_recurring` RPC are called directly by the page | Security/RBAC and TOM review required before moving any mutation boundary |
| Delegated writes/reads | `usePackageBuilder`, template-content, certification, duplication, replacement, dependency, framework, version, quality, export/import, and audit hooks own additional calls | One call graph must inventory the hooks before any seam is labelled safe |
| Client Health link | No direct health/forecast/triage/Ask Viv consumer was found for this page in the current source/docs scan | Client Health remains conditional; only claim ownership if a stage/package write is proven to feed a health source |
| UI composition | Tabs, dialogs, panels, and selectors are already rendered as child components in several areas | Pure display-only extraction may remain Codebase-owned after the contract rows below are cleared |

## Joint ownership matrix

Each row needs a source/caller inventory, current-behavior oracle, and named
reviewer before it can become an implementation packet. “Owner” means the
initiative that defines the behavior contract, not necessarily the person who
will edit the TSX file.

| Surface / seam | Current responsibility | Contract risk | Primary owner | Required reviewers | Earliest safe next step |
| --- | --- | --- | --- | --- | --- |
| Route and page access | Super Admin route guard plus in-page `isSuperAdmin` context | Privileged stage/package administration could become reachable through a child route or extracted handler | RBAC | Security, Codebase | Characterize allowed/denied personas and indirect navigation before moving state |
| Stage settings and identity normalization | Read `stages`; edit title, description, short name, video URL, AI hint, type, and version label | Legacy `name`/`shortname`/`videourl` mapping, current stage identity, certified/live-stage confirmation, audit semantics | TOM | RBAC, Codebase | Build a field/source-of-truth and writer matrix; no rename or contract cleanup in extraction |
| Package usage and replacement | Read `package_stages`, `packages`, all active stages; replace a stage in selected packages | Package membership, copy-content behavior, active-client impact, rollback and partial-skip semantics | TOM | RBAC, Codebase | Inventory hook/RPC writers and package-instance consumers; characterize selected/empty/skipped cases |
| Stage duplication | Duplicate stage shell or package-context content and navigate | Cross-package copying, identity generation, tenant/package scope, duplicate side effects | TOM | RBAC, Codebase | Trace `useStageDuplication` and all target writes; keep as one coupled workflow until evidence exists |
| Staff task template | Add/edit/delete/reorder staff tasks and key-event flags | Task ownership, status/mandatory semantics, package inheritance, downstream activity/health interpretation | TOM | RBAC, Client Health if consumed, Codebase | Source-map task fields and downstream readers; do not classify a task as a health signal from name alone |
| Client task template | Add/edit/delete client tasks and mandatory/due-date behavior | Client-visible commitment semantics, tenant scope, status domain, health/attention consumption | TOM | RBAC, Client Health, Codebase | Reconcile with Client Health commitment definitions and RBAC client/staff capability rows |
| Stage email template | Add/edit/remove trigger, recipient, and template relationships | External side effects, recipient scope, tenant/package inheritance, outbound-email authorization | TOM | RBAC, Security, Codebase | Characterize read-only form state first; mutation extraction requires a separate safe fixture and email suppression gate |
| Stage documents/content | Add/update/remove documents and bulk document links through child panels/hooks | Document visibility, package/stage inheritance, generation/delivery side effects, tenant scope | Codebase / TOM shared | RBAC, Client Health only if source link proven | Inventory delegated hook calls and document consumers; pure panel rendering may be split after contract mapping |
| Certification and quality checks | Quality check, certify/un-certify, warning/block dialogs, dependency certification checks | Certification is a business gate; warnings, audit events, and dependency checks must remain ordered | TOM | RBAC, Codebase | Characterize pass/warn/fail and dependency outcomes before moving the command adapter |
| Frameworks, standards, dependencies | Edit stage frameworks, standards, and dependency keys; warn on narrowing/certification | Scope narrowing, standards provenance, dependency graph integrity, certified-stage safety | TOM | RBAC, Codebase | Map writers, validators, and reverse readers; no normalization or graph rewrite in a UI refactor |
| Audit history and audit writes | Reads filtered stage audit log; writes version/framework/certification audit events | Audit event identity/details, actor attribution, tamper resistance, event completeness | RBAC / Security | TOM, Codebase | Establish exact event contract and negative/error cases before moving any insert |
| Export/import and simulation | Export/import commands and stage simulation dialog | Data exfiltration, package/stage scope, simulation versus mutation, staff capability | RBAC / Security | TOM, Codebase | Inventory command targets and output handling; treat as high-risk until explicit evidence clears it |
| Version viewing/publishing | Version list, snapshot viewer, publish/edit flows and certified edit checks | Immutable/history semantics, publication authority, rollback/version labels | TOM | RBAC, Security, Codebase | Trace `useStageVersions` and publish writer; keep coupled until version oracle exists |
| Pure display composition | Tabs, badges, forms, selectors, panels, and dialogs with no moved state/query/mutation | Low if props remain exact, but can hide authorization or disabled-state changes | Codebase Optimization | Contract owner for the parent seam | Prefer a compiler-proven/pure-props split only after the owning row is mapped |

## Cross-initiative questions that must be answered once

### RBAC v6

- Is `requireSuperAdmin` the complete boundary for every current action, or do
  hooks/RPCs impose narrower capability checks that must remain visible?
- Which operations are read-only versus privileged writes: stage settings,
  package replacement, duplication, certification, audit export, document
  linking, and outbound email configuration?
- What are the denial expectations for non-SuperAdmin staff, disabled staff,
  client Admin/User, and service principals?
- Do any direct or delegated calls rely on broad internal-staff read access
  from ADR-030, and do not confuse that read decision with write authority?

### Tenant Operating Model

- What is canonical for stage identity, package membership, package-instance
  inheritance, lifecycle, and current versus historical content?
- When a stage is reused, duplicated, replaced, certified, or narrowed, which
  rows are authoritative and which are compatibility/history projections?
- Does a stage/package write affect tenant operating context, current CSC
  ownership, or client-visible commitments, and what rollback evidence is
  required?
- Are legacy field aliases (`name`/`title`, `shortname`/`short_name`,
  `videourl`/`video_url`) display adapters only, or part of a broader source
  migration that belongs in TOM?

### Client Health Activity Analytics

- Is any stage task, certification, package-stage relation, or document event
  actually consumed by an H0/H1 metric, or is this page only an upstream
  operational writer with no current health consumer?
- If a source link exists, what actor class, event semantics, freshness,
  tenant/subject grain, and unknown behavior apply?
- Does a change preserve the separation between consultant attention,
  client health, client activity, and intervention effectiveness?
- Consultant operational input remains outstanding; no stage behavior should
  be promoted into a health definition from source code alone.

## Shared characterization plan

The next evidence packet, if authorized, should be one shared pass rather than
three initiative-specific rediscoveries:

1. freeze `origin/main` and inventory route, props, hook calls, direct
   Supabase calls, RPCs, Edge calls, writers, readers, and audit events;
2. create a field/action ledger with current source, target row, actor,
   tenant/package/stage relationship, error behavior, and owner;
3. use the RBAC/TOM/Client Health questions above to mark each row
   `policy-neutral`, `needs_RBAC`, `needs_TOM`, `needs_Client_Health`, or
   `cross-initiative`; never infer “safe” from a component boundary alone;
4. characterize behavior-bearing seams with focused tests where a cheap mockable
   hook/component boundary exists; otherwise use a verbatim move plus a real
   authenticated QA Playwright workflow under the Phase 4 two-oracle rule;
5. reserve pure display-only splits for compiler proof and existing route tests;
   they must not move state, queries, mutations, auth, or tenant resolution; and
6. produce one owner-approved vertical slice with rollback, negative cases,
   and relevant documentation before editing the page.

## Stopping and routing rules

Do not open a Phase 4 slice 9 merely because this file is large. Stop and route
the work to TOM/RBAC/Client Health if a seam touches their unresolved contract,
if the action has external or destructive side effects, if the current source
of truth is disputed, or if the required oracle would require a broad new
mocking harness. A narrow Codebase-Optimization PR remains possible only for a
pure, policy-neutral display seam cleared by this matrix.

The matrix is complete for planning when every behavior-bearing row has a
named owner, source/caller evidence, oracle choice, and blocker/exit condition.
That completion does not authorize code, schema, RLS, grants, Realtime,
deployment, migration, or production changes.
