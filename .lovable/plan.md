In `src/pages/SupportTicketsPage.tsx`, apply five targeted Tailwind class changes to the left ticket-list panel to prevent text clipping and ensure the date remains fully visible.

1. `<ul>` inside `ScrollArea` (line 512):
   Change `className="divide-y"` to `className="divide-y w-full"`.

2. Outer `<button>` inside each `<li>` (line 520):
   Add `min-w-0` to the existing `className`.

3. User-name row `<div>` (line 524):
   Change `className="flex items-center justify-between gap-2 mb-1"` to `className="flex items-center justify-between gap-2 mb-1 min-w-0 overflow-hidden"`.

4. Badge + date row `<div>` (line 537):
   Change `className="flex items-center justify-between mt-1.5"` to `className="flex items-center justify-between mt-1.5 min-w-0 gap-2"`.

5. Date `<span>` (line 544):
   Add `shrink-0` to the existing `className`.

No other files, logic, or styling will be changed.