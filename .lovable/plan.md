

## Replace "Assigned Consultant" Card with Users Preview Card

The "Assigned Consultant" card on the Overview tab is redundant since the CSC is already shown in the header. Replace it with a compact "Users" card showing tenant members, limited to fit the same card height.

### Changes

**1. Create `TenantUsersPreviewCard` component** (`src/components/client/TenantUsersPreviewCard.tsx`)

A new lightweight card that:
- Fetches tenant members (via `tenant_members` joined with `users`) limited to ~5-6 rows
- Displays each user as a compact row: avatar, name, role badge
- Shows total user count in the card header
- Includes a "View All" link/button that switches to the Users tab
- Matches the height of the Time Summary card beside it

**2. Update `ClientDetail.tsx`**

- Remove `ConsultantAssignmentCard` import and usage from the overview grid
- Import and render `TenantUsersPreviewCard` in its place
- Pass `tenantId` and a callback to switch to the Users tab (`setActiveTab('users')`)

**3. Cleanup**

- The `ConsultantAssignmentCard` component file is kept (not deleted) in case it's referenced elsewhere, but its import is removed from `ClientDetail.tsx`

### Technical Details

The preview card query:
```sql
SELECT tu.user_id, tu.role, u.first_name, u.last_name, u.email, u.avatar_url, u.job_title
FROM tenant_members tu
JOIN users u ON u.user_uuid = tu.user_id
WHERE tu.tenant_id = :tenantId
ORDER BY u.first_name ASC
LIMIT 6
```

The card will use the same `Card`/`CardHeader`/`CardContent` pattern as the adjacent Time Summary card. Each user row will be a flex row with a small avatar (h-8 w-8), name, and a subtle role badge. A "View All Users" button at the bottom navigates to the Users tab.

