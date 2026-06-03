## Problem

In `TimeLogDrawer.tsx`, the Sheet panel itself scrolls because `SheetContent`'s base variant includes `overflow-y-auto`. The table wrapper uses an explicit `h-[calc(100vh-280px)]`, but since the outer sheet is also scrollable and the inner content is taller than the viewport, the table's horizontal scrollbar lands below the fold — you have to scroll the whole sheet down to reach it.

## Fix (single file: `src/components/client/TimeLogDrawer.tsx`)

1. **Stop the outer sheet from scrolling.** Override `SheetContent` className to a full-height flex column with no outer scroll:
   - From: `"w-full sm:max-w-3xl"`
   - To: `"w-full sm:max-w-3xl flex flex-col h-full overflow-hidden p-0"` (and move existing inner padding so layout is preserved)

   The header block (`flex-shrink-0 px-6 pt-6 pb-4 ...`) already exists and stays as-is.

2. **Make the table region the only scroll area.** Change the table wrapper from:
   - `"overflow-auto h-[calc(100vh-280px)]"`
   - To: `"flex-1 min-h-0 overflow-auto px-6 pb-6"`

   With `flex-1 min-h-0`, the wrapper fills remaining sheet height exactly, so its horizontal scrollbar sits at the bottom edge of the visible panel — no page scrolling required.

3. **Keep sticky header** (`TableHeader` already has `sticky top-0 bg-background z-10`) — no change needed; it now works because scrolling happens inside the wrapper.

No data, business-logic, or other-file changes.