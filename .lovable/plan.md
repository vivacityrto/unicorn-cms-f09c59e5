

## Login History: User-Centric with Tenant Context

### Design Decision

Login events are recorded against the **user**, not the tenant. Session activity metrics are optionally tagged with a `tenant_id` to allow filtering by organisation context.

This matches reality: a user authenticates once to the platform, then works across one or more tenants during that session.

### Schema Changes

**Modify `user_activity` table** -- add an optional `tenant_id` column and a `session_id` for grouping actions within a login session:

```text
user_activity (existing table, modified)
---------------------------------------------
id              uuid        PK
user_id         uuid        FK -> users.user_uuid (NOT NULL)
tenant_id       bigint      FK -> tenants.id (NULLABLE)    <-- NEW
session_id      uuid        (NULLABLE, groups actions)     <-- NEW
login_date      timestamptz NOT NULL
logout_date     timestamptz (NULLABLE)                     <-- NEW
docs_downloaded integer     (NULLABLE)
messages_sent   integer     (NULLABLE)
tasks_created   integer     (NULLABLE)
created_at      timestamptz
```

- `tenant_id` is nullable because the login event itself is user-level; the tenant context is set when the user selects/enters a tenant workspace
- `session_id` groups multiple activity updates within one session
- `logout_date` enables session duration tracking

**Preserve legacy data**: Add a one-time migration to snapshot `users.last_sign_in_at` into a `legacy_last_sign_in` column on the `users` table (or a separate `legacy_login_snapshot` table) so the old value is never lost as new logins overwrite it.

```text
legacy_login_snapshot (new table)
---------------------------------------------
id              uuid        PK
user_id         uuid        FK -> users.user_uuid (UNIQUE)
last_sign_in_at timestamptz (from legacy system)
migrated_at     timestamptz DEFAULT now()
```

### Auto-Recording Logins

Create a database function + trigger (or edge function hook) that fires on auth sign-in to insert a row into `user_activity`:

- Records `user_id` and `login_date` automatically
- `tenant_id` is set later when the user navigates into a tenant context

### Hook Changes (`useLoginHistory.ts`)

- Accept an optional `tenantId` parameter
- When `tenantId` is provided: filter `user_activity` rows by that tenant (shows "what happened in this org")
- When `tenantId` is null: show all activity for the user (for a user-profile view)
- Always join to `users` table for name/email

### UI Changes (`ClientLoginHistoryTab.tsx`)

- **User Login Summary** card: shows each tenant user, their legacy last sign-in (from snapshot table), their current last sign-in, and total login count
- **Session Activity Log**: shows individual sessions with tenant context badge, duration, and action counts
- Add a "Legacy" badge next to the preserved `last_sign_in_at` value so it's clear which data came from the old system

### RLS Policies

- `user_activity`: users can read their own rows; SuperAdmins can read all; tenant admins can read rows matching their tenant_id
- `legacy_login_snapshot`: read-only for SuperAdmins and the user themselves

### Technical Summary

| Step | Detail |
|------|--------|
| 1. Migration | Add `tenant_id`, `session_id`, `logout_date` columns to `user_activity` |
| 2. Migration | Create `legacy_login_snapshot` table |
| 3. Data insert | Populate `legacy_login_snapshot` from current `users.last_sign_in_at` |
| 4. Migration | Add RLS policies to both tables |
| 5. Code | Create auth login trigger or edge function to auto-record logins |
| 6. Code | Update `useLoginHistory.ts` to support user-centric + tenant-filtered queries |
| 7. Code | Update `ClientLoginHistoryTab.tsx` to show legacy badge and session data |

