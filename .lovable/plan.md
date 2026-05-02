# Active packages vs Package history

Splits `/packages` into two zones so closed packages stop rendering as broken-looking active cards:

- **Your active packages** — full `PackageCard` treatment (with the existing Section A collapse logic for multi-package tenants).
- **Package history** — collapsed-by-default section of compact one-line rows showing tenure only.

Filter rule: `is_complete === true` → history; everything else → active. The dashboard view already exposes `is_complete` (verified in `ClientPackageDashboardRow`).

UI-only. No SQL, no view changes, no hook changes.

## Files

**New:** `src/components/client/package-dashboard/HistoricalPackageRow.tsx` — single compact row.

**New:** `src/components/client/package-dashboard/PackageHistorySection.tsx` — collapsible wrapper with header, count badge, chevron toggle, and tenure footer.

**Modified:** `src/components/client/ClientPackagesPage.tsx` — partition `dashboards` into `activePackages` / `historicalPackages` via `useMemo`; render active list (preserving existing collapse/expand logic untouched) followed by `<PackageHistorySection>` when history exists.

## `HistoricalPackageRow`

`flex items-center gap-3 p-3 rounded-md border bg-card/50`. Left to right:

1. `Archive` (lucide) icon, size 16, `text-muted-foreground`.
2. `dashboard.package_name` — `text-sm font-medium`, truncated.
3. `<Badge variant="secondary">{package_type}</Badge>` — omitted when `package_type === package_name` (same dedup rule used in `PackageCard`).
4. Period text in `text-sm text-muted-foreground`:
   - both dates: `{format(start, 'd MMM yyyy')} → {format(end, 'd MMM yyyy')}`
   - start only: `Started {format(start, 'd MMM yyyy')}`
   - neither: omitted
5. `ml-auto` duration tag in `text-xs text-muted-foreground` — `formatDistanceStrict(end, start)` when both dates present (e.g. "12 months", "2 years"). Omitted otherwise.
6. `<Badge variant="outline">Completed</Badge>` — single muted badge regardless of how the package ended. Does **not** reuse `PackageStatusPill` palette.

Non-interactive in v1. No loading/error states (parent passes resolved data).

## `PackageHistorySection`

```text
<section> (rounded-md border bg-card/30)
  <button>  full-width header, hover:bg-accent/50, aria-expanded
    "Package history"  +  <Badge variant="secondary">{count}</Badge>
    ChevronRight (collapsed) | ChevronDown (expanded)
  </button>
  {isExpanded && (
    list of HistoricalPackageRow (most-recent end_date first)
    footer: "Member since {format(memberSince, 'd MMM yyyy')} · {durationText}"
  )}
</section>
```

- Local `useState<boolean>` for expansion. No persistence.
- Default collapsed, **except** when `defaultExpanded` prop is true (used when there are no active packages).
- `memberSince` = earliest `start_date` across the passed packages. `durationText` computed from months between memberSince and today: `{years} years {months} months` when ≥ 12 months, otherwise `{N} months`. Footer hidden if no historical package has a `start_date`.
- Whole header is keyboard-focusable; Enter/Space toggle (native button behaviour).

## `ClientPackagesPage` changes

Right after `useClientPackageDashboards()`:

```ts
const activePackages = useMemo(
  () => dashboards.filter(d => !d.is_complete),
  [dashboards]
);

const historicalPackages = useMemo(
  () => dashboards
    .filter(d => d.is_complete)
    .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? '')),
  [dashboards]
);
```

Render flow inside the existing wrapper (preserving heading + loading skeleton):

- **Both empty**: existing `No active packages found.` empty card (unchanged).
- **Active present**: render the existing active-list block but iterating over `activePackages` instead of `dashboards`. Existing `expandedIds` auto-expand effect, `toggle`, and `CollapsedPackageRow` / `PackageCard` branching all stay exactly as today — only the source array changes.
- **Historical present**: append `<PackageHistorySection packages={historicalPackages} defaultExpanded={activePackages.length === 0} />`.
- **Active empty + history present**: render a single muted line above the section — `You don't have any active packages right now. Your history with us is below.` — and the section opens expanded by default.

Wrap the whole body in `space-y-8` to give the history block clear separation from the active list (active list keeps its inner `space-y-4`).

## Acceptance / Smoke

- AHMRC Training: 1 active card + collapsed `Package history (3)`. Expanding shows 3 rows newest-first with tenure footer.
- AHMRC active card: byte-identical to today (no changes to `PackageCard` props or render path).
- A history row reads e.g. `Diamond RTO Membership · membership · 30 Nov 2022 → 1 Dec 2023 · 12 months · Completed`. No stages, hours tile, stepper, or action row.
- Tenant with only one active package and no history: page identical to today, no history section rendered.
- Tenant with only history: muted message above + history expanded by default.
- DevTools: zero new queries. Mobile: history rows truncate cleanly.
- No `any`. Build clean.

## Out of scope (per prompt)

Click-to-expand history detail, renewal-chain visualisation, CSV export, "Reactivate" action, history-section search/filter, persisting expand state.
