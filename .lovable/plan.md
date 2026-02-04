
# Fix: Create Template Not Working

## Problem Summary

When clicking "Create Template" in the Agenda Template Library, nothing happens. The button appears to not respond, and no template is created.

## Root Cause Analysis

The issue is the same `tenant_id: null` pattern that has been fixed in other EOS components. Super Admins have `tenant_id: null` in their profile, but all EOS data belongs to `VIVACITY_TENANT_ID` (6372).

### Location 1: `AgendaTemplateEditor.tsx` (line 117)
```tsx
const handleSave = async () => {
  if (!profile?.tenant_id || !templateName.trim()) return;  // <-- Early return for Super Admins!
```
When a Super Admin clicks "Create Template", this check fails because `profile.tenant_id` is `null`, causing the function to return immediately without doing anything.

### Location 2: `useEosAgendaTemplates.tsx` (multiple lines)
The hook has several issues:
- **Line 17**: `.eq('tenant_id', profile?.tenant_id!)` - Query filters by null, returns nothing
- **Line 26**: `enabled: !!profile?.tenant_id` - Prevents query from running at all
- **Line 46**: `tenant_id: profile?.tenant_id` - Would insert null if it ran
- **Line 94**: `tenant_id: profile?.tenant_id` - Duplicate inserts null
- **Line 125**: `.eq('tenant_id', profile?.tenant_id!)` - Set default uses null

---

## Solution

Apply the same pattern used successfully in `RockFormDialog.tsx`, `VtoEditor.tsx`, and other EOS components: use the `VIVACITY_TENANT_ID` constant (6372) for all EOS data operations.

### File 1: `src/components/eos/AgendaTemplateEditor.tsx`

**Changes:**
1. Import `VIVACITY_TENANT_ID` from `useVivacityTeamUsers`
2. Update `handleSave` validation to check for `profile` (not `profile.tenant_id`)
3. Use `VIVACITY_TENANT_ID` when calling `createTemplate`

```tsx
// Before (line 117)
if (!profile?.tenant_id || !templateName.trim()) return;
// ...
tenant_id: profile.tenant_id,

// After
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
// ...
if (!profile || !templateName.trim()) return;
// ...
tenant_id: VIVACITY_TENANT_ID,
```

### File 2: `src/hooks/useEosAgendaTemplates.tsx`

**Changes:**
1. Import `VIVACITY_TENANT_ID` from `useVivacityTeamUsers`
2. Update all queries to use `VIVACITY_TENANT_ID` instead of `profile?.tenant_id`
3. Update `enabled` conditions to check for `profile` instead of `profile?.tenant_id`
4. Update all inserts to use `VIVACITY_TENANT_ID`

| Line | Current | Fixed |
|------|---------|-------|
| 12 | `queryKey: ['eos-agenda-templates', profile?.tenant_id]` | `queryKey: ['eos-agenda-templates', VIVACITY_TENANT_ID]` |
| 17 | `.eq('tenant_id', profile?.tenant_id!)` | `.eq('tenant_id', VIVACITY_TENANT_ID)` |
| 26 | `enabled: !!profile?.tenant_id` | `enabled: !!profile` |
| 46 | `tenant_id: profile?.tenant_id` | `tenant_id: VIVACITY_TENANT_ID` |
| 94 | `tenant_id: profile?.tenant_id` | `tenant_id: VIVACITY_TENANT_ID` |
| 125 | `.eq('tenant_id', profile?.tenant_id!)` | `.eq('tenant_id', VIVACITY_TENANT_ID)` |

---

## Technical Details

### Why This Works

1. EOS (Accountability Chart, Rocks, VTO, Agenda Templates) is Vivacity-internal only
2. All EOS data belongs to the system tenant (6372)
3. Super Admins and team members often have `tenant_id: null` in their profile
4. This pattern is already established and working in:
   - `EosVto.tsx`
   - `VtoEditor.tsx`
   - `RockFormDialog.tsx`
   - `EosRocks.tsx`
   - `useClientImpact.tsx`
   - `IDSMasterPanel.tsx`

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/eos/AgendaTemplateEditor.tsx` | Import constant, update validation and tenant_id usage |
| `src/hooks/useEosAgendaTemplates.tsx` | Import constant, update all queries and mutations |

---

## Expected Behavior After Fix

1. Open EOS Meetings page
2. Click "Agenda Template Library" or similar
3. Click "Create Template"
4. Fill in template details (name, type, segments)
5. Click "Create Template" button
6. Template is saved successfully with `tenant_id: 6372`
7. Template appears in the library list

---

## Risk Assessment

**Low risk** - This follows the exact same pattern already applied successfully to multiple EOS components. The change is isolated to EOS features and uses the proven constant-based approach.
