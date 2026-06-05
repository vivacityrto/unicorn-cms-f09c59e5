## Problem

In `src/pages/SupportTicketsPage.tsx`, the ticket list (left panel) still shows clipped dates ("05/0") and preview text without ellipsis, even after the earlier `min-w-0` / `shrink-0` / `overflow-hidden` changes.

The root cause is the Radix `ScrollArea` component: its internal viewport wrapper (`[data-radix-scroll-area-viewport] > div`) defaults to `display: table`, which forces children to expand to their content's intrinsic width. This breaks `w-full`, `min-w-0`, and `truncate` on everything inside.

## Fix (one targeted change)

In `src/pages/SupportTicketsPage.tsx`, update the `ScrollArea` on line 506 to override the inner viewport's display so children respect the container width:

```tsx
<ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
```

This makes the inner wrapper a block element, so:
- `<ul className="divide-y w-full overflow-hidden">` actually constrains to the panel width
- `truncate` on the user name and preview text works
- `shrink-0` on the date is honored (no more "05/0")
- The badge + date row stays within bounds

## Scope

- Single line change in `src/pages/SupportTicketsPage.tsx` (line 506).
- No other files, logic, or styling changes.
- No DB or hook changes.
