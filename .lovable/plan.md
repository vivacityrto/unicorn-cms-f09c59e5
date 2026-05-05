## Make Name column sortable in Manage Documents

The Name header in `src/pages/ManageDocuments.tsx` (line 1519–1521) is plain text, but the sort infrastructure already supports `"title"` as a sort field (`sortField` state + `toggleSort` + sort switch case at line 555). Currently no header is wired up to call `toggleSort`.

### Change

In `src/pages/ManageDocuments.tsx`, make the Name `TableHead` clickable to toggle sorting on `title`:

- Wrap the "Name" label in a button that calls `toggleSort("title")`
- Show an ascending/descending arrow (using `ArrowUp` / `ArrowDown` from lucide-react, falling back to `ArrowUpDown` when inactive) based on `sortField === "title"` and `sortDirection`
- Add `cursor-pointer select-none` and `hover:text-primary` to match the existing semibold header styling
- Keep all other headers untouched (per scope discipline — ID and Version Date were not requested)

No changes to data fetching, filter logic, or the existing sort comparator — those already handle `"title"` correctly via `localeCompare`.