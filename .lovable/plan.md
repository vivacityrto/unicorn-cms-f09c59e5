# Hours transparency on the package card

Adds two new client-portal panels inside `PackageCard` to turn the abstract `17:30 / 91:00` hours number into a concrete evidence trail of *what was done*.

- **"Where your hours went"** — compact category breakdown directly under the Hours stat tile.
- **"Recent work"** — last-10 timeline of time entries under What's Next.

Strictly additive. No DDL on existing tables. No edits to existing views. No staff names, no `is_billable`, no consultant attribution surfaced.

## Schema (1 migration, 2 new views)

Both views use `WITH (security_invoker = true)` and filter `te.start_at >= pi.start_date` (matches the hours-period rule already shipped). No changes to `time_entries`, `package_instances`, or any existing view.

### `v_client_package_hours_by_type`

Per-package totals grouped by `(work_type, work_sub_type)`. Columns: `package_instance_id`, `tenant_id`, `work_type`, `work_sub_type`, `minutes`, `hours` (rounded), `pct_of_total` (0..1), `rank_in_package` (1 = largest). `work_type` empty/null normalised to `'Other'`. Rows where `duration_minutes` is null/≤0 or `package_instance_id` is null are excluded.

### `v_client_package_hours_recent`

Top 10 most recent entries per package (`ROW_NUMBER() … ORDER BY start_at DESC, id DESC`, `WHERE rank_in_package <= 10`). Columns: `entry_id` (uuid), `package_instance_id`, `tenant_id`, `occurred_at`, `duration_minutes`, `hours`, `work_type`, `work_sub_type`, `notes`, `rank_in_package`. **No `user_id`. No `is_billable`. No staff name join.**

`GRANT SELECT ON … TO authenticated;` on both. View comments document purpose + privacy stance.

Sanity: AHMRC M-DR (`package_instance_id = 15152`) breakdown rows should sum to its `hours_used` from `v_client_package_dashboard` (~17.5h); recent-work rows should match the staff Time Entries panel for that package.

## Hooks (2 new files)

Both follow the established `useClientPackageDashboard` pattern: `useClientTenant()` → explicit `.eq('tenant_id', activeTenantId).eq('package_instance_id', packageInstanceId)`, `enabled` only when both ids present, `staleTime: 60_000`, ordered by `rank_in_package asc`.

- `src/hooks/use-client-package-hours-by-type.ts` → exports `useClientPackageHoursByType` + `ClientPackageHoursByTypeRow`.
- `src/hooks/use-client-package-hours-recent.ts` → exports `useClientPackageHoursRecent` + `ClientPackageHoursRecentRow`.

(Note the prompt's example references `@/hooks/use-client-tenant`; the project's actual import is `@/contexts/ClientTenantContext` — the hooks will use that path, matching every other client-portal hook.)

## Components (2 new files)

### `PackageHoursBreakdown.tsx`

Section heading "Where your hours went" in `text-xs font-semibold uppercase tracking-wide text-muted-foreground` (matches the other panels).

Body: vertical list, `space-y-2`. Each row is `flex flex-col md:flex-row` with three columns:
1. **Label** (~40% on md+, full width stacked on mobile) — `work_type` in `font-medium`, optional `· {work_sub_type}` in muted.
2. **Bar** (`flex-1`) — `h-2 w-full rounded-full bg-muted`, fill width = `pct_of_total * 100%`, fill colour rotates through `[emerald, blue, violet, amber, slate]`. "Other" always slate.
3. **Value** (~80px right-aligned) — `formatHours(hours)` (reuses `./formatters`) + ` · {pct}%` in muted.

Top-N: when `rows.length > 5`, show first 5 verbatim then a single `Other ({n} categories)` row summing the remaining hours and percentages. "Other" always uses slate fill regardless of which categories rolled in.

States: 3 skeleton rows on loading; inline destructive alert on error; **render `null` when `rows.length === 0`** (no placeholder).

### `PackageRecentWork.tsx`

Section heading "Recent work".

Renders first `initiallyShown` entries (default 5). "Show more" ghost button at the bottom expands to all (up to 10). Button hides when expanded.

Each row: `flex items-start gap-3` with three cells:
1. **Date + icon** (~80px) — small lucide icon (mapped from `work_type`: Consultation→`Phone`, Meeting→`Users`, Document Review→`FileText`, Evidence/Validation→`ClipboardCheck`, fallback→`Clock`) in the matching breakdown palette colour, plus `format(occurred_at, 'd MMM')` (year suffix only when not current year).
2. **Body** (`flex-1`) — first line `{work_type}` + optional `· {work_sub_type}`; second line `text-xs text-muted-foreground` truncated `notes` (~80 chars). Notes line omitted entirely when null/empty.
3. **Hours** (~50px right) — `formatHours(hours)`.

States: 5 skeleton rows on loading; inline destructive alert on error; **render `null` when `entries.length === 0`**.

## `PackageCard` wire-up

Inside `src/components/client/ClientPackagesPage.tsx`, in `PackageCard`:

```text
const hoursByType = useClientPackageHoursByType(packageInstanceId);
const hoursRecent = useClientPackageHoursRecent(packageInstanceId);
```

Render order (preserving existing `space-y-6`):

```text
header (icon, title, tier pill, dates, status pill, optional collapse chevron)
PinnedNoteBanner            (existing, conditional)
PackageStatTiles            (existing)
PackageHoursBreakdown       NEW — directly under stat tiles
PackageStageStepper         (existing)
PackageWhatsNextPanel       (existing)
PackageRecentWork           NEW — between What's Next and the action row
PackageActionRow            (existing)
```

Empty/0-entry tenants: both new panels render nothing — the card collapses cleanly without empty space.

## Acceptance

- 1 migration creating both views idempotently with `security_invoker=true` and `GRANT SELECT … TO authenticated`. No DDL on existing tables, no changes to existing views.
- 2 hooks with explicit `tenant_id` filter from `useClientTenant()`.
- 2 components matching the layout, palette, top-5 + Other rollup, and Show-more behaviour above.
- `PackageCard` renders both in the specified order.
- No `any`. No new dependencies (lucide / date-fns / Tailwind only). Build clean.
- Smoke (after deploy): AHMRC M-DR breakdown sums to its dashboard `hours_used`; recent-work matches staff Time Entries; tenants with 0 entries render no empty placeholders; tenants with >5 categories show top 5 + "Other (N categories)"; mobile viewport stacks cleanly.

## Out of scope (per prompt)

Burndown chart, per-category drill-through, staff names, notes search, PDF export, cross-package aggregation, filtering/sorting controls.

## Why this turn needs approval

Migration tool and file-write are gated to default mode this turn. Approving this plan switches to default mode so the migration runs and the four new files (2 hooks + 2 components) plus the `PackageCard` wire-up can be applied in one go.
