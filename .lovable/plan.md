## Objective
Switch `TenantUsersPreviewCard` from the legacy `role` column to the canonical `relationship_role` column to eliminate duplicate "Primary" badges.

## Changes to `src/components/client/TenantUsersPreviewCard.tsx`

1. **Query** (line 39):  
   Change `role` to `relationship_role` in the `.select(...)` string.

2. **Interface** (line 17):  
   Rename `role: string` to `relationship_role: string` in `PreviewUser`.

3. **Data mapping** (line 48):  
   Change `role: m.role || 'child'` to `relationship_role: m.relationship_role || 'user'`.

4. **`getRoleBadge` function** (lines 83-86):  
   Replace with a switch mapping all four `relationship_role` values:
   - `primary_contact` → "Primary" badge (variant "default")
   - `secondary_contact` → "Secondary" badge (variant "secondary")
   - `academy_user` → "Academy" badge (variant "outline")
   - default → "User" badge (variant "outline")

5. **Render call** (line 139):  
   Change `getRoleBadge(u.role)` to `getRoleBadge(u.relationship_role)`.

## What does NOT change

- No other files
- No database changes
- All other component logic (query, layout, avatar, phone, count) remains untouched

## Verification

- Build passes without TypeScript errors.
- Component renders correct badges for `primary_contact`, `secondary_contact`, `academy_user`, and default user roles.