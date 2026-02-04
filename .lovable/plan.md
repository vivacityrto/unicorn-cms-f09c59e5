
# Fix: Accountability Seat Not Auto-Populating When Selecting Team Member

## Problem Summary

When editing a Rock and selecting a Team Member Responsible (Angela Connell-Richards), the Accountability Seat field remains empty showing "Select a seat..." even though:
1. Angela holds multiple seats (Operations, Client Experience Team, Angela)
2. The auto-select logic was added in the last change

## Root Cause

The seats query in `RockFormDialog.tsx` filters by `profile?.tenant_id`:

```tsx
// Line 100
.eq('tenant_id', profile?.tenant_id!)
```

Angela (Super Admin) has `tenant_id: null` in her profile, so this query returns **zero seats** because there are no seats with `tenant_id = NULL`. All accountability seats exist under `tenant_id = 6372` (Vivacity system tenant).

**Data Evidence:**
- Angela's profile: `tenant_id: null`, `user_uuid: 611a7972-c465-4b08-8ff4-ebbb5faa14f0`
- Seats exist with `tenant_id: 6372` where Angela is primary owner of 3 seats
- Query with `tenant_id = null` returns 0 seats

The auto-select logic works correctly:
```tsx
if (newOwnerId && seats) {
  const userSeat = seats.find(s => s.primary_owner_id === newOwnerId);
}
```
But `seats` is an empty array, so no seat is found.

---

## Solution

Apply the same pattern used for VTO and other EOS features: use `VIVACITY_TENANT_ID` constant instead of `profile?.tenant_id` for all EOS-internal data queries.

### File: `src/components/eos/RockFormDialog.tsx`

**Changes:**
1. Import `VIVACITY_TENANT_ID` from `useVivacityTeamUsers`
2. Update the seats query to use `VIVACITY_TENANT_ID` instead of `profile?.tenant_id`
3. Update the assignments query similarly
4. Update the clients query similarly (if needed for EOS rocks)
5. Update the rockData `tenant_id` in handleSubmit

```tsx
// Before (line 100, 108)
.eq('tenant_id', profile?.tenant_id!)

// After
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';

.eq('tenant_id', VIVACITY_TENANT_ID)
```

---

## Technical Details

### Changes Required

| Location | Current | Fixed |
|----------|---------|-------|
| Line 14 | (no import) | Add `VIVACITY_TENANT_ID` import |
| Line 90 | `queryKey: ['seats-for-rocks', profile?.tenant_id]` | `queryKey: ['seats-for-rocks', VIVACITY_TENANT_ID]` |
| Line 100 | `.eq('tenant_id', profile?.tenant_id!)` | `.eq('tenant_id', VIVACITY_TENANT_ID)` |
| Line 108 | `.eq('tenant_id', profile?.tenant_id!)` | `.eq('tenant_id', VIVACITY_TENANT_ID)` |
| Line 132 | `enabled: !!profile?.tenant_id && open` | `enabled: !!profile && open` |
| Line 142 | `.eq('tenant_id', profile?.tenant_id!)` | `.eq('tenant_id', VIVACITY_TENANT_ID)` |
| Line 148 | `enabled: !!profile?.tenant_id && open` | `enabled: !!profile && open` |
| Line 206 | `tenant_id: profile?.tenant_id` | `tenant_id: VIVACITY_TENANT_ID` |

### Why This Works

1. EOS (Accountability Chart, Rocks, VTO) is Vivacity-internal only
2. All EOS data belongs to the system tenant (6372)
3. Super Admins and team members often have `tenant_id: null` in their profile
4. This pattern is already established in:
   - `EosVto.tsx` (just fixed)
   - `VtoEditor.tsx` (just fixed)
   - `useClientImpact.tsx`
   - `IDSMasterPanel.tsx`

---

## Expected Behavior After Fix

1. Open Rock edit dialog
2. Select "Angela Connell-Richards" as Team Member Responsible
3. The seats query returns all 7 seats with `tenant_id = 6372`
4. Auto-select logic finds Angela's seat (e.g., "Operations" or "Angela")
5. Accountability Seat field automatically populates

---

## Risk Assessment

**Low risk** - This follows the established pattern used across all EOS features. The change is isolated to the Rock form and uses the proven constant-based approach.
