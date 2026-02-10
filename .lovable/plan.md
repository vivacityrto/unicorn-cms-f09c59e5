

## Fix: TGA Data Display Filter Is Hiding Current Scope Items

### Problem

The current display filter in `useTgaRtoData.tsx` uses `endDate >= today` to determine what to show. This is **incorrect** for TGA data. In TGA's scope API:

- `status` = "Current" means the item is actively on the RTO's scope
- `endDate` is metadata about the scope registration period, NOT an expiry date
- Many "Current" items have an `endDate` in the past but are still valid

**Impact on tenant 7512 (RTO 91110):**

| Scope Type | Total Current | Shown (endDate filter) | Hidden incorrectly |
|---|---|---|---|
| Training Packages | 20 | 18 | 2 |
| Skillsets | 93 | 62 | 31 |
| Units | 594 | 464 | 130 |
| Qualifications | 0 | 0 | 0 (none are Current) |

The UI shows Quals(0), Skills(33), Units(264), Packages(3) -- far less than what TGA actually reports.

### Solution

Replace the `endDate`-based filter with a `status`-based filter. Show items where `status` equals "Current" (matching TGA's own display logic). Also show "Superseded" items that are still technically on scope if desired, using the colour coding already in place.

### Changes Required

**File: `src/hooks/useTgaRtoData.tsx`** (single change)

Replace the `isOnScope` function (around lines 322-329):

```typescript
// BEFORE (broken):
const isOnScope = (item: any) => {
  const endDate = item.tga_data?.endDate;
  if (!endDate) return true;
  return endDate >= today;
};

// AFTER (correct):
const isOnScope = (item: any) => {
  const status = (item.status || '').toLowerCase();
  // Show Current items (active on scope) and exclude Deleted/Non-current
  // Superseded items remain visible as they may still be on scope
  return status === 'current' || status === 'superseded';
};
```

This aligns Unicorn's display with what TGA shows on training.gov.au: all items that are part of the RTO's scope, colour-coded green (Current) and red (Superseded).

No edge function or database changes required -- the data is already correct in the database.
