
## Edit User Drawer — Corrected Field Mapping

### What the User Asked For

The drawer should have exactly:
- **Position** (job title) — editable
- **Phone** — editable (use `users.phone`, not `mobile_phone`)
- **Role** — editable (parent/child with readable labels)
- **Inactive toggle** — the `users.disabled` boolean (no `inactive` column exists; `disabled = true` means inactive)
- **View Full Profile** button
- **Login info footer** — read-only: Total Logins + Last Login (from `user_activity`)

### Confirmed Column Names on `public.users`

| What user called | Actual column | Type |
|---|---|---|
| Phone | `phone` | text, nullable |
| Position | `job_title` | text, nullable |
| Inactive | `disabled` | boolean, NOT NULL, default false |
| Last login | `last_sign_in_at` | timestamptz, nullable (fallback) |

Login count and last login date come from `user_activity` (columns: `user_id`, `login_date`) — fetched on drawer open.

There is no `inactive` column and no `total_logins` column directly on `users`. The `disabled` boolean is what controls active/inactive status.

---

## Changes — `src/components/client/TenantUsersTab.tsx` Only

### 1. Expand `TenantUser` Interface

Add the correct fields from the DB:

```typescript
interface TenantUser {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;        // ← correct column name
  job_title: string | null;
  disabled: boolean;
  last_sign_in_at: string | null;
  created_at: string;
}
```

### 2. Expand `fetchMembers` Query

Update the select to pull `phone`, `job_title`, `disabled`, and `last_sign_in_at` from the joined `users` table:

```typescript
users!tenant_users_user_id_fkey (
  user_uuid,
  email,
  first_name,
  last_name,
  avatar_url,
  phone,              ← correct column
  job_title,
  disabled,
  last_sign_in_at,
  created_at
)
```

### 3. Add Drawer Stats State

```typescript
const [drawerStats, setDrawerStats] = useState<{ totalLogins: number; lastLogin: string | null }>({
  totalLogins: 0,
  lastLogin: null,
});
```

Fetch on drawer open via a lightweight query to `user_activity`:

```typescript
const { data: activity } = await supabase
  .from('user_activity')
  .select('login_date')
  .eq('user_id', member.user_id)
  .order('login_date', { ascending: false });

setDrawerStats({
  totalLogins: activity?.length ?? 0,
  lastLogin: activity?.[0]?.login_date ?? member.users.last_sign_in_at ?? null,
});
```

### 4. Replace `editForm` State

Remove first_name/last_name. Add phone, job_title, disabled:

```typescript
const [editForm, setEditForm] = useState({
  job_title: '',
  phone: '',
  role: '',
  disabled: false,
});
```

### 5. Update `openEditDrawer`

Populate the new fields and trigger the login stats fetch:

```typescript
const openEditDrawer = (member: TenantMemberInfo) => {
  setEditingMember(member);
  setEditForm({
    job_title: member.users.job_title || '',
    phone: member.users.phone || '',
    role: member.role,
    disabled: member.users.disabled,
  });
  fetchDrawerStats(member);
};
```

### 6. Update `handleSaveEdit`

Save `job_title`, `phone`, and `disabled` to `users` table; `role` to `tenant_users`. Remove first_name/last_name from the update:

```typescript
await supabase.from('users').update({
  job_title: editForm.job_title || null,
  phone: editForm.phone || null,
  disabled: editForm.disabled,
}).eq('user_uuid', editingMember.users.user_uuid);

if (editForm.role !== editingMember.role) {
  await supabase.from('tenant_users').update({ role: editForm.role })
    .eq('tenant_id', tenantId)
    .eq('user_id', editingMember.user_id);
}
```

### 7. Drawer UI Layout

Replace the two name inputs with the correct fields. Add imports for `Switch`, `ExternalLink`, `useNavigate`, and `Separator`:

```
┌──────────────────────────────────────────────┐
│  [Avatar]  Jane Smith                        │
│            jane@example.com                  │
│            Member since 3 Jan 2025           │
├──────────────────────────────────────────────┤
│  Position (Job Title)  [__________________]  │
│  Phone                 [__________________]  │
│  Role                  [Primary Contact ▼]   │
│  Inactive              [ Toggle ]            │
├──────────────────────────────────────────────┤
│  [↗ View Full Profile]                       │
├──────────────────────────────────────────────┤
│  ─── Login Information ──────────────────    │
│  Total Logins    12                          │
│  Last Login      14 Feb 2026                 │
└──────────────────────────────────────────────┘
│  [Cancel]                  [Save Changes]    │
```

The toggle uses the existing `Switch` component (`import { Switch } from '@/components/ui/switch'`). When `disabled = true` the label shows "Inactive"; when `false` it shows "Active".

The "View Full Profile" button uses `useNavigate` to go to `/user-profile/:uuid`.

The login stats section is a visually separated read-only block — two rows of label + value with a muted text style.

---

## Files Changed

- **`src/components/client/TenantUsersTab.tsx`** only
  - Add imports: `Switch`, `ExternalLink`, `Separator`, `useNavigate`
  - Expand `TenantUser` interface
  - Update `fetchMembers` select query
  - Add `drawerStats` state + `fetchDrawerStats` function
  - Replace `editForm` state (remove names, add phone/job_title/disabled)
  - Update `openEditDrawer` to populate new fields
  - Update `handleSaveEdit` to persist correct fields
  - Replace drawer body UI with the correct 4 fields + "View Full Profile" + login info footer

No database migrations required. All columns (`phone`, `job_title`, `disabled`, `last_sign_in_at`) already exist on `public.users`.
