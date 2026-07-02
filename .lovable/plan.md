## Plan

Update the Team Communications layout with a targeted CSS-only fix for the remaining overflow:

1. **Constrain the three grid columns properly**
   - Add `min-w-0` to the grid and each pane wrapper so long tenant names, subjects, and previews cannot force columns wider than their allocated grid track.
   - Keep the existing responsive breakpoints and height constraint.

2. **Make Clients rail rows clip inside their panel**
   - Add `min-w-0` / `overflow-hidden` to the rail root and row buttons.
   - Ensure unread badges and avatars stay fixed while tenant names and metadata truncate cleanly within the column.

3. **Make Thread list rows clip inside their panel**
   - Add `min-w-0` / `overflow-hidden` to the list root and each thread row.
   - Change the top-line layout so the topic badge and time stay fixed, while tenant name truncates in the available space.
   - Keep subject and preview as single-line truncation so they do not spill into the conversation panel.

4. **Keep the composer visible with internal scrolling**
   - Preserve the bounded page height and internal `ScrollArea` behaviour so users do not need to scroll the whole page to send a message.
   - If needed, add `min-h-0`/`flex-1` safeguards to the conversation panel internals only; no data or composer logic changes.

## Scope

- UI/CSS only.
- No schema changes.
- No changes to data sources, filtering, sorting, sending messages, or the composer behaviour.