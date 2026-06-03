# TimeLogDrawer.tsx — three fixes

Edits limited to `src/components/client/TimeLogDrawer.tsx`. Data fetching, the open useEffect, and `refresh` logic are not touched.

## 1. Horizontal scroll containment
Wrap the table-area render (loading skeleton, empty state, and `<Table>`) in a single `<div className="overflow-x-auto">` so the scrollbar sits under the table instead of at the bottom of the sheet.

## 2. Single-entry reassign supports Unassigned
In `savePackageInstance`, change:
```
package_id: newPackageId ?? undefined,
```
to:
```
package_id: newPackageId,
```
so `null` is sent when the user picks "Unassigned".

## 3. Bulk selection + reassign

**New imports:** `Checkbox` from `@/components/ui/checkbox`.

**New state inside the component:**
- `selectedIds: Set<string>` (default empty Set)
- `bulkPackageInstanceId: string` (default `''`)
- `bulkSaving: boolean` (default false)

**Checkbox column** added as the first column in both `TableHeader` and each `TableBody` row:
- Header checkbox: checked when `selectedIds.size > 0 && selectedIds.size === filteredEntries.length`; toggling selects/clears all filtered entries.
- Row checkbox: toggles that entry's id in the set (immutable clone on each change).

**Bulk action bar** rendered between the filter row and the table block, only when `selectedIds.size > 0`:
- Shows `{count} selected`.
- `Select` bound to `bulkPackageInstanceId` with `Unassigned` (`value="none"`) plus every `packageInstances` option (label format identical to inline editor).
- `Reassign` button: disabled while `bulkSaving` or when `bulkPackageInstanceId === ''`. On click:
  1. set `bulkSaving=true`
  2. compute `newInstanceId` (null when `'none'`) and resolve `newPackageId` from `packageInstances`
  3. `supabase.from('time_entries').update({ package_instance_id, package_id, updated_at: now }).in('id', Array.from(selectedIds))`
  4. on error → destructive toast; on success → success toast, clear `selectedIds`, reset `bulkPackageInstanceId` to `''`, call `refresh()`
  5. set `bulkSaving=false`
- `Clear` button: empties `selectedIds`.

The colspan-bearing `TableHead`/`TableCell` structure gains one leading cell; no other columns change. Sheet, SheetHeader, summary cards, work-type/billable filters, inline edit flow, and delete flow remain as-is.

## Verification
- Open Time Log drawer: table scrolls horizontally within its own area.
- Edit a single entry → choose Unassigned → save: row shows Unassigned, no error.
- Tick several rows → pick a package (or Unassigned) in the bulk bar → Reassign: toast confirms, rows refresh, selection clears.
- Clear button empties selection and hides bulk bar.
