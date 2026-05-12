# Remove broken "Book consult" action from client package dashboard

## Problem
`src/components/client/package-dashboard/PackageActionRow.tsx` renders a "Book consult" button linking to `/consults/new?package_instance_id=...`, which is not a registered client-portal route — secondary contacts (and anyone else) hit a 404. It also uses the default primary Button variant, so it looks active before being clicked.

## Change (single file)
Edit `src/components/client/package-dashboard/PackageActionRow.tsx`:

1. Remove the entire "Book consult" `<Button asChild size="sm">…</Button>` block, including the two `TODO(week1-routes)` comments tied to it.
2. Remove the now-unused `CalendarPlus` import from `lucide-react`.
3. Keep "Open tasks" exactly as-is (`/client/tasks?package_instance_id=${packageInstanceId}`, `variant="secondary"`, `ListChecks` icon).
4. Keep "Message CSC" exactly as-is (`/client/inbox?tab=messages`, `variant="secondary"`, `MessageSquare` icon).
5. Leave the wrapping `<div className="flex flex-wrap gap-2">` untouched — the two remaining buttons flow cleanly on desktop and mobile.

## Out of scope (explicitly not touched)
- No new route, no redirect for `/consults/new`, no `App.tsx` changes.
- No database, migration, RPC, RLS, or edge-function changes.
- No changes to other "Book consult" entry points (e.g. `/client/calendar` links on the client home page).
- No styling changes to unrelated buttons.
- No changes to route guards or secondary-contact permissions.

## Verification
- `/client/packages` renders the action row with only **Open tasks** and **Message CSC**.
- Both remaining links navigate correctly.
- No 404 reachable from the package action row.
- Layout stays clean at the current 1124px viewport and on mobile (`flex-wrap` already handles narrow widths with two buttons).
- Secondary contact, primary contact, and regular client users retain access to `/client/packages`.

## Risk
Minimal. Single presentational component, no consumers depend on the removed button, no behavioural or data changes.
