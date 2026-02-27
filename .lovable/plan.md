

# Fix: Organisation Type Not Persisting on Save

## Problem

The Organisation Type field appears in the Client Profile form but its value is never saved or loaded from the database. Two bugs exist:

1. **Save is skipped**: In `useClientManagement.tsx` line 362, `org_type` is explicitly excluded from the save operation with the comment "org_type is derived from TGA data, not stored on tenants table."
2. **Load ignores stored value**: On load (line 318), `org_type` is set exclusively from TGA-derived data (`tgaOrgType`). It never reads the `org_type` column from `tenant_profile`, even though that column exists.

The `tenant_profile` table already has an `org_type` column -- it just is not being read or written.

## Fix (single file: `src/hooks/useClientManagement.tsx`)

### 1. Load `org_type` from `tenant_profile`

Update the `tenant_profile` select query (line 285) to also fetch `org_type`:

```
.select('phone1, org_type')
```

Update the profile mapping (line 318) to use `tenant_profile.org_type` as the fallback when TGA data is not available:

```
org_type: tgaOrgType || tpResult.data?.org_type || null,
```

This preserves the existing TGA-override behaviour: if TGA is connected and provides an org type, that takes priority. Otherwise, the manually-set value from `tenant_profile` is used.

### 2. Save `org_type` to `tenant_profile`

Replace the skip comment at line 362 with logic to persist `org_type` into `tenant_profile` (alongside the existing `phone1` upsert at lines 374-379). The save block for `tenant_profile` will be expanded to handle both `phone1` and `org_type` in a single upsert when either field is present in the updates.

### Summary of Changes

| What | Where | Change |
|------|-------|--------|
| Fetch org_type | Line 285 | Add `org_type` to tenant_profile select |
| Map org_type on load | Line 318 | Fallback to `tpResult.data?.org_type` |
| Save org_type | Lines 362, 374-379 | Include `org_type` in tenant_profile upsert, remove skip comment |

No database migration needed -- the `tenant_profile.org_type` column already exists.

