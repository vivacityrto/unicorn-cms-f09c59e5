## Plan: Show Only First Names in Notify Sections

All notify/user-selection areas currently display `{user.first_name} {user.last_name}`. Change these to show only `{user.first_name}`.

Move Notify Client to section header aread to the right of  "NOTIFY"

### Files and Changes

1. `**src/components/client/CreateActionDialog.tsx**` (line ~156)
  - Change `{user.first_name} {user.last_name}` → `{user.first_name}`
2. `**src/components/client/ClientActionItemsTab.tsx**` (lines ~618, ~584)
  - Notify buttons: `{user.first_name} {user.last_name}` → `{user.first_name}`
  - Assign dropdown items: `{member.first_name} {member.last_name}` → `{member.first_name}`
3. `**src/components/client/AddTimeDialog.tsx**` (line ~456)
  - Notify dropdown: `{member.first_name} {member.last_name}` → `{member.first_name}`
4. `**src/components/client/EditTimeDialog.tsx**` — same pattern, notify dropdown display.
5. `**src/components/client/ClientStructuredNotesTab.tsx**` — same pattern if notify users are listed.

Only the **display text** changes. Avatar fallback initials, logging, and email content remain unchanged.