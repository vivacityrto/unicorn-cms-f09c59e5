## Side-by-side overlapping calendar events

Edit only `src/components/calendar/CalendarGrid.tsx` (day/week render path). Month view, `CalendarEventCard`, hooks, and queries are untouched.

### 1. Compute per-day layout (greedy column packing)

Add a `useMemo` named `eventLayouts` after `eventsByDay`, producing `Map<string /*event.id*/, { column: number; totalColumns: number }>`.

For each day's events:
- Sort by `start_at` ascending (tiebreak by `end_at` desc so longer events take earlier columns).
- Greedy column assignment: walk events in order; for each event place it in the first column whose last-assigned event ends `<=` this event's start. Otherwise open a new column. Record `{ column }`.
- Overlap groups: scan again and for each event compute `totalColumns` = `(max column index among all events that strictly overlap it) + 1`. Strict overlap: `A.start < B.end && A.end > B.start` (touching ends do not overlap). Propagate group width so all members of a contiguous overlap cluster share the same `totalColumns`.

### 2. Apply layout to event style

Inside `dayEvents.map`, look up `{ column, totalColumns }` from the map (default `{0,1}`):

- `top`, `height`, `position: 'absolute'` unchanged.
- If `totalColumns === 1`: keep `left: '2px', right: '2px'` exactly as today. No colour override.
- If `totalColumns > 1`:
  - `left: \`calc(${(column / totalColumns) * 100}% + 2px)\``
  - `width: \`calc(${(1 / totalColumns) * 100}% - 4px)\``
  - Omit `right`.
  - If `event.access_scope !== 'busy_only'`, set `backgroundColor` + `color` from the brand palette cycle below (modulo 4 on column index). `busy_only` events get no colour override — Tailwind keeps them grey.

Brand cycle:
```
0 → #7130A0 / #ffffff   (Purple)
1 → #ED1878 / #ffffff   (Fuchsia)
2 → #23C0DD / #1a1a1a   (Aqua)
3 → #44235F / #ffffff   (Acai)
```

### 3. Preserved behaviour

- `compact={height < 50}` unchanged.
- Visible-hours filter `if (startHour < START_HOUR || startHour >= END_HOUR) return null` unchanged.
- `onEventClick`, `onCreateTimeDraft`, `onLinkToClient` unchanged.
- Month view (`MonthView`) untouched.
- No edits to `CalendarEventCard.tsx`, `useWorkCalendar.tsx`, `CalendarTimeCapture.tsx`, edge functions, RLS, or schema.

### Edge cases covered

- Single non-overlapping event → identical to today.
- Touching end-to-start → both full width.
- Long event containing two shorter ones → all three rendered at 1/3 width with distinct colours.
- `busy_only` overlapping owned event → side-by-side, busy stays grey, owned gets brand colour.
- Events starting before `START_HOUR` already filtered before render.
