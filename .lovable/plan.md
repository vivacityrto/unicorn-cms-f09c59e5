Fix two issues in `src/components/calendar/CalendarGrid.tsx` to prevent Outlook all-day events from overflowing the day column in day/week views.

### Changes

**1. Cap event height at the grid's visible bottom (line 197)**
Replace the single-line height calculation with two lines that compute a `maxHeight` based on remaining grid space and clamp `height` to it:
```
const maxHeight = (END_HOUR - startHour) * HOUR_HEIGHT;
const height = Math.min(Math.max((durationMinutes / 60) * HOUR_HEIGHT, 24), maxHeight);
```
- `compact` prop evaluation and `CalendarEventCard` rendering remain unchanged.
- Events filtered out by `startHour` visibility remain unchanged.

**2. Add overflow clipping to day column container (line 176)**
Add `overflow-hidden` to the day column `<div>` className so oversized event cards do not bleed past the grid boundary:
```
className={cn(
  'flex-1 relative overflow-hidden border-r last:border-r-0',
  isToday(day) && 'bg-primary/5'
)}
```

### Safeguards
- `eventLayouts` overlap packing logic is untouched.
- `compact` threshold still evaluates against the capped height.
- Month view (`MonthView`) is untouched.
- No Supabase queries, hooks, database tables, or `CalendarEventCard.tsx` changes.