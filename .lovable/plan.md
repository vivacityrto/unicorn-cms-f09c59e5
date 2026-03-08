

## Fix: Renewal Stage Status Pre-check Is Too Strict

**Problem**: The validation query filters on `status_id.is.null,status_id.eq.0`. Per the legacy status mapping, `0 = 'Not Started'` is a valid assigned status. Only `NULL` means no status has been selected.

**Fix** (`src/components/client/ClientPackagesTab.tsx`, line 515):
Remove the `status_id.eq.0` condition, keeping only `status_id.is.null`.

```typescript
// Before
.or('status_id.is.null,status_id.eq.0');

// After
.is('status_id', null);
```

Single line change, one file.

