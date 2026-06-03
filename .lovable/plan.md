## Goal
Fix the TimeLogDrawer scroll behavior so both horizontal and vertical scrollbars are always visible inside the drawer, by restructuring the SheetContent layout with an explicit viewport-height wrapper.

## Changes

### File: `src/components/client/TimeLogDrawer.tsx`

**Step 1 — Simplify SheetContent className**
Change the `SheetContent` opening tag from:
```
className="w-full sm:max-w-3xl flex flex-col !overflow-y-hidden p-0"
```
to:
```
className="w-full sm:max-w-3xl p-0"
```

**Step 2 — Wrap all children in a viewport-height div**
Immediately inside `<SheetContent>`, wrap all existing children in:
```tsx
<div className="h-screen flex flex-col overflow-hidden">
  ...all existing children...
</div>
```

**Step 3 — Top section stays unchanged**
The existing `<div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4 border-b">` containing `<SheetHeader>`, summary stats, filters, and bulk action bar remains exactly as-is.

**Step 4 — Table wrapper becomes a bounded scroll container**
Change the table wrapper div from:
```
className="overflow-auto h-[calc(100vh-300px)] px-6 pb-6"
```
to:
```
className="flex-1 min-h-0 overflow-auto px-6 pb-6"
```

No data, state, or business logic changes.