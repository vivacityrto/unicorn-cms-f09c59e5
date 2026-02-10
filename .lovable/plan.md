

## Plan: Store and Display Current-Only TGA Scope Items

### What Changes

Three files need modification. One migration to clean existing data.

---

### 1. Edge Function: Filter to Current Before Persisting

**File: `supabase/functions/tga-rto-sync/index.ts`**

After `categoriseScope()` returns the categorised items (around line 178), add a Current-only filter before persistence:

- Add helper at top of file:
  ```
  const normStatus = (s: any) => String(s ?? "").trim().toLowerCase();
  const isCurrent = (item: any) => normStatus(item.status) === "current";
  ```

- After `categoriseScope(explicitItems)` returns, filter each category to Current-only and log what was dropped:
  ```
  for (const [type, items] of Object.entries(categorised)) {
    const before = items.length;
    categorised[type] = items.filter(isCurrent);
    const dropped = before - categorised[type].length;
    if (dropped > 0) log('info', `Filtered ${type}: kept ${categorised[type].length}, dropped ${dropped} non-current`);
  }
  ```

- Before the persist loop (line ~412), delete ALL existing scope rows for this tenant per scope_type, then insert only the Current-filtered set. This is the "full replace" strategy:
  ```
  // Delete all existing rows for this tenant + scope_type before inserting fresh Current-only
  await supabaseAdmin.from('tenant_rto_scope').delete()
    .eq('tenant_id', tenantIdNum).eq('scope_type', dbType);
  ```

- Update the `categorised` log (line 180) to reflect filtered counts.

- The response payload `scopeCounts` will naturally reflect Current-only since only filtered items are persisted.

### 2. UI Hook: Show Current-Only with Safety Filter

**File: `src/hooks/useTgaRtoData.tsx`**

- Change `isOnScope` (line 395-398) from accepting `current || superseded` to Current-only:
  ```typescript
  const isOnScope = (item: any) => {
    const status = (item.status || '').toLowerCase();
    return status === 'current';
  };
  ```

- The paginated fetch and mismatch banner logic already exist and are correct -- no changes needed there.

### 3. UI: No Structural Changes Needed

**File: `src/components/client/ClientIntegrationsTab.tsx`**

- The tab counts, mismatch banner, and table rendering already use the filtered arrays from the hook. No changes needed here beyond what the hook filter change provides.

### 4. Database Migration: Clean Existing Non-Current Rows

A migration to delete all non-current rows from `tenant_rto_scope`:

```sql
DELETE FROM public.tenant_rto_scope
WHERE lower(status) != 'current';
```

This removes ~1,605 rows for tenant 7512 (33 superseded quals, 106 superseded/deleted units, etc.) and any non-current rows for other tenants.

---

### Expected Results After Sync for Tenant 7512

| Tab | Count |
|---|---|
| Qualifications | 0 (none are Current on TGA) |
| Skill Sets | 93 |
| Units | 594 |
| Courses | 0 (both are Non-current) |
| Training Packages | 20 |
| **Total** | **707** |

These will match sync toast, tab badges, and DB counts exactly.

### Files Modified

| File | Change |
|---|---|
| `supabase/functions/tga-rto-sync/index.ts` | Add `isCurrent` filter, delete-before-insert per scope_type |
| `src/hooks/useTgaRtoData.tsx` | Change `isOnScope` to Current-only |
| New migration SQL | Delete all non-current rows from `tenant_rto_scope` |

