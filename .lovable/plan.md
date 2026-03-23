

## Fix: RTO ID prefix search for folder resolution

### Problem
The `resolve-tenant-folder` edge function uses Graph's full-text `search(q='91020')` API. This can return noisy results and doesn't reliably do prefix matching. Folders are named like `91020 - Company Name`, so searching by RTO ID prefix (e.g., `91020`) should list root-level children and filter by name prefix.

### Changes

#### 1. `supabase/functions/resolve-tenant-folder/index.ts` — Replace Graph search with children listing + prefix filter

**Priority 2 block (lines 280-298):** Instead of `search(q='{rto_id}')`, list root children and filter folders whose name starts with the RTO ID:

```typescript
// Priority 2: List root children and filter by RTO ID prefix
if (tenant.rto_id && candidates.length === 0) {
  const rtoPrefix = tenant.rto_id.trim();
  let nextUrl: string | null = `/drives/${driveId}/root/children?$select=id,name,webUrl,folder&$top=200&$filter=startsWith(name,'${rtoPrefix}')`;
  
  while (nextUrl && candidates.length < 10) {
    const resp = await graphGet<{ value: DriveItem[]; '@odata.nextLink'?: string }>(nextUrl);
    if (!resp.ok) break;
    for (const item of (resp.data.value || [])) {
      if (item.folder && !candidates.some(c => c.item_id === item.id)) {
        candidates.push({
          item_id: item.id,
          name: item.name,
          web_url: item.webUrl,
          match_type: 'rtoid',
          confidence: 'high',
        });
      }
    }
    nextUrl = resp.data['@odata.nextLink'] || null;
  }
}
```

Note: Graph's `$filter=startsWith(name,'91020')` on drive children is the correct way to do prefix matching. If the Graph API doesn't support `$filter` on children (some drives don't), we fall back to listing all children and filtering in code:

```typescript
// Fallback: list children, filter in-memory by prefix
const resp = await graphGet<{ value: DriveItem[] }>(
  `/drives/${driveId}/root/children?$select=id,name,webUrl,folder&$top=500`
);
if (resp.ok) {
  for (const item of (resp.data.value || [])) {
    if (item.folder && item.name.startsWith(rtoPrefix) && !candidates.some(c => c.item_id === item.id)) {
      candidates.push({ ... });
    }
  }
}
```

We'll implement the `$filter` approach first, with a try/catch fallback to the in-memory filter if the API rejects the filter.

#### 2. Redeploy the edge function

After updating the code, redeploy `resolve-tenant-folder`.

### Files
| File | Change |
|------|--------|
| `supabase/functions/resolve-tenant-folder/index.ts` | Replace search API with children listing + RTO prefix filter |

