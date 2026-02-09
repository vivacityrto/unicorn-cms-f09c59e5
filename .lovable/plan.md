

## Notification Preferences for Client Portal

### Current State

The infrastructure is already in place:

- **Table**: `user_notification_prefs` exists with RLS enabled and select/insert/update policies
- **Columns**: `id`, `user_id`, `tenant_id`, `email_enabled`, `inapp_enabled`, `digest_enabled`, `quiet_hours` (jsonb), `event_settings` (jsonb), `created_at`, `updated_at`
- **RPCs**: `get_user_notification_prefs` (lazy-creates row with defaults), `update_user_notification_prefs` (upserts all fields including `event_settings`)
- **No database changes needed** -- we store category preferences inside the `event_settings` JSONB column

### Preference Storage Convention

Store per-category toggles in `event_settings`:

```json
{
  "categories": {
    "tasks": true,
    "meetings": true,
    "obligations": true,
    "events": true
  }
}
```

Default: all `true`. The existing `update_user_notification_prefs` RPC already handles `event_settings` as a JSONB field.

---

### Changes

#### 1. New Hook: `src/hooks/useNotificationPrefs.ts`

- Calls `get_user_notification_prefs` RPC on mount (lazy-creates row)
- Parses `event_settings.categories` with defaults (all true)
- Exposes `prefs` object and `updateCategory(key, enabled)` function
- `updateCategory` calls `update_user_notification_prefs` RPC, merging the updated category into existing `event_settings`
- Uses React Query for caching and invalidation

#### 2. New Component: `src/components/settings/NotificationPrefsTab.tsx`

A settings tab with four toggle switches:

| Toggle | Key | Helper text |
|---|---|---|
| Task reminders | `tasks` | "Receive reminders for upcoming and overdue tasks" |
| Meeting reminders | `meetings` | "Receive reminders before meetings start" |
| Obligation reminders | `obligations` | "Receive reminders for compliance obligations" |
| Event notifications | `events` | "Receive notifications for calendar events" |

Each toggle saves inline (no Save button needed) via the hook. Shows toast on success/error.

#### 3. Modified: `src/pages/Settings.tsx`

- Import `NotificationPrefsTab` and add a "Notifications" tab (Bell icon) to the tab list
- Available to all users (not restricted to SuperAdmin/Vivacity)
- Add `'notifications'` to `TAB_VALUES`

#### 4. Modified: `src/pages/ClientNotifications.tsx`

- Import `useNotificationPrefs` hook
- When filtering notifications, additionally check if the category is enabled in prefs
- If a category is disabled, those notification items are hidden from the list (not deleted from DB)
- Add a subtle info banner: "Some notification types are hidden based on your preferences"

#### 5. Modified: `supabase/functions/generate-notifications/index.ts`

- Before inserting notifications, batch-fetch `user_notification_prefs` for all recipient user IDs in the current run
- Parse `event_settings.categories` for each user
- Skip inserting a notification if the user has disabled that category:
  - `task_due` checks `categories.tasks`
  - `meeting_upcoming` checks `categories.meetings`
  - `obligation_due` checks `categories.obligations`
- Cache prefs per user per run to avoid repeated queries (single bulk fetch at start of each scope handler)

---

### No Database Changes

- No `ALTER TABLE` on any table
- No new tables or columns
- No migration needed
- Uses existing `event_settings` JSONB column and existing RPCs

### Files Created

| File | Purpose |
|---|---|
| `src/hooks/useNotificationPrefs.ts` | Hook wrapping get/update RPCs for category preferences |
| `src/components/settings/NotificationPrefsTab.tsx` | Toggle UI for four notification categories |

### Files Modified

| File | Change |
|---|---|
| `src/pages/Settings.tsx` | Add Notifications tab |
| `src/pages/ClientNotifications.tsx` | Filter out disabled categories |
| `supabase/functions/generate-notifications/index.ts` | Check prefs before inserting notifications |

### Acceptance Criteria

| Criteria | How |
|---|---|
| User can toggle categories and changes persist | `update_user_notification_prefs` RPC upserts `event_settings` |
| Disabled categories skip notification generation | Edge function checks prefs before insert |
| Disabled categories hidden in Notification Centre | Client-side filter in `ClientNotifications.tsx` |
| RLS prevents cross-user access | Existing policies on `user_notification_prefs` |
| No legacy tables modified | Only reads from existing RPCs and `event_settings` column |

