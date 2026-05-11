# Standards Picker — Shared Component

Build `src/features/pdp/components/StandardsPicker.tsx` — a controlled standards lookup that returns a `standard_id` (uuid) on selection.

## Framework labels (display only)
The DB `standards_reference.framework` column will not be renamed. Active values today: `RTO` (59), `CRICOS` (11), `GTO` (7), `Membership` (5). Apply a UI-only friendly map; unknown values fall back to the raw string.

```
RTO        → group label "Standards for RTOs 2025"   chip "SRTO"
CRICOS     → group label "CRICOS National Code"      chip "CRICOS"
GTO        → group label "GTO Standards"             chip "GTO"
Membership → group label "Credential & Membership"   chip "Cred"
```

## API

```ts
interface StandardsPickerProps {
  value: string | null;                                  // selected standard_id (uuid)
  onChange: (id: string | null, ref?: StandardRef) => void;
  frameworks?: string[];                                 // optional filter (default: all active)
  placeholder?: string;                                  // default "Link a standard…"
  disabled?: boolean;
  allowClear?: boolean;                                  // default true
}
```

Re-uses `StandardRef` from `src/features/pdp/api.ts`.

## Behaviour

- Trigger: shadcn `Button variant="outline"` showing `[chip] code — title` when set, else `placeholder`. Trailing `ChevronsUpDown` icon; `X` icon clears when `allowClear && value`.
- Click opens shadcn `Popover` (`align="start"`, `w-[420px] p-0`, `pointer-events-auto`) wrapping a `Command`:
  - `CommandInput placeholder="Search by code or keyword…"`
  - `CommandEmpty` → "No standards match"
  - One `CommandGroup` per framework (heading = friendly label), rows sorted by natural code order
  - Each `CommandItem` shows: framework chip (`Badge variant="outline"`), `code`, em-dash, `title` truncated
  - `CommandItem.value` = `${framework} ${code} ${title}` so cmdk fuzzy search hits all three
  - Selecting an item calls `onChange(standard.id, standard)` and closes the popover
- Co-located hook `useActiveStandards(frameworks?)` — `useQuery` keyed on `["pdp","standards-active", frameworks ?? "all"]`, fetches `id, framework, code, title` from `standards_reference` where `is_active=true`, ordered by framework then code, optional `.in('framework', frameworks)` filter.

## States
- Loading → disabled `CommandItem`: "Loading standards…"
- Error → toast via `sonner` and inline "Failed to load standards"
- Empty → `CommandEmpty`

## Styling
- Semantic tokens only; no custom colors.
- `pointer-events-auto` on `PopoverContent`.

## Files
- **Created**: `src/features/pdp/components/StandardsPicker.tsx` (component + co-located hook + framework label map).

## Out of scope
- Renaming framework values in the DB.
- Wiring into the goal sheet (Prompt 5) and evidence sheet (Prompt 6).

## Verification
- `bunx tsc --noEmit` clean.
- Render in isolation: opens popover, fuzzy "3.2" filters to matching SRTO rows, selecting returns the uuid via `onChange`, clear button resets.
