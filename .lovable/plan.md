

## Fix: TGA Scope Sync Missing Current Training Products

### Root Cause

The edge function filters scope items using `item.isImplicit !== true`, which removes **902 out of 925 items** -- including all current qualifications like BSB40920, CHC30125, CHC33021, etc.

In the TGA API, `isImplicit` means the item is inherited from a training package on the RTO's scope. However, training.gov.au **still displays these items** on the RTO's scope page. They are legitimate scope items that clients need to see.

The current result: only 23 non-implicit (all old/superseded) items are kept, while 902 items including all current qualifications are discarded.

### Fix

**File: `supabase/functions/tga-rto-sync/index.ts` (~line 155-159)**

Remove the `isImplicit` filter so all scope items are persisted. The database already stores `tga_data` (the full raw item) so the implicit flag is preserved for reference if needed.

Change:
```text
const explicitItems = result.items.filter((item: any) => item.isImplicit !== true);
```

To:
```text
const explicitItems = result.items;
```

Update the log message accordingly to reflect that all items are now included.

### Expected Result

After re-syncing RTO 1915:
- All 925 scope items will be persisted (was 23)
- Current qualifications (BSB40920, BSB50820, CHC30125, CHC30221, CHC33021, etc.) will appear
- Status values will correctly show "Current", "Superseded", and "Non-current" as returned by TGA
- Matches what training.gov.au displays

### Post-Fix Steps

1. Deploy the updated edge function
2. Trigger a re-sync for tenant 7500 (RTO 1915) to pull all items
3. Verify the Quals tab shows the correct mix of Current and Superseded items

