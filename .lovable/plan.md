
## Issue
In `IDSDialog.tsx` (line 293), the "Linked Rock" badge only shows a truncated UUID (`Rock ID: 702b10b8`) instead of the rock's title.

## Fix
Add a query to fetch the linked rock's title when `issue.linked_rock_id` is present, then display the rock title (and optionally make it clickable to navigate to the rock).

### Changes — `src/components/eos/IDSDialog.tsx`
1. Add a `useQuery` that fetches `id, title, status` from `eos_rocks` where `id = issue.linked_rock_id` (enabled only when the ID exists and dialog is open).
2. Replace the badge content at line 293 with the fetched `rock.title`. Fall back to the short ID only if the rock can't be loaded (deleted/archived).
3. Render the rock title as a `Link` to `/eos/rocks?rock=<id>` (matching the pattern used in `LeadershipRocksTable.tsx`) so facilitators can jump straight to the linked rock.

No DB or RLS changes needed — `eos_rocks` is already readable by Vivacity staff who can open this dialog.
