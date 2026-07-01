## Scope
Four targeted fixes to `/kpi` only. No other pages, no nav changes, no card layout changes.

## 1. Fix KPI targets (CSC role)

**Create `src/lib/kpi-v2/status.ts`** — shared status helper so thresholds live in one place:

- `pctStatus(pct, on, risk)` — existing generic helper (moved out of the card files).
- `retentionStatus(pct)` — special logic: `100 → "on"`, `≥90 → "risk"`, `<90 → "below"`, `null → "none"`.

**`src/components/kpi-v2/CscKpiCards.tsx`**
- Retention card: `target="Target: 100%"`, drop the "Coming soon" footer/placeholder mode, feed retention value once wired; until backing data exists keep `value=null`/`primary="—"` but `status="none"` with the 100% target label (no threshold logic runs on null). Use `retentionStatus` when a value is present.
- Tasks card: change to `target="Target: 90%"` and `status={pctStatus(tasksPct, 90, 80)}` (On ≥90, At Risk 80–89, Below <80).
- Communication card: unchanged (still 80%).

**`src/components/kpi-v2/AssistantKpiCards.tsx`** — untouched (assistant Tasks target stays 80% per current spec; user only called out CSC target changes).

## 2. Header title "Page" → "KPI Dashboard"

The top nav-bar title comes from `routeTitles` in `src/components/layout/TopBar.tsx` (falls back to `"Page"`). Add one entry:

```ts
"/kpi": "KPI Dashboard",
```

This matches the pattern used by `/tasks`, `/dashboard`, etc. Keep the existing `document.title` effect in `KpiPage` as-is.

## 3. Period selector: Tabs → Dropdown with 4 options

Replace `Weekly / Monthly / Quarterly` tabs with a shadcn `Select` (dropdown) offering:

- `this_month` — This Month (default)
- `last_month` — Last Month
- `this_quarter` — This Quarter
- `last_quarter` — Last Quarter

**`src/components/kpi-v2/types.ts`** — replace `KpiV2Period` union with the four keys above and update `KPI_V2_PERIOD_LABEL`. Add a helper:

```ts
getPeriodRange(period): { startIso: string; endIso: string }
```

Uses local date math with `date-fns` (already in project): `startOfMonth/endOfMonth/subMonths` and `startOfQuarter/endOfQuarter/subQuarters`, formatted as `yyyy-MM-dd`.

**`CscKpiCards.tsx` and `AssistantKpiCards.tsx`** — replace the `PERIOD_DAYS` "N days ago" logic with `getPeriodRange(period)` and query with `.gte("period_start", startIso).lte("period_start", endIso)`. Both cards re-scope on period change (already reactive via `useEffect` dep on `period`).

**`KpiPage.tsx`** — swap `<Tabs>` for `<Select value={period} onValueChange=…>` with `SelectTrigger` / `SelectContent` / `SelectItem`, default state `"this_month"`. Keep the same row placement (left of Team KPI toggle + Export).

## 4. Page header treatment

Keep the existing purple→fuchsia hero (it belongs to the page body). Add a compact header row **between the top nav bar and the hero** to match Dashboard/Tasks rhythm:

- Left column:
  - Line 1: role subtitle in Binate — one of `"Client Success Champion (CSC)"`, `"Administration Assistant"`, or `"Developer"` derived from `profile.kpi_role`.
  - Line 2: `"Welcome back, {first_name}!"` from `profile.first_name` (fallback to email prefix if missing).
- Right column (same row, `justify-between`):
  - `"Last updated: Just now"` in muted text with a small green dot (`h-2 w-2 rounded-full bg-emerald-500 animate-pulse`).

Uses existing tokens/typography — no new CSS. TopBar title change (fix #2) handles the "KPI Dashboard" label in the app chrome; the in-page hero H1 stays as the visual anchor.

## Files touched
- `src/components/layout/TopBar.tsx` — add `/kpi` route title.
- `src/components/kpi-v2/types.ts` — new period keys + `getPeriodRange` helper.
- `src/lib/kpi-v2/status.ts` — new file with `pctStatus` + `retentionStatus`.
- `src/components/kpi-v2/CscKpiCards.tsx` — target updates, use new helpers + period range.
- `src/components/kpi-v2/AssistantKpiCards.tsx` — use new period range (targets unchanged).
- `src/pages/KpiPage.tsx` — dropdown selector, subtitle/welcome/last-updated header row.

## Out of scope
Retention data source (still no view). Assistant Tasks target. Nav, other pages, other cards.
