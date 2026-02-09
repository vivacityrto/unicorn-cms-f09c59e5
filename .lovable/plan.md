

## Client Calendar UI, Notification Centre, and View-as-Client Guards

### Summary

This plan adds three new client-facing routes and updates the client sidebar and View-as-Client preview page. No legacy tables are modified. All data comes from existing views and tables.

---

### Part A: Client Calendar Page (`/client/calendar`)

**New files:**

| File | Purpose |
|---|---|
| `src/pages/ClientCalendar.tsx` | Main page with two tabs: Events and My Reminders |
| `src/pages/ClientCalendarWrapper.tsx` | Wraps in DashboardLayout |
| `src/components/client/ClientRemindersCalendar.tsx` | Month/Week/Agenda calendar rendering reminders data |
| `src/components/client/ReminderDetailDrawer.tsx` | Sheet/drawer showing item details on click |
| `src/hooks/useClientReminders.tsx` | Hook querying `my_client_reminders` or `tenant_client_reminders` based on role |

**Events tab:** Reuses the existing AddEvent embed from `Calendar.tsx` (same script loading and `addeventstc` links). Extracted into a shared `AddEventEmbed` component.

**My Reminders tab:**
- Uses `useClientReminders` hook which checks the user's role via `useRBAC`:
  - ClientUser (General User) queries `my_client_reminders`
  - ClientAdmin (Admin) queries `tenant_client_reminders`
- Default view: Month grid. Toggle buttons for Month / Week / Agenda.
- Items rendered with colour-coded badges by `item_type` (task, meeting, reminder).
- Clicking an item opens `ReminderDetailDrawer` showing title, datetime, type badge, and context fields from `meta` (location, meeting_url, status, description).
- Deep link actions: meeting_url opens in new tab; task links to task route if available.

**Route registration:** Add `/client/calendar` to `App.tsx` with lazy import and `ProtectedRoute`.

---

### Part B: Notification Centre (`/client/notifications`)

**New files:**

| File | Purpose |
|---|---|
| `src/pages/ClientNotifications.tsx` | Full notification list page with grouping and filters |
| `src/pages/ClientNotificationsWrapper.tsx` | Wraps in DashboardLayout |
| `src/hooks/useClientNotifications.tsx` | Hook querying `user_notifications` table scoped to `auth.uid()` |

**Data source:** `user_notifications` table (columns: id, user_id, tenant_id, type, title, message, link, is_read, created_by, created_at, updated_at).

**UI:**
- Grouped by: Today, This Week, Older (using `date-fns` comparisons on `created_at`).
- Filter tabs: All, Events, Tasks, Meetings, Obligations (filtering on `type` column).
- Unread indicator: highlight row + "New" badge.
- Actions: "Mark as read" per item, "Mark all as read" button.
- Clicking a notification with a `link` value navigates to that route.

**Mark as read:** Updates `is_read` via Supabase client scoped to `user_id = auth.uid()` (RLS-safe).

**Route registration:** Add `/client/notifications` to `App.tsx`.

---

### Part C: View-as-Client Guards and Routing

**Changes to existing files:**

| File | Change |
|---|---|
| `src/pages/ClientPreview.tsx` | Add sidebar navigation for client portal routes (Home, Calendar, Notifications). Add routing within the preview to navigate between client pages while maintaining impersonation banner. |
| `src/components/client/ImpersonationBanner.tsx` | No changes needed -- already functional. |
| `src/components/client/ViewAsClientButton.tsx` | No changes needed -- already navigates to `/client-preview`. |

**Guard logic:** The existing `ClientPreviewContext` already provides `isPreviewMode` and `previewTenant`. Client pages will check:
1. If in preview mode, use `previewTenant.id` as tenant context.
2. If not in preview mode, use the user's own `tenant_id` from profile.
3. Internal-only UI (notes, risk, time logging) is hidden when `isPreviewMode` is true (already handled by existing view mode).

---

### Part D: Sidebar Updates

**File:** `src/components/DashboardLayout.tsx`

Update the client-facing `baseMenuItems` / `userMenuItems` / `adminMenuItems` arrays:

```text
Client sidebar items (when isViewingAsClient or client role):
- Home          -> /dashboard
- Documents     -> /manage-documents
- Calendar      -> /client/calendar
- Notifications -> /client/notifications  (with unread badge)
- Reports       -> /reports
- Settings      -> /settings
```

Admin additions:
- Users -> /team-settings (already present as "Manage Team")

**Unread badge:** The sidebar Notifications item will use `useNotifications` (or a lightweight count query) to show unread count badge.

---

### Part E: Shared Component Extraction

Extract the AddEvent embed logic from `src/pages/Calendar.tsx` into a reusable `src/components/calendar/AddEventEmbed.tsx` so both the internal Event Calendar page and the Client Calendar Events tab can use the same component without duplicating script loading.

---

### Files Created (new)

1. `src/pages/ClientCalendar.tsx`
2. `src/pages/ClientCalendarWrapper.tsx`
3. `src/components/client/ClientRemindersCalendar.tsx`
4. `src/components/client/ReminderDetailDrawer.tsx`
5. `src/hooks/useClientReminders.tsx`
6. `src/pages/ClientNotifications.tsx`
7. `src/pages/ClientNotificationsWrapper.tsx`
8. `src/hooks/useClientNotifications.tsx`
9. `src/components/calendar/AddEventEmbed.tsx`

### Files Modified (existing)

1. `src/App.tsx` -- add 2 new lazy imports and routes
2. `src/components/DashboardLayout.tsx` -- update client sidebar items with Calendar, Notifications, unread badge
3. `src/pages/Calendar.tsx` -- refactor to use shared `AddEventEmbed`

### No Database Changes

All queries use existing views (`my_client_reminders`, `tenant_client_reminders`) and tables (`user_notifications`). No migrations needed.

