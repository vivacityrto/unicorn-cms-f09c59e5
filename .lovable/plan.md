In `src/components/client/TimeLogDrawer.tsx`, make exactly two className changes:

1. **SheetContent** (line 192): replace the current className with:
   `w-full sm:max-w-3xl flex flex-col !overflow-y-hidden p-0`
   The `!overflow-y-hidden` uses `!important` to override the `overflow-y-auto` baked into the shared `SheetContent` base variant, stopping the outer sheet from scrolling.

2. **Table wrapper div** (line 304): replace the current className with:
   `overflow-auto h-[calc(100vh-300px)] px-6 pb-6`
   The explicit `h-[calc(100vh-300px)]` bounds the container so `overflow-auto` keeps both scrollbars inside the visible box, keeping the horizontal scrollbar always accessible without scrolling the entire sheet.

No other code, logic, or file changes.