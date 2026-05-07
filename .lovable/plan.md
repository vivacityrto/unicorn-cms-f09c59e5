## Fix: Remove "pressed" appearance from Book consult quick action card

The "Book consult" tile in the QuickActionsRow grid (under the CSC card) has `emphasised: true`, which applies `border-2 border-primary/30 bg-primary/5` plus a cyan-tinted icon bubble. Next to the three plain neighbour cards, this reads as a pressed/active state.

### Change

In `src/components/client/ClientHomePage.tsx`, in the `quickActions` array (line 349), remove the `emphasised: true` line from the "Book consult" entry so all four quick action tiles share the same neutral card style.

Result: the four tiles in the row become visually equal weight; high-intent emphasis still lives on the dedicated CSCCard "Book consult" outline button above.

### Out of scope
- CSCCard buttons (already correct from previous fix)
- `QuickAction` type or `QuickActionsRow` styling logic (the `emphasised` flag stays available for future use)