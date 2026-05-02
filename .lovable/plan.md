# Tenant Packages Dashboard — Week 1 Polish Pass

Surgical visual fixes only. No SQL, no new hooks, no new view columns. The `v_client_package_dashboard` view already exposes everything needed (`start_date`, `end_date`, `package_type`, `pinned_note_severity`).

## Files touched

1. `src/components/client/package-dashboard/PinnedNoteBanner.tsx`
2. `src/components/client/package-dashboard/PackageStatTiles.tsx`
3. `src/components/client/ClientPackagesPage.tsx` (the inline `PackageCard`)

Untouched: `PackagePinnedNote.tsx`, `PackageActionRow.tsx`, `PackageStatusPill.tsx`, the hook, the view, the phase accordion.

## Change 1 — Pinned banner: move inside card, tone down

In `ClientPackagesPage.tsx` `PackageCard`, move the `<PinnedNoteBanner>` block from its current position (top of `CardContent`, above the header) to sit between the package header `<div>` and the stat tiles block.

In `PinnedNoteBanner.tsx`, replace the bright per-severity colour map with a single muted style:

- Container: `bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-500 rounded-md px-3 py-2`
- Pin icon: `text-amber-600`
- Drop the literal "Pinned: " prefix span. Render only the derived message text (Change 2). Keep the click-to-open dialog wiring.
- For severity `urgent`, swap amber tokens for red equivalents (`bg-red-50 dark:bg-red-950/30 border-red-500 text-red-600`). For `info`/`hold`/null, use the amber tokens above.

## Change 2 — Derived client-facing prose

Inside `PinnedNoteBanner.tsx` add:

```ts
function deriveBannerMessage(severity: 'hold' | 'urgent' | 'info' | null): string {
  switch (severity) {
    case 'hold':   return 'Package on hold. All client activity is currently paused. Contact your CSC to resume.';
    case 'urgent': return 'Action required on this package. Open the note for details.';
    case 'info':
    default:       return 'There is a pinned note on this package. Open it for details.';
  }
}
```

The visible strip renders `deriveBannerMessage(severity)` only — no more `text` / `title` in the strip. The dialog (already wired) keeps showing the full sanitised raw `text` plus `title` heading. The button is still clickable when `text || title` is present; if both are null, render nothing (current behaviour preserved).

## Change 3 — Subtitle: dates, never "0 of 0"

In `PackageCard`, remove the `<p>{completedPhases} of {totalPhases} phases complete</p>` line under the title. Replace with:

```tsx
{(dashboard?.start_date || dashboard?.end_date) && (
  <p className="text-xs text-muted-foreground mt-0.5">
    {dashboard.start_date && <>Started {format(new Date(dashboard.start_date), 'd MMM yyyy')}</>}
    {dashboard.start_date && dashboard.end_date && <> · </>}
    {dashboard.end_date && <>Renews {format(new Date(dashboard.end_date), 'd MMM yyyy')}</>}
  </p>
)}
```

Add `import { format } from 'date-fns';` at the top of `ClientPackagesPage.tsx` (date-fns already a project dep). When both dates are null, render nothing — no fallback string.

The bottom-of-card "Overall progress" bar (which uses `completedPhases`/`totalPhases`) stays unchanged. Variables `completedPhases`/`totalPhases` remain in scope for it.

## Change 4 — Hours format + slim progress bars

In `PackageStatTiles.tsx`:

Add helper:

```ts
function formatHours(decimalHours: number): string {
  const total = Math.max(0, decimalHours);
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}
```

Hours tile:
- Main `value` becomes `formatHours(Number(dashboard.hours_used))`.
- Sub-line when `hours_total > 0`: `of ${formatHours(Number(dashboard.hours_total))} (${Math.round(hoursPct * 100)}%)`.
- When `hours_total === 0`: keep `'no allowance set'` (no `/ 0:00`).

Extend `Tile` to accept an optional `bar?: { pct: number; colorClass: string } | null`. Render below the value when present:

```tsx
{bar && (
  <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
    <div className={cn('h-full', bar.colorClass)} style={{ width: `${Math.min(100, Math.max(0, bar.pct * 100))}%` }} />
  </div>
)}
```

Hours bar:
- `pct = hoursPct` (clamped). Colour: `bg-emerald-500` if `<0.75`, `bg-amber-500` if `0.75–<0.95`, `bg-red-500` if `>=0.95`.
- When `hours_total === 0`, render the empty track only (`pct: 0`).

Stages bar:
- `pct = stages_total > 0 ? stages_complete / stages_total : 0`. Colour always `bg-emerald-500`.
- Empty track when `stages_total === 0`.

No bar on Open tasks or Last activity tiles.

## Change 5 — Package type pill next to title

In `PackageCard`, after the `<h3>` package name, render:

```tsx
{dashboard?.package_type && dashboard.package_type !== (pkg.package?.name ?? '') && (
  <Badge variant="secondary" className="text-xs">{dashboard.package_type}</Badge>
)}
```

Wrap the `<h3>` and the optional pill in a `flex items-center gap-2` row so they sit inline. If `package_type` is null or equal to the package name, render nothing — no fabrication.

## Acceptance checks

- Adelaide Aviation M-RR: pinned strip is inside the card under the header, muted amber with left border, reads the derived "on hold" sentence; click opens dialog with full raw note.
- Subtitle shows date(s) or nothing — never "0 of 0".
- Hours tile: `H:MM / H:MM` plus 2px progress bar coloured by threshold.
- Stages tile: `n / m` plus 2px green progress bar.
- `package_type` pill appears next to title only when distinct and non-null.
- No new tables/columns/hooks/routes. Phase accordion, PackagePinnedNote.tsx, EOS, Scorecards untouched.
