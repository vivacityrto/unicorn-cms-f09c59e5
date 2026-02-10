

## Plan: Remove Registration-End Fallback, Persist TGA endDate, Add Teach-Out Classification

### Current State

The system is **mostly correct already**:
- `tenant_rto_scope` stores scope items with the full TGA raw item in the `tga_data` JSONB column
- The UI reads `end_date` from `item.tga_data?.endDate` -- this IS the TGA scope end date, not the registration end date
- There is no registration-end fallback in the scope item mapping
- The `persist_tga_scope_items` RPC stores the raw TGA response as `tga_data`, preserving the original `endDate`

**What needs changing**: The `isCurrent` filter currently drops ALL non-current items, including "Superseded" items that have a future end date (teach-out period). The user wants a `scope_state` classification and to persist teach-out items too.

---

### 1. Edge Function: Add Teach-Out Classification

**File: `supabase/functions/tga-rto-sync/index.ts`**

Replace the simple `isCurrent` filter (line 17) with a two-tier filter that keeps both Current and teach-out items:

```text
const normStatus = (s: any) => String(s ?? "").trim().toLowerCase();

function classifyScopeState(item: any): "current" | "teach_out" | null {
  const usage = normStatus(item.usageRecommendation ?? item.status);
  const endDateStr = item.endDate ?? null;

  if (usage === "current") return "current";

  if (usage === "superseded" && endDateStr) {
    const endDate = new Date(endDateStr);
    if (!isNaN(endDate.getTime()) && endDate >= new Date()) {
      return "teach_out";
    }
  }

  return null; // drop this item
}
```

In the filtering loop (lines 184-190), replace `items.filter(isCurrent)` with:
- Classify each item using `classifyScopeState`
- Keep items where result is `"current"` or `"teach_out"`
- Inject `scope_state` into the item before persistence so it lands in `tga_data`

This means items with `status: "Superseded"` but `endDate` in the future are kept and tagged `scope_state: "teach_out"`.

### 2. Edge Function: Ensure endDate Is Never Overwritten

Confirm (no change needed): The `persist_tga_scope_items` RPC stores `_item` (the raw TGA JSON) as `tga_data`. The `endDate` field comes straight from TGA. There is no registration-end fallback anywhere in the scope persistence path.

The `registration_end_date` is only stored on `tenant_profile` and `tga_rto_summary` for the RTO-level registration period -- completely separate from scope item end dates.

### 3. UI Hook: Update isOnScope to Include Teach-Out

**File: `src/hooks/useTgaRtoData.tsx`** (lines 396-399)

Change:
```typescript
const isOnScope = (item: any) => {
  const status = (item.status || '').trim().toLowerCase();
  return status === 'current';
};
```

To:
```typescript
const isOnScope = (item: any) => {
  const scopeState = item.tga_data?.scope_state;
  if (scopeState === 'current' || scopeState === 'teach_out') return true;
  // Fallback for items persisted before scope_state was added
  const status = (item.status || '').trim().toLowerCase();
  return status === 'current';
};
```

### 4. UI: End Date Column Already Correct

The UI tables already render `end_date` which is mapped from `item.tga_data?.endDate` in the hook (lines 412, 428, 444, 459, 474). This IS the TGA scope end date. No change needed.

**No registration end date is ever shown in scope tables.** The "Registration End" field only appears in the Summary section header, correctly sourced from `tga_rto_summary.registration_end_date`.

### 5. Add scope_state to Debug Panel (if it exists)

**File: `src/components/client/ClientIntegrationsTab.tsx`**

In each scope table, the `Usage recommendation` / `Status` column already shows the TGA status. To surface `scope_state`, add a visual indicator:
- Items with `scope_state === "teach_out"` get an amber "Teach-out" badge next to the status pill
- Items with `scope_state === "current"` continue showing the green "Current" badge

### Files to Modify

| File | Change |
|---|---|
| `supabase/functions/tga-rto-sync/index.ts` | Replace `isCurrent` with `classifyScopeState`, inject `scope_state` into items before persist, keep teach-out items |
| `src/hooks/useTgaRtoData.tsx` | Update `isOnScope` to accept `current` and `teach_out` scope states |
| `src/components/client/ClientIntegrationsTab.tsx` | Add amber "Teach-out" badge for items with `scope_state === "teach_out"` |

### No Migration Needed

The `scope_state` is stored inside `tga_data` JSONB -- no schema change required. A re-sync will populate it for all items.

### Expected Behaviour After Re-Sync

- Items with TGA status "Current" get `scope_state: "current"`, show green badge, display TGA `endDate`
- Items with TGA status "Superseded" + future `endDate` get `scope_state: "teach_out"`, show amber badge, display TGA `endDate`
- Items with "Superseded" + past `endDate` or null are dropped (not persisted)
- End Date column always shows the TGA-provided date, never the RTO registration end
- On RTO renewal/re-sync, all end dates update to reflect the latest TGA values

