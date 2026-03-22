

## Fix: Scorecard date columns — show current week first (right-to-left → left-to-right descending)

### Problem
Both `ScorecardEntryGrid.tsx` and `WeeklyEntryGrid.tsx` generate 13 weeks and `.reverse()` the array, putting the oldest week on the left and current week on the right — requiring horizontal scrolling to see current data.

### Change
Remove `.reverse()` on line 60 of `ScorecardEntryGrid.tsx` and line 30 of `WeeklyEntryGrid.tsx`. This keeps the array in its natural order (index 0 = current week, index 12 = 13 weeks ago), so the most recent week appears on the left.

### Files
1. **`src/components/eos/ScorecardEntryGrid.tsx`** — line 60: remove `.reverse()`
2. **`src/components/eos/scorecard/WeeklyEntryGrid.tsx`** — line 30: remove `.reverse()`

