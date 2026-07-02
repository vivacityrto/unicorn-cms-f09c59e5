
## Problem

On `/communications`, the 3-pane layout (Clients rail / Thread list / Conversation) is only given `minHeight: 70vh` and no `maxHeight`. That means:

1. The whole page grows as tall as its tallest child (long thread lists, long message threads), so the composer sits far below the fold and you have to scroll the whole page to reach it.
2. Because each panel's inner `ScrollArea` uses `flex-1` inside an unbounded parent, the ScrollAreas never actually activate — the panels just grow, and long lists visually "overflow" past their column instead of scrolling within it.

The panel children are already set up correctly (each is `flex flex-col overflow-hidden` with a `ScrollArea flex-1` inside, and rows use `truncate`). Only the outer grid's height is wrong.

## Fix — single, targeted edit in `src/pages/TeamCommunicationsPage.tsx`

Replace the grid wrapper (around line 635-638):

- Remove `style={{ minHeight: "70vh" }}`.
- Give the grid a bounded height tied to the viewport, e.g. `h-[calc(100vh-13rem)] min-h-[32rem]`. The `13rem` offset accounts for the app top bar + the page header + the staff filter row + `space-y-4` gaps; `min-h-[32rem]` keeps it usable on short viewports.
- Ensure each direct grid child can shrink so its inner `ScrollArea` activates: add `min-h-0` to the Conversation panel wrapper (`<div class="border rounded-lg ...">`). `ClientsRail` and `ThreadList` already accept a `className`; pass `min-h-0` alongside their existing classes.

After this:

- The composer is pinned at the bottom of the right panel — no page scroll needed.
- The Clients rail scrolls internally when there are many tenants.
- The Thread list scrolls internally when there are many threads (long subject/preview text keeps truncating as it already does).
- The Conversation panel scrolls internally through message history.

## Not changing

- No changes to `ClientsRail.tsx`, `ThreadList.tsx`, or `ConversationPanel.tsx` — their internal structure and `truncate` behaviour are already correct.
- No changes to data fetching, sorting, or filtering.
- No responsive-breakpoint changes: the existing `grid-cols-1 md:... lg:...` behaviour is preserved; on mobile the columns stack and the same bounded height applies.

## Verification

After the edit, drive Playwright to `/communications` at 1332×889 (matches the user's current viewport), open a conversation with many messages, and confirm:
1. The composer's Send button is visible without scrolling the page.
2. Scrolling inside the thread list does not scroll the page.
3. Long tenant names / thread subjects stay truncated within their column.
