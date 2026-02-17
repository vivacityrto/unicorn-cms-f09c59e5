

## Show Primary Contact in Tenant Detail Header

### What
Add the primary contact from `tenant_users` to the header card on the Tenant Detail page, displayed to the right of the existing CSC/Liaison Officer info area -- specifically in the gradient header section (lines 508-561) next to the tenant name.

### Where it appears
In the header card's gradient bar, after the tenant name/company info on the left side, we'll add a "Primary Contact" chip showing the user's name (and optionally email). This sits naturally alongside the existing layout.

### How

**File: `src/pages/TenantDetail.tsx`**

1. Add state for the primary contact:
   - `primaryContactName`, `primaryContactEmail`, `primaryContactAvatar`

2. In the `fetchTenantData` function, after existing data fetching, query:
   ```sql
   SELECT user_id FROM tenant_users
   WHERE tenant_id = :tenantId AND primary_contact = true
   ORDER BY created_at ASC
   LIMIT 1
   ```
   Then fetch the user's name/email/avatar from the `users` table using that `user_id`.

3. In the header card gradient section (around line 525-529, after the company name row), add a new line showing:
   ```
   [User icon] Primary Contact: Jane Smith
   ```
   Styled with `text-white/70` to match the existing "Building2 + company name" line. If no primary contact is set, show "No primary contact" in a muted style.

### Layout in the header

```text
+-------------------------------------------------------+
| [Avatar]  Hello, Contact Name                         |
|           [Building] Company Name                      |
|           [User] Primary Contact: Jane Smith           |
|                                          [social icons]|
+-------------------------------------------------------+
```

### Edge cases
- No primary contact set: show "No primary contact" in muted text
- Multiple primary contacts (data issue): `LIMIT 1` with `ORDER BY created_at ASC` picks the first one
- Primary contact user deleted from users table: gracefully show nothing

### Files changed
- `src/pages/TenantDetail.tsx` only
