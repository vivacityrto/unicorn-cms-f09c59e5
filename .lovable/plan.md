## Goal
Prevent CSCs from selecting `academy_user` roles in the "View Client Portal" picker, since academy-only users cannot access the compliance portal.

## Single-file change
`src/components/client/ViewAsClientButton.tsx`

### 1. Add portal-eligible roles constant
```ts
const PORTAL_ELIGIBLE_ROLES = ["primary_contact", "secondary_contact", "user"];
```

### 2. Derive filtered display options
```ts
const displayOptions = isAcademyMode
  ? actingOptions
  : actingOptions.filter((o) => PORTAL_ELIGIBLE_ROLES.includes(o.relationship_role));
```

### 3. Apply in three places
- **Default selection** (`handleViewClient`): When `mode === "portal" && !isAcademyOnly`, filter `opts` before picking the default.
- **No-users check**: Replace `actingOptions.length === 0` with `displayOptions.length === 0`.
- **Select item list**: Map over `displayOptions` instead of `actingOptions`.

### 4. Update no-users message
For portal mode when no users are available, change the muted text to:
> "No portal-access users on this tenant yet. Academy-only users cannot access the portal."

## What does NOT change
- Academy mode continues to show all users (unchanged).
- `confirmDisabled` logic remains untouched.
- No other files are modified.

## Verification
1. Open portal preview picker for a tenant with `academy_user` members.
2. Confirm `academy_user` entries are hidden from the list.
3. Confirm default selection resolves to the first portal-eligible user.
4. Confirm academy mode still shows all users.
5. Confirm "No portal-access users" message appears when no eligible users exist.