

## Fix: Display Package Name in Add Time Dialog

### Problem
The query to the `packages` table selects a non-existent `code` column, causing the lookup to fail silently. The dialog falls back to showing `Package #ID` instead of the real name.

### Solution
One file change in `src/components/client/AddTimeDialog.tsx`:

1. **Fix the packages query** -- change `.select('id, name, code')` to `.select('id, name, package_type')`
2. **Filter active instances properly** -- update the `package_instances` query to also check `is_active = true` alongside `is_complete = false`
3. **Fix is_kickstart detection** -- replace `(pkg?.code || '').toLowerCase().includes('kickstart')` with a check on `package_type` or name prefix (e.g., `pkg?.package_type === 'kickstart'` or name starts with "KS")

### Technical Detail

**Current (broken):**
```typescript
// package_instances query - missing is_active filter
.eq('is_complete', false)

// packages query - 'code' column doesn't exist
.select('id, name, code').in('id', pkgIds)

// kickstart detection - references non-existent field
is_kickstart: (pkg?.code || '').toLowerCase().includes('kickstart')
```

**Fixed:**
```typescript
// package_instances query - filter active + not complete
.eq('is_complete', false)
.eq('is_active', true)

// packages query - correct columns
.select('id, name, package_type').in('id', pkgIds)

// kickstart detection - use package_type or name
is_kickstart: (pkg?.package_type || '').toLowerCase() === 'kickstart'
```

This is a single-file fix with three small edits on lines ~90, ~99, and ~109 of `AddTimeDialog.tsx`.

