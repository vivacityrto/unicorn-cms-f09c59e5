# Display polish: Hours surfaces and burndown chart

Three additive UI-only fixes, shipped together. No SQL, no view, no hook changes.

## 1. Add two display utilities to `formatters.ts`

Append to `src/components/client/package-dashboard/formatters.ts`:

- `formatWorkType(value)` — converts snake_case enums (`compliance_health_check`) to Title Case (`Compliance Health Check`). Returns `''` for null/empty so callers' truthiness checks keep working.
- `cleanWorkNote(note)` — returns trimmed note, or `null` if empty/whitespace, or `null` if it starts with `"Imported from meeting:"` (case-insensitive). Hides internal source-tracking metadata from clients.

## 2. `PackageHoursBreakdown.tsx` — Title Case category labels

Wrap the rendered `row.work_type` and `row.work_sub_type` in `formatWorkType(...)`. The `__other__` rollup row already uses the literal `Other (N categories)` string and is left untouched (it won't pass through the formatter since its label is already display-ready).

## 3. `PackageRecentWork.tsx` — Title Case + clean notes

- Wrap `e.work_type` and `e.work_sub_type` in `formatWorkType(...)` for display only.
- Replace `e.notes` rendering with `cleanWorkNote(e.notes)`; when null, omit the second line. Keep the existing `truncate(..., 80)` on the cleaned value.
- Icon mapping (`iconFor`) already uses `.toLowerCase().includes('consult' | 'meeting' | 'document' | 'evidence' | 'validation')` against the raw value — works correctly with snake_case inputs. **No icon mapping changes needed.** (The prompt's worry about icons defaulting to `Clock` doesn't apply here — the substring match already handles `consultation`, `governance_meeting_mt`, `document_review` etc.)

## 4. `PackageBurndownChart.tsx` — round Y-axis to nice max

Replace:
```
const yMaxComputed = Math.ceil(Math.max(hoursTotal, hoursUsed, 1) * 1.1);
```
with a local `roundUpToNiceMax(rawMax)` helper:
- ≤ 0 → 10
- ≤ 10 → 10
- ≤ 100 → next multiple of 10
- ≤ 500 → next multiple of 25
- otherwise → next multiple of 50

Apply as `yMax = roundUpToNiceMax(Math.max(hoursTotal, hoursUsed, 1))`.

For AHMRC (91 / 19) → ceiling 100, ticks 0/25/50/75/100. Over-budget cases still render honestly because we use `Math.max(hoursTotal, hoursUsed)`.

## Files touched

- `src/components/client/package-dashboard/formatters.ts` — append two functions.
- `src/components/client/package-dashboard/PackageHoursBreakdown.tsx` — wrap two label spans.
- `src/components/client/package-dashboard/PackageRecentWork.tsx` — wrap two label spans, replace note render with `cleanWorkNote`.
- `src/components/client/package-dashboard/PackageBurndownChart.tsx` — add helper, swap one line in the `useMemo`.

## Out of scope (per spec)

No view, hook, table, or threshold changes. No suffix cleanup (`_mt`). No banner/PackageStatusPill changes. No tooltip changes. No data-layer transformation of work_type.
