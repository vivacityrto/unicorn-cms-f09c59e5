# Multi-package collapse on /client/packages

Tenants with multiple packages currently see every card fully expanded. This change auto-expands the most recently-active package and renders the rest as a one-line, click-to-expand summary row. Strictly additive — no existing tables touched, no behaviour change for single-package tenants beyond a new collapse chevron in the card header.

## Scope

- 1 new component: `CollapsedPackageRow.tsx`
- 1 page modified: `ClientPackagesPage.tsx` (data source, expansion state, render switch)
- 1 small prop added to `PackageCard` (`onCollapse?: () => void`) + chevron-up button in the header
- 1 optional view migration: extend `v_client_package_dashboard` with `current_stage_shortname`
- 1 optional interface field: `current_stage_shortname: string | null` on `ClientPackageDashboardRow`

Not touched: PackageStatusPill, PackageStatTiles, PackageActionRow, PackageStageStepper, PackageWhatsNextPanel, PinnedNoteBanner, EOS, Scorecards.

## Step 0 — Extend `v_client_package_dashboard` (recommended)

Single `CREATE OR REPLACE VIEW` migration. Re-emits the current view definition verbatim plus:

- New CTE `current_stage`:
  ```text
  SELECT DISTINCT ON (si.packageinstance_id)
         si.packageinstance_id,
         COALESCE(NULLIF(TRIM(s.shortname), ''), s.name) AS shortname
  FROM stage_instances si
  JOIN stages s ON s.id = si.stage_id
  WHERE (si.status_id IS NULL OR si.status_id NOT IN (2, 3))
    AND COALESCE(s.is_archived, false) = false
    AND COALESCE(s.is_audit_workspace, false) = false
  ORDER BY si.packageinstance_id, si.stage_sortorder ASC
  ```
- New `LEFT JOIN current_stage cs ON cs.packageinstance_id = pi.id`
- New select column `cs.shortname AS current_stage_shortname`

Fallback if the view extension hits friction: drop the field and have `CollapsedPackageRow` derive the current stage via `useClientPackageStages` (one extra query per collapsed card — acceptable but not preferred).

Update the `ClientPackageDashboardRow` interface in `src/hooks/use-client-package-dashboard.ts` to add `current_stage_shortname: string | null;`.

## Step 1 — `CollapsedPackageRow` component

New file: `src/components/client/package-dashboard/CollapsedPackageRow.tsx`

Props:
```text
{ dashboard: ClientPackageDashboardRow; onExpand: () => void }
```

Layout — single horizontal row (`flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 cursor-pointer transition-colors`), left to right:

1. `ChevronRight` (lucide, size 16, muted)
2. Package name — `dashboard.package_name`, `font-medium`, truncate
3. Tier `<Badge variant="secondary">` — only if `dashboard.package_type` is non-null AND distinct from the displayed name (mirror PackageCard dedup)
4. Summary line in `text-sm text-muted-foreground`, joined by `·`, omitting null/zero parts:
   - `{stages_complete} / {stages_total} stages` — omit when `stages_total === 0`
   - `{formatHours(hours_remaining)} remaining` — omit when `hours_total === 0`. Lift the existing `formatHours` helper out of `PackageStatTiles.tsx` into a small shared module (`src/components/client/package-dashboard/formatters.ts`) and re-import it from both places.
   - `Currently in {current_stage_shortname}` — omit when null
5. `<PackageStatusPill status={dashboard.status_pill} />` pushed right with `ml-auto`

Interaction:
- Click anywhere → `onExpand()`
- `role="button"`, `tabIndex={0}`, `onKeyDown` Enter/Space → `onExpand()`
- `aria-expanded={false}`, `aria-label={`Expand ${dashboard.package_name}`}`

Responsive:
- `< md`: hide the "Currently in {stage}" segment
- `< sm`: also hide the tier pill — leaves name, stages, status pill

## Step 2 — Expansion state in `ClientPackagesPage`

Switch the page's data source from `useClientPackageInstances().fetchClientPackages(...)` (current imperative fetch in a `useEffect`) to the existing `useClientPackageDashboards()` list hook. Every row — collapsed or expanded — reads the same payload. The expanded `PackageCard` keeps calling `useClientPackageDashboard(packageInstanceId)` for its detail; TanStack Query dedupes appropriately and the per-detail fetch is cheap.

State:
```text
const { data: dashboards = [], isLoading } = useClientPackageDashboards();
const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

useEffect(() => {
  if (expandedIds.size === 0 && dashboards.length > 0) {
    const sorted = [...dashboards].sort((a, b) => {
      const aAct = a.last_activity_at ?? '';
      const bAct = b.last_activity_at ?? '';
      const cmp = bAct.localeCompare(aAct);
      return cmp !== 0 ? cmp : a.package_instance_id - b.package_instance_id;
    });
    setExpandedIds(new Set([sorted[0].package_instance_id]));
  }
}, [dashboards.length]);
```

`toggle(id)` adds/removes from the Set. No persistence anywhere.

Tie-break: identical `last_activity_at` → lowest `package_instance_id` wins (stable across reloads). `null` activity sorts last.

## Step 3 — Render switch

```text
{dashboards.map(d => expandedIds.has(d.package_instance_id)
  ? <PackageCard
      key={d.package_instance_id}
      pkg={...}                     // see note below
      onCollapse={() => toggle(d.package_instance_id)}
    />
  : <CollapsedPackageRow
      key={d.package_instance_id}
      dashboard={d}
      onExpand={() => toggle(d.package_instance_id)}
    />
)}
```

`PackageCard` today takes `pkg: ClientPackageInstance`. Two options to feed it from the dashboard list:
- **A (preferred):** Update `PackageCard` to accept `packageInstanceId: number` (plus the optional `onCollapse`) and let it source everything from `useClientPackageDashboard` + `useClientPackageStages` + `useClientPackageWhatsNext` as it already does. The legacy `pkg.package?.name` placeholder fallback is replaced with a one-line skeleton during the brief dashboard-loading window. This drops the `useClientPackageInstances` dependency entirely from this page.
- **B:** Keep the `pkg` prop and synthesise a minimal `ClientPackageInstance`-shaped object from the dashboard row to avoid editing PackageCard's signature.

Plan picks **A** — cleaner and avoids carrying forward the legacy short-code placeholder now that the friendly name comes from the dashboard.

`PackageCard` change: add optional `onCollapse?: () => void`. When provided, render a `ChevronUp` lucide button (size 16, ghost variant) in the header to the right of the status pill. Click → `onCollapse()`. When omitted, button is not rendered (keeps PackageCard reusable in any future single-card context).

Two cards may be expanded simultaneously — expanding one does NOT collapse another. Render order is whatever `useClientPackageDashboards` returns; expansion does not reorder.

## Step 4 — Smoke checks

Run as 3 different impersonations and document in PR:
- 2+ active packages: only most-recent is expanded; others render as rows; clicking a row expands it; clicking chevron-up collapses; multiple expanded cards coexist
- 1 package: expanded; chevron-up still works
- 0 packages: existing empty state renders; no errors
- DevTools: switching expansion of one card doesn't refetch others
- `< md` viewport: collapsed rows truncate cleanly, no horizontal scroll
- Keyboard: Tab to a collapsed row → Enter expands

## What this won't do (out of scope, per prompt)

No collapse-all/expand-all, no persistence of expanded state, no animated transitions, no stage click-through from the collapsed row, no drag-to-reorder, no auto-collapse-others.

## Acceptance

- New file: `CollapsedPackageRow.tsx`
- New shared helper: `formatters.ts` (lifts `formatHours`)
- Edits: `ClientPackagesPage.tsx`, `PackageCard` (signature + chevron), `PackageStatTiles.tsx` (re-import `formatHours`)
- Optional migration: `CREATE OR REPLACE VIEW v_client_package_dashboard` with `current_stage_shortname`
- Optional interface: `current_stage_shortname: string | null` on `ClientPackageDashboardRow`
- No `any`, no new dependencies, build clean
