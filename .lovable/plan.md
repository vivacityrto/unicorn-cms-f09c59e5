
# Fix: Mission Control Not Appearing After Save

## Problem Summary

After creating and saving a Superhero Mission Control (V/TO), the "Current Plan" view shows "No Mission Control Created Yet" even though the data was successfully saved to the database.

**Root Cause Analysis:**

The network request shows the POST succeeded with status 201, but the saved data has `tenant_id: null`. This happens because:

1. **VtoEditor.tsx (line 56)** saves with `tenant_id: profile?.tenant_id!`
2. Angela (Super Admin) has `tenant_id: null` in her profile - this is correct for Vivacity team users
3. **EosVto.tsx (lines 36, 53)** queries filter by `.eq('tenant_id', profile?.tenant_id!)`
4. **EosVto.tsx (lines 43, 58)** disables queries when `!profile?.tenant_id`

The result: VTO saved with `null` tenant, but query looking for `null` match won't work properly.

**Correct Pattern:**

EOS is Vivacity-internal only. All EOS data should use `VIVACITY_TENANT_ID = 6372` (the system tenant), not `profile?.tenant_id`. This pattern is already established in:
- `useVivacityTeamUsers.tsx` - exports `VIVACITY_TENANT_ID` constant
- `useClientImpact.tsx` - uses 6372 for EOS data
- `IDSMasterPanel.tsx` - uses 6372 for EOS data

---

## Implementation Plan

### 1. Update EosVto.tsx - Fix Query to Use System Tenant

**File:** `src/pages/EosVto.tsx`

**Changes:**
- Import `VIVACITY_TENANT_ID` from `useVivacityTeamUsers`
- Update both queries to use `VIVACITY_TENANT_ID` instead of `profile?.tenant_id`
- Update `enabled` conditions to always run for authenticated users (EOS pages are already protected by route guards)

```tsx
// Before (lines 31-44)
const { data: activeVto, isLoading } = useQuery({
  queryKey: ['eos-vto-active', profile?.tenant_id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('eos_vto')
      .select('*')
      .eq('tenant_id', profile?.tenant_id!)
      ...
  },
  enabled: !!profile?.tenant_id,
});

// After
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';

const { data: activeVto, isLoading } = useQuery({
  queryKey: ['eos-vto-active', VIVACITY_TENANT_ID],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('eos_vto')
      .select('*')
      .eq('tenant_id', VIVACITY_TENANT_ID)
      ...
  },
  enabled: !!profile,  // Just need authenticated user
});
```

Same change for the `vtoVersions` query (lines 47-59).

### 2. Update VtoEditor.tsx - Fix Save to Use System Tenant

**File:** `src/components/eos/VtoEditor.tsx`

**Changes:**
- Import `VIVACITY_TENANT_ID` from `useVivacityTeamUsers`
- Update the upsert mutation to use `VIVACITY_TENANT_ID` instead of `profile?.tenant_id`

```tsx
// Before (lines 54-68)
const upsertData: Record<string, unknown> = {
  tenant_id: profile?.tenant_id!,
  ...
};

// After
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';

const upsertData: Record<string, unknown> = {
  tenant_id: VIVACITY_TENANT_ID,
  ...
};
```

### 3. Fix Existing Broken Data

**Database update needed** to fix the VTO that was just created with `tenant_id: null`:

```sql
UPDATE eos_vto 
SET tenant_id = 6372 
WHERE tenant_id IS NULL;
```

This will ensure the recently saved Mission Control becomes visible immediately.

---

## Technical Details

### Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/EosVto.tsx` | Edit | Use `VIVACITY_TENANT_ID` for queries |
| `src/components/eos/VtoEditor.tsx` | Edit | Use `VIVACITY_TENANT_ID` for saves |
| SQL migration | Create | Fix existing null tenant_id records |

### Query Key Change

The query key changes from `['eos-vto-active', profile?.tenant_id]` to `['eos-vto-active', VIVACITY_TENANT_ID]`. This is safe because:
- EOS pages are Vivacity-internal only
- The constant `6372` never changes
- Cache invalidation in VtoEditor already invalidates by prefix `['eos-vto-active']`

### Why Not Use `useSystemTenantId()` Hook?

While there is a `useSystemTenantId()` hook that fetches the tenant ID via RPC, using the constant `VIVACITY_TENANT_ID = 6372` is preferred because:
1. It avoids an extra async call
2. The system tenant ID never changes
3. This pattern is already used elsewhere in the codebase
4. Simpler code with fewer loading states

---

## Acceptance Criteria

1. Create a new Mission Control - it saves with `tenant_id: 6372`
2. Return to Current Plan view - the saved Mission Control appears
3. Edit an existing Mission Control - updates work correctly
4. Version History shows all previous versions
5. Super Admins with null `profile.tenant_id` can fully use Mission Control

---

## Risk Assessment

**Low risk** - This follows established patterns already in use for other EOS features.

**No breaking changes** - Existing VTOs with `tenant_id: 319` or `111` will need manual migration to 6372, but the immediate fix focuses on the null case and future saves.
