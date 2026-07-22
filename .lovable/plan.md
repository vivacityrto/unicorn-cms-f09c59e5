Add a derived `lastActivityAt` timestamp to each invite row (max of `created_at`, `last_sent_at`, `delivery_event_at`, `accepted_at`, `revoked_at`, ignoring nulls) and a "Sort by" control next to the existing status/date filters.

Changes:
1. In `src/pages/ManageInvites.tsx`, add a `sortBy` state with values `"latest-activity"` (default) and `"date-created"`.
2. Add a `<Select>` control labeled "Sort by" next to the existing filter controls in the page header.
3. Compute `lastActivityAt` for each invite when building the filtered/sorted list.
4. Sort `filteredInvites` by `lastActivityAt` descending when `"latest-activity"` is selected; keep the existing `created_at` descending sort when `"date-created"` is selected.
5. Leave the visible "Date" column and all other table/filter behavior unchanged.