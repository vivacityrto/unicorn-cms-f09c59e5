## Redesign: `BulkDocumentJobProgress.tsx`

Single-file, frontend-only. No new Supabase queries — extend the existing `items` select with `leased_at` (already fetching `lease_expires_at`; one more column on the same round-trip so we can identify the oldest active lease).

### Changes

**1. Item type + select**
- Add `leased_at: string | null` to the `Item` type.
- Append `leased_at` to the items `.select(...)` string.

**2. Drop auto-open effect**
- Delete the `useEffect` that seeds `openTenants` from failed/leased/pending items on mount. `openTenants[tid] ?? false` already defaults to collapsed; manual toggle behaviour is preserved.

**3. Overall progress bar** (new, between the header row and the summary tiles)
- Compute segment widths from job counters (not items, so totals stay authoritative even while items page-loads):
  - `generatedPct = generated_count / total_items`
  - `skippedPct = skipped_count / total_items`
  - `failedPct = failed_count / total_items`
  - `pendingPct = 1 - (above sum)` (pending + leased)
- Segmented bar ~10–12px tall, full width, rounded, emerald/slate/red/blue segments. Percent label to the right: `Math.round((generated+skipped+failed)/total * 100)%` and `N/total` next to it. Guards against `total_items === 0` (renders empty rail, 0%).

**4. "Currently generating" banner**
- Compute client-side from already-fetched `items`:
  ```ts
  const leased = items
    .filter(i => i.state === "leased" && i.leased_at)
    .sort((a, b) => new Date(a.leased_at!).getTime() - new Date(b.leased_at!).getTime());
  const active = leased[0];
  ```
- Visible only when `job.status === "running" && active`. Resolves tenant name via existing `tenantNames`, doc title via existing `documentTitles`.
- Renders a pulsing dot (bg-blue-500 with `animate-pulse`) + `Loader2` spin icon + `Generating: {tenantName} — {docTitle}`. Secondary line `+ N more in this batch` when `leased.length > 1`.
- Uses `bg-blue-50 border-blue-200` for the banner — same semantic blue as pending pill.

**5. Per-tenant mini progress bar** (inside each `CollapsibleTrigger`)
- Replace the current right-side text cluster (`{generated} generated`, `{skipped} skipped`, `{failed} failed`, `{pending} pending`) with:
  - A small `{completed}/{total}` label (where `completed = generated + skipped + failed`).
  - A ~96px × 6px segmented rounded bar (emerald / red / slate / blue), same tone mapping as the overall bar.
  - Native `title` attribute on the bar wrapper with the full breakdown text as tooltip: `"generated: X · skipped: Y · failed: Z · pending: W"` — cheap, no shadcn Tooltip dependency needed.

**6. `SummaryTile` polish** (extend, don't replace)
- Add optional props: `icon?: LucideIcon`, `percent?: number` (0–100, omitted for Total/Duration).
- Tone → tinted background mapping:
  - `emerald` → `bg-emerald-50 border-emerald-200 text-emerald-700`
  - `red` → `bg-red-50 border-red-200 text-red-700`
  - `slate` → `bg-slate-50 border-slate-200 text-slate-700`
  - no tone → keep current plain look (Total / Duration tiles).
- Layout: small icon in the top-right, label top-left (unchanged), big number as today, `{percent}% of total` subtext under the number when `percent` is provided.
- Icons at call site:
  - Total: none (or `List` for parity — plan omits to match "no icon on Total").
  - Generated: `CheckCircle2` (emerald).
  - Skipped: `SkipForward` (slate).
  - Failed: `XCircle` (red).
  - Duration: `Clock`.
- `percent` passed only for Generated / Skipped / Failed, computed as `Math.round(count / total_items * 100)` with a `total_items > 0` guard.

### Zero/terminal safety
- `total_items === 0`: overall bar renders as empty grey rail with `0%` label; per-tenant bars render empty rail; percent subtexts on tiles suppressed (guarded).
- Terminal states (`completed / cancelled / failed`): overall bar shows final proportions; banner is hidden (guarded on `status === 'running'` AND `active` exists).
- Between batches (running, nothing leased): banner hidden.

### Files
- `src/pages/BulkDocumentJobProgress.tsx` (only file touched).

### Non-goals
- No changes to cancel/retry logic, polling, item table inside expanded groups, or `ItemResult`/pill helpers.
- No new colors or design tokens — reuses the existing emerald/red/slate/blue semantic mapping.
- No new queries.
