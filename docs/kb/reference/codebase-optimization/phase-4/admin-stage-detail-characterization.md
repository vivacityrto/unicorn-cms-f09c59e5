# `AdminStageDetail.tsx` — shared characterization packet

> **Last updated:** 2026-09-14 · **Status:** characterization complete for the current static pass; no extraction or policy change authorized
> **Parent:** [joint ownership matrix](admin-stage-detail-joint-ownership-matrix.md)
> **Source:** `origin/main@58593d35db059fbef80352f1ef43b79f629b708f`
> **File:** `src/pages/AdminStageDetail.tsx` (2,702 lines at this source commit)
> **Owners:** Codebase Optimization coordinates; TOM and RBAC are required reviewers; Client Health is conditional on a proven consumer link
> **Audit entry:** none needed — repository characterization only; no code, schema, permission, credential, or production change

## Purpose and boundary

This packet turns the joint ownership matrix into a source-backed call graph
and characterization plan. It is intentionally not a refactor. The page is a
Super Admin stage-management surface whose state, queries, mutations, audit
events, and child hooks cross TOM and RBAC contracts. A source reference is
evidence that code exists, not proof that its target authorization or tenant
relationship is correct.

The current pass is static-only. It does not run the page, call Supabase,
change a stage, write an audit event, or move any behavior. Client Health is
not assigned ownership: no direct health, forecast, triage, or Ask Viv
consumer was found in the page's current source path.

## Reachability evidence

The route is live at `src/routes/dashboardRoutes.tsx:571-573` under
`ProtectedRoute requireSuperAdmin`; the page also renders its own denied branch
from `useRBAC().isSuperAdmin` (`AdminStageDetail.tsx:76`, with the branch in the
page body). The route lazy-loads the page, so a route reference is a real entry
point rather than an orphan import.

No focused test file currently exercises `AdminStageDetail` or its page-level
workflow. The existing QA strategy has authenticated Super Admin and client
projects, but this packet does not use credentials or execute QA.

## Direct page boundary inventory

The page has 11 direct Supabase call sites at this source commit:

| Lines | Operation | Current behavior | Contract owner / risk |
| --- | --- | --- | --- |
| 275 | `stages.select('*').eq('id', stageIdNum).single()` | Load the selected stage, then map legacy `name`/`shortname`/`videourl` fields to page aliases | TOM source-of-truth; RBAC read boundary |
| 303 | `package_stages.select('package_id')` | Find packages using the selected stage | TOM package relationship |
| 316 | `packages.select('id, name, status')` | Populate package usage display | TOM package relationship |
| 327 | `stages.select('*').eq('is_archived', false)` | Populate replacement-stage choices and map aliases | TOM identity and replacement scope |
| 477 | `stages.update({ version_label })` | Update the dedicated version label | TOM version semantics; RBAC write boundary |
| 487 | `audit_events.insert(...)` | Record version-label changes | RBAC/security audit contract |
| 549 | `audit_events.insert(...)` | Record certified-stage framework narrowing | TOM certification and audit contract |
| 622 | `audit_events.insert(...)` | Record a certification attempt blocked by quality checks | TOM business gate; RBAC/security audit contract |
| 687 | `audit_events.insert(...)` | Record certification with warnings or dependency warnings | TOM business gate; RBAC/security audit contract |
| 1,410 | `cascade_stage_recurring` RPC | Change recurring state and cascade to package stages/active instances | TOM canonical writer; RBAC privileged mutation |
| 2,499 | `audit_events.insert(...)` | Record the typed-confirmation edit of a certified template | TOM certification semantics; RBAC/security audit contract |

The page also delegates behavior to the following live hook/component
boundaries: `usePackageBuilder`, `useStageActiveUsage`,
`useStageCertification`, `useStageDuplication`, `useStageReplacement`,
`useStageAuditLog`, `useStageExportImport`, `useStageTemplateContent`,
`usePackageStageOverrides`, `useStageImpact`, `useSyncStageToPackages`,
`useStageDependencyCheck`, `useStageVersions`, `useStageQualityCheck`, and
`useStageTypeOptions`. These are reachable through the component's hook calls
at `AdminStageDetail.tsx:79-136`; their readers and writers must be included
in the same contract ledger before any hook or handler is moved.

### Fresh source-cutoff recheck — 2026-09-14

The current `origin/main` snapshot was independently re-read after the Phase 4
close. `AdminStageDetail.tsx` remains 2,702 lines and has no source drift from
the characterization described above. Wrapped method chains included, it still
has 11 direct Supabase boundaries: stage/package reads, one stage update, five
audit inserts, and the `cascade_stage_recurring` RPC. A grep that counts only
the line containing `supabase.` undercounts these chains and is not an adequate
call-site oracle.

The only page-local Codebase candidate remains `renderReuseInfoBadge`: it is
called six times, accepts only the parent `usageCount` and `overrideCount`,
returns conditional markup, and owns no hook, query, mutation, authorization,
tenant resolution, or callback. All remaining behavior-bearing boundaries are
still routed to TOM/RBAC/security (and Client Health only if a concrete reader
is later proven). This recheck does not authorize extracting the helper.

## Pure display boundary characterization

The static pass re-checked the page's child boundaries and local rendering
helpers. A component being rendered from this page is not automatically pure:
the boundary is pure only when it owns no Supabase call, hook-driven query,
tenant/authorization resolution, mutation, or state whose movement would alter
the parent workflow.

| Candidate boundary | Reachable evidence | Static classification | Safe next step |
| --- | --- | --- | --- |
| `renderReuseInfoBadge` | `AdminStageDetail.tsx:1015-1029`; called from messages, documents, and usage-related tab content | Pure markup over parent values `usageCount`/`overrideCount`; no query or callback | Candidate for a compiler-proven props-only display extraction; pass values explicitly if ever moved |
| `StageQualityBadge` | `src/components/stage/StageQualityPanel.tsx:199`; exported display helper | Pure status-to-badge mapping; no hooks or I/O | Existing component can remain; any relocation is compiler-provable |
| `StageFrameworkBadges` | `src/components/stage/StageFrameworkSelector.tsx:99`; rendered at `AdminStageDetail.tsx:2664-2669` | Pure framework-to-badge rendering, but its module also contains stateful selector and Supabase writer `updateStageFrameworks` | Treat only the named export as pure; do not move the module or writer with it |
| `VersionSnapshotViewer` | `AdminStageDetail.tsx:2694-2699` → `src/components/stage/VersionSnapshotViewer.tsx:29` | Props-only snapshot rendering in the child; parent still owns version selection state | Already at a suitable display boundary; no page extraction needed |
| `StageQualityPanel` | `AdminStageDetail.tsx:1879-1884` → `src/components/stage/StageQualityPanel.tsx:62` | Props-driven rendering with refresh callback; no direct I/O in the child, but callback retains the parent query boundary | Already separated; do not move `refetchQuality` or quality state |
| `StageVersionHeader` | `AdminStageDetail.tsx:1127-1140` → `src/components/stage/StageVersionHeader.tsx:42` | Not pure: owns dialog state and publish/view callbacks around version workflow | Keep with TOM/RBAC version contract; no Codebase-only extraction |
| `StageImpactPanel` | `AdminStageDetail.tsx:1885-1889` → `src/components/package-builder/StageImpactPanel.tsx:34` | Not pure: owns hooks, query state, confirmation state, and a package-sync mutation | Keep with TOM package-impact writer/rollback review |
| `StageDocumentsPanel`, `DocumentSyncAuditPanel`, `StageMessagesPanelWithProvider`, `StageSimulationDialog` | `AdminStageDetail.tsx:1659-1667`, `2684-2692` | Not pure: delegated queries, mutations, dialogs, or provider state | Keep delegated boundaries in their owning packets; no page-only extraction |

This identifies a small, policy-neutral display surface but does not claim a
behavior-bearing extraction is ready. `renderReuseInfoBadge` is the only
page-local candidate whose inputs and output can be made explicit without
moving state or a callback contract. The already-extracted child displays do
not justify another page refactor by themselves. Any later display PR must
preserve exact props, text, conditional rendering, and disabled/hidden states;
it must not move the route guard, `stageIdNum`, query state, mutation handlers,
audit writes, or tenant/package resolution.

## State and workflow inventory

| Workflow | Reachable state / handler evidence | Current oracle status | Next owner review |
| --- | --- | --- | --- |
| Stage load and settings | `stage`, `settingsDraft`, loading/error state; `fetchStage`, `saveSettings`, `handleUpdateStage` | No page-level test; query and alias behavior uncharacterized | TOM + RBAC |
| Usage and replacement | `packagesUsing`, `allStages`, package selection, `copyContentOnReplace`; `fetchUsageData`, `handleReplaceInPackages` | No page-level test; selected/empty/skipped cases uncharacterized | TOM + RBAC |
| Version label and certified edits | `handleUpdateVersionLabel`, typed `EDIT LIVE STAGE` / `CERTIFIED` confirmations, audit inserts | No page-level test; confirmation, error, and audit ordering uncharacterized | TOM + RBAC/security |
| Frameworks, dependencies, certification | local framework/dependency state, quality/dependency checks, warning/block dialogs | Hook boundaries are reachable; page-level failure ordering uncharacterized | TOM + RBAC |
| Recurring cascade | Switch handler invokes `cascade_stage_recurring` and reports package/instance counts | No page-level test; mutation and partial-result behavior uncharacterized | TOM + RBAC/security |
| Staff/client tasks and stage email | `useStageTemplateContent` state plus add/edit/delete handlers and dialogs | Delegated writes are reachable; source-of-truth and downstream semantics uncharacterized | TOM + RBAC; Client Health only if proven |
| Documents and simulation | Stage document handlers, `StageDocumentsTab`, `StageDocumentsPanel`, simulation dialog | Delegated operations are reachable; export/simulation contract uncharacterized | TOM/RBAC/security |
| Audit history and export/import | `useStageAuditLog`, `useStageExportImport`, filters, export dialog | Read/write and exfiltration boundaries uncharacterized | RBAC/security + TOM |
| Pure display composition | Tabs, badges, selectors, panels, dialogs receiving props | Compiler-proven split may be possible after parent contract mapping | Codebase Optimization |

## Cross-initiative findings

- **RBAC:** `requireSuperAdmin` is the only explicit route/page boundary found
  in this pass. It must not be treated as proof that each delegated hook or
  RPC has the same server-side check. Read access under ADR-030 does not imply
  write, certification, export, or audit authority.
- **TOM:** the page directly translates legacy stage field names into page
  aliases and writes canonical-looking fields through several hooks. The
  characterization must identify which table/field is authoritative for stage
  identity, package membership, recurrence, certification, templates, and
  versions before any normalization or writer consolidation.
- **Client Health:** no current consumer link was found. Do not classify tasks,
  certification, documents, or package-stage events as a health signal from
  naming alone; add Client Health review only if a concrete reader is found.
- **Codebase Optimization:** only a pure props/display split is a candidate
  for a compiler-proven Codebase-only extraction. State, query, mutation,
  tenant resolution, audit, auth, and export seams remain owned by the
  initiative that defines their contract.

## Characterization oracle and stopping rule

No behavior is moved by this packet, so no oracle is claimed as completed.
For a later behavior-bearing extraction, use the Phase 4 two-oracle rule per
seam:

1. Prefer focused tests when a hook/component has a cheap mockable boundary,
   covering loading/empty/populated, success/error, authorization, and side
   effects; or
2. where the monolith makes a proportionate focused harness impractical, make
   a genuinely verbatim move and run an authenticated Playwright workflow
   against the approved `unicorn-qa` fixture, including meaningful success and
   denial/error outcomes. No production fixture is permitted.

The current page has no page-level focused suite, so query/mutation seams are
not yet characterized. The static ownership and pure-display pass is now
complete; the next safe step for any behavior-bearing work is the shared
field/action/call graph ledger plus owner review—not extraction. Stop or route the work when a
seam depends on disputed TOM source-of-truth, RBAC semantics, external email or
export side effects, or a Client Health definition; do not force a Codebase
refactor through those gates.

## Acceptance and remaining gates

This packet is ready for review when every direct call and delegated boundary
has a source reference, contract owner, tenant/package/stage relationship,
error/denial case, and chosen oracle. The following remain unapproved or
blocked:

| Gate | Owner | Unblock condition |
| --- | --- | --- |
| Super Admin versus narrower capability semantics | RBAC + security | Source-backed action rows and negative persona expectations |
| Stage/package identity and legacy aliases | TOM | Canonical field/source-of-truth decision |
| Package replacement/duplication/cascade rollback | TOM + RBAC | Writer inventory, partial-failure behavior, and safe fixture |
| Certification, audit, export, and email side effects | TOM + security | Exact contract, negative cases, and approved QA oracle |
| Any Client Health ownership | Client Health | Concrete downstream reader and metric contract |
| Pure display extraction | Codebase Optimization | Parent contract rows cleared and compiler proof that no behavior moved |

No code extraction, schema/RLS/grant change, credential use, hosted query, or
production action is authorized by this packet.
