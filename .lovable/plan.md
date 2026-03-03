

## Add "Assistant" to User Level Options

Currently, three levels exist: **Administrator**, **Team Leader**, and **General**. This plan adds **Assistant** as a fourth level across all relevant files.

---

### 1. Update TeamUsers level filter and badge

**File:** `src/pages/TeamUsers.tsx`

- Add `{ value: 'Assistant', label: 'Assistant' }` to the `SUPERADMIN_LEVELS` array.
- Add an `'Assistant'` case to `getLevelBadge()` with a distinct badge colour (e.g. blue).

### 2. Update the edge function auto-derivation (if needed)

**File:** `supabase/functions/update-user-role/index.ts`

- Currently, `superadmin_level` is auto-set based on role/type combinations. "Assistant" is not tied to a specific role combo, so the logic needs to also accept an explicit `superadmin_level` from the request body (so admins can set it manually).
- If `superadmin_level` is explicitly provided in the request, use that value instead of deriving it.

### 3. Redeploy edge function

Deploy `update-user-role` after the change.

---

### Summary

| File | Change |
|------|--------|
| `src/pages/TeamUsers.tsx` | Add "Assistant" to `SUPERADMIN_LEVELS` array and `getLevelBadge()` switch |
| `supabase/functions/update-user-role/index.ts` | Accept explicit `superadmin_level` from request body |

