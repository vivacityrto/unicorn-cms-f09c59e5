# Super Admin / Executive / Academy Builder Audit — 2026-07-29

> **Reflects commit:** `<codebase>@5756e75a` (2026-07-29, branch `hotfix/manage-documents-autofill`).
> **Reconsider by:** 2026-09-29 — re-verify before acting on any finding older than ~2 months.
> **Confidence:** high — every finding below was reproduced live via Playwright in Carl's real Super Admin session against `localhost:8080` (Vite dev server, prod Supabase backend), cross-checked against source where noted. Strict read-only protocol per `super_admin_exploration_protocol` — no writes, no toggles, no submits.
>
> **Methodology:** Full pass over the `requireSuperAdmin` route set + `/executive/*` + Academy Builder (per [`route-inventory-by-role.md`](route-inventory-by-role.md) section 2) — 47 routes. For each: navigate, capture accessibility snapshot, check console errors, spot-check layout/chips/responsive. Supplements — does not replace — [`super-admin-exploration-2026-05-21.md`](super-admin-exploration-2026-05-21.md); several 05-21 findings are re-verified below as still-open, fixed, or worse.

---

## Carried over from 2026-05-21, re-verified

| Finding | Status today |
|---|---|
| `/audit-logs` 404 (sidebar links to a dead route) | **Still broken.** Confirmed live: bare `NotFound` page, no layout. |
| Topbar `<h1>` shows "Page" instead of the route name on several `/superadmin/*` + `/executive` routes | **Partially fixed, partially not.** `/superadmin/academy/tenant-access` and `/superadmin/academy/certificates` now show correct titles. `/executive`, `/executive/*` sub-pages, `/superadmin/academy/enrollments`, `/superadmin/workforce-pdp`, `/admin/operations`, `/admin/compliance-packs`, `/admin/risk-radar` still show "Page". PR #61 ("add 7 missing routeTitles entries") did not cover all of these. |
| Legacy "Parent"/"Child" role terminology on `/admin/tenant-users` | **Still present** — Role column still shows "Parent"/"Child" pills; `/client/users` uses `relationship_role` labels. Two vocabularies for the same data, unresolved. |
| 8 console errors on `/executive` | **Still present, root cause now identified** (see below — 403s on `v_executive_*` views). |

---

## New findings this pass

### 1. Systemic RLS/grant gap on strategic analytics views (highest severity)

Confirmed 403 Forbidden on **6 database views**, for the Super Admin role itself:
- `v_executive_anomalies_30d`, `v_executive_consultant_distribution`, `v_executive_client_health`, `v_exec_alignment_signals_7d` (all fired twice per `/executive` load)
- `v_strategic_capacity_pressure`, `v_strategic_portfolio_risk` (fired twice per `/admin/strategic-command` load)

All 6 share the naming pattern `v_executive_*` / `v_strategic_*`. This is very likely one missing `GRANT`/RLS policy class, not 6 separate bugs — worth checking whether these views were created without the standard Super-Admin-bypass policy other views get. Effect: "Where We Are Exposed", "Owner Pressure", most of `/admin/strategic-command`, and related widgets silently render empty/zero states instead of real data, with no error shown to the user (React Query swallows the 403 into an empty result).

### 2. `/admin/operations`, `/internal/ask-viv/flags`, `/admin/addin-diagnostics`, `/admin/diagnostics/zero-progress-packages` render with NO app shell

Confirmed via accessibility-tree inspection (no `complementary`/sidebar, no `banner`/topbar, no `contentinfo`/footer — just the raw page `<main>` content) on all 4 routes. A Super Admin landing on any of these has zero in-app navigation — only the browser back button. Likely these 4 pages were never wrapped in `DashboardLayout` when built. By contrast, `/admin/risk-radar`, `/admin/clickup-import`, `/admin/template-gap-analysis`, `/admin/workflow-optimisation`, `/admin/strategic-orchestration`, `/admin/bulk-invite`, `/admin/regulator-watch`, `/superadmin/workforce-pdp` — all equally orphaned (see #3) — render the full shell correctly, so this is specific to these 4, not a property of being unlinked.

### 3. 14 SuperAdmin routes have zero UI entry point anywhere in the app

Verified via `grep -rn "<route>" src/` — zero matches outside `App.tsx` itself (i.e. no `<Link>`, no `navigate()` call, anywhere):

`/admin/operations`, `/admin/compliance-packs`, `/admin/diagnostics/zero-progress-packages`, `/admin/addin-diagnostics`, `/admin/clickup-import`, `/internal/ask-viv/flags`, `/admin/regulator-watch` (+ its `:eventId` detail, though the detail page IS reachable once you're on the list — it's the list entry point itself with zero inbound links), `/admin/risk-radar`, `/admin/template-gap-analysis`, `/admin/strategic-command`, `/admin/workflow-optimisation`, `/admin/strategic-orchestration`, `/superadmin/workforce-pdp`, `/admin/bulk-invite`.

Notably, the Executive Dashboard renders live summary **widgets** for several of these exact features (Strategic Orchestration, Workflow Efficiency, Regulator Activity/Updates, Template Health, Systemic Risk Signals, Commercial Risk, Risk Forecast, Playbook Activations, Audit Prep, Evidence Readiness — see `src/components/executive/`) but **only 5 of ~15 widgets have a working click-through** (`FinancialControlPanel`, `DiamondClientPanel`, `DecisionQueuePanel` → `/executive/*`; `KnowledgeGraphWidget` → `/admin/knowledge-explorer`; `RiskCommandWidget` → `/admin/risk-command`). The rest render real data with no `onClick`/`navigate()` at all — a user sees "0 active priorities" on the Strategic Orchestration card with no way to drill in, even though `/admin/strategic-orchestration` exists, works, and is reachable only by typing the URL.

`/admin/qa/responsive` and `/admin/qa/smoke` are also unlinked but are intentional dev-only QA harnesses per `docs/ui-definition-of-done.md` — not counted as bugs.

### 4. `/admin/compliance-packs` — broken query, PostgREST can't find the FK

```
400: Could not find a relationship between 'compliance_pack_exports' and 'tenants' in the schema cache
```
The query aliases a join as `tenant:tenants(id,name)` but no matching FK relationship exists in the schema cache. Page degrades gracefully (shows "No exports yet" instead of crashing) but is non-functional. Compounds with #3 (also has zero inbound links).

### 5. `/admin/user-audit` — the audit table's own drill-down is broken

RPC `get_user_audit` returns **404** (function not found), called twice. The 7 summary stat cards still populate from a different, working query (960 issues detected: 0 Orphan Auth, 6 Orphan Profiles, 7 Email Mismatches, 0 Duplicate Emails, 64 No Membership, 726 Invalid Members, 157 Invite Issues), but the "User Table" tab — the only way to see *which* users are flagged and act on them — shows "0 OK, 0 with issues / No users match the current filters" regardless of filter. This is the single most-referenced diagnostic tool in the prior audit (05-21) and it's now half-broken: you can see the problem exists but not what it is.

### 6. `Badge` component is missing `React.forwardRef` — breaks Tooltip-wrapped badges app-wide

`src/components/ui/badge.tsx:40` defines `Badge` as a plain function component. Anywhere a `Badge` is used as a Radix `<TooltipTrigger asChild>` child, React throws `Warning: Function components cannot be given refs`. Confirmed reproducing on `/admin/manage-packages` (`PackageReadinessIndicator.tsx:89`) and `/manage-invites`. One-line fix (`React.forwardRef`) likely silences this across every future/existing tooltip-on-badge usage in the app — worth a broader grep before fixing to count real occurrences.

### 7. Invalid HTML: `Skeleton` (a `<div>`) rendered inside a `<p>`

Confirmed on exactly 2 files (`grep`-verified, not widespread): `src/pages/admin/AddinDiagnostics.tsx` and `src/pages/AdminStageAnalytics.tsx`. Both render a loading `<Skeleton />` directly inside a `<p>` tag — invalid nesting, React `validateDOMNesting` warning. Small, contained fix.

### 8. `/admin/email-templates` is routed twice

`App.tsx` lines ~497 and ~707 both register `path="/admin/email-templates"` → `ManageEmailTemplatesWrapper`, identical guard. Harmless (React Router just uses the first match) but dead duplicate code — likely a merge/copy-paste artifact.

### 9. Chip/pill/badge shape and color inconsistency (the specific ask)

The app has a documented Badge variant system (`src/components/ui/badge.tsx` — `default`/`secondary`/`destructive`/`outline`/`warning`/`info`/`draft`, all sharing one `rounded-full` pill shape), but several surfaces don't use it:

- **`/superadmin/academy/enrollments`**: raw enum values rendered unhumanized as tags (`COMPLIANCE_SYSTEM` instead of "Compliance System"), in a flatter/less-rounded tag style than the `Active`/`Self Enrol` pills sitting right next to them in the same row. At least 4 distinct chip visual styles coexist on this one page (filled status pill, flat enum tag, tab+counter combo, outlined filter toggle).
- **`/executive/client-commitments`**: "Status" (PENDING) and "Impact" (MEDIUM) columns render with the *identical* pill style/color — no visual distinction between a workflow-status field and a severity field.
- **`/superadmin/academy/certificates`**: tab filters have no count badges; the visually-identical tab pattern on `/superadmin/academy/enrollments` does (`All 529`, `Active 513`, etc.) — same pattern, inconsistent application.
- **`/superadmin/academy/builder`**: course cards use CSS grid with un-clamped titles — a 2-line title (e.g. "1-Day Workshops 2026 — TAS and Outcome Standards") makes that card taller than its row-mates, producing uneven card heights within a row. Same bug class already fixed for Flight Plan rock cards (PR #64) but not here.
- **`/administration/role-permissions`**: by contrast, this page's chip system (Full / Unset / None, each rounded pill + icon + dropdown chevron) is comparatively clean and consistent — a good reference for what the rest of the app should converge toward.

### 10. Executive Dashboard data-integrity oddities (worth a data check, not necessarily a UI bug)

- **Team Capacity Overview**: Samantha Holtham shows 1435 Overdue but status pill still reads "stable" — same as everyone else at 0 overdue. The status pill does not appear to react to the overdue count at all.
- **Unicorn Integrity card**: 28,601 "Audit Events (7d)" — worth a sanity check on whether this is a legitimate volume or a double-count.
- **`/superadmin/workforce-pdp`**: "% Current" (20%) + "% At risk" (0%) + "% Overdue" (0%) don't sum to 100% — implies an unshown 4th bucket or a calculation gap.

### 11. Mobile responsive

- **`DashboardLayout.tsx:166`**: `const [sidebarOpen, setSidebarOpen] = useState(true)` is not viewport-aware. On a fresh mobile-width load, the nav drawer renders **open, overlaying page content with a dark scrim**, rather than closed — the user must dismiss it before seeing anything. Desktop and mobile share one boolean with no initial-viewport check.
- **`/executive` "Team Capacity Overview" table** at 390px width: only the Consultant name column is visible; Capacity %/High Risk/Overdue/Status columns are present in the DOM (confirmed via accessibility tree) but not reachable — no `overflow-x-auto` wrapper, so they're simply clipped. Same bug class already fixed for 4+ other tables (PRs #63, #67, #68, #69, #70, #72) but missed on this one.
- **Sidebar internal scroll**: when more than ~4 of the 7 nav sections are expanded at once, content overflows the sidebar's fixed height. `DashboardLayout.tsx` (`checkScrollable`, ~line 220) only shows a "scroll down" bounce indicator when not at the bottom — there's no equivalent "scroll up" affordance, so top sections can silently scroll out of view with no visual cue.

### 12. Clean pages (no console errors, layout intact, standard chip usage)

`/executive/financial-controls`, `/executive/client-commitments`, `/executive/decision-queue`, `/superadmin/academy/tenant-access`, `/superadmin/academy/certificates`, `/superadmin/academy/package-course-rules`, `/admin/stages`, `/admin/stage-builder`, `/admin/eos-processes`, `/admin/knowledge`, `/admin/assistant`, `/admin/addin-settings`, `/admin/clickup-mapping`, `/administration/role-permissions`, `/admin/lifecycle-checklists`, `/admin/merge-field-tags`, `/admin/governance-documents`, `/admin/sharepoint-sites`, `/admin/settings/reporting-obligations`, `/admin/team-users`, `/admin/staff-engagements`, `/admin/cohort-sender`, `/admin/email-templates`, `/admin/risk-radar`, `/admin/template-gap-analysis`, `/admin/workflow-optimisation`, `/admin/strategic-orchestration`, `/admin/bulk-invite`, `/admin/regulator-watch`, `/admin/clickup-import`.

---

## Not yet covered

- Dialog/modal button audits within these pages (opened none this pass beyond what's visible inline — next pass should open each "New X" / "Edit" dialog read-only and check button hierarchy/labels).
- `/admin/team-users/runs/:runId(+onboarding)`, `/admin/cohort-sender/jobs/:jobId`, `/admin/stages/:stage_id`, `/admin/package-builder/:id`, `/superadmin/academy/builder/:courseId` — detail routes requiring a real ID, not smoke-tested this pass.
- Client Portal, Internal Staff (non-superadmin), and Academy learner-facing sections — see [`route-inventory-by-role.md`](route-inventory-by-role.md) for the full route map; these are queued for the next pass(es).

## Cross-references

- [`route-inventory-by-role.md`](route-inventory-by-role.md) — full 216-route map by role, built alongside this audit
- [`super-admin-exploration-2026-05-21.md`](super-admin-exploration-2026-05-21.md) — prior pass, partially superseded above
- [`../pinned/kb-hygiene.md`](../pinned/kb-hygiene.md) — refresh policy
