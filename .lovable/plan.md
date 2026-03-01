
# Stage 6: TGA Snapshot Linkage -- Final Verified Plan

## Verification Summary

All claims in this plan have been verified against the live database schema and current source code:

- **Bug confirmed**: Line 233 of `deliver-governance-document/index.ts` uses `.order("fetched_at", ...)` but `tga_rto_snapshots` has no `fetched_at` column -- only `created_at`. This causes unpredictable snapshot selection.
- **Schema confirmed**: `governance_document_deliveries` already has a `snapshot_id` (uuid) column -- no migration needed.
- **Schema confirmed**: `tga_rto_snapshots` columns are: `id`, `tenant_id`, `rto_id`, `source_url`, `raw_sha256`, `payload`, `created_at`.
- **Audit log fix from Stage 5 confirmed**: Lines 489-505 now correctly use the `metadata` column.
- **Delivery dialog confirmed**: `runDeliveryLoop` currently does not pass `snapshot_id` to the edge function (lines 244-248).
- **Delivery history confirmed**: Currently enriches with tenant names, version numbers, and user names, but does not include snapshot data.

No conflicts with existing functionality. No database migrations required.

---

## Implementation Plan

### Step 1: Fix `fetched_at` to `created_at` in Edge Function

**File**: `supabase/functions/deliver-governance-document/index.ts`
**Line**: 233

Change `.order("fetched_at", { ascending: false })` to `.order("created_at", { ascending: false })`.

Single-line fix. Restores correct "latest snapshot" ordering for idempotency checks.

### Step 2: Accept Optional `snapshot_id` Parameter in Edge Function

**File**: `supabase/functions/deliver-governance-document/index.ts`

At line 196, add `snapshot_id` to the destructured body:
```
const { tenant_id, document_version_id, allow_incomplete, snapshot_id: pinned_snapshot_id } = body;
```

At lines 228-237, if `pinned_snapshot_id` is provided, skip the snapshot query and use it directly:
```
let snapshotId: string | null;
if (pinned_snapshot_id) {
  snapshotId = pinned_snapshot_id;
} else {
  const { data: latestSnapshot } = await supabase
    .from("tga_rto_snapshots")
    .select("id")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  snapshotId = latestSnapshot?.id || null;
}
```

Backward-compatible -- omitting the parameter preserves current behaviour. This affects the idempotency check (line 248) and the delivery record's `snapshot_id` column, but does NOT change merge field resolution (which uses `v_tenant_merge_fields`).

### Step 3: Pre-Fetch and Pin Snapshot IDs in Delivery Dialog

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

At the start of `runDeliveryLoop` (after line 218, before the for-loop):

```typescript
// Pre-fetch latest snapshot per tenant for batch consistency
const { data: snapshots } = await supabase
  .from('tga_rto_snapshots')
  .select('id, tenant_id, created_at')
  .in('tenant_id', tenantIds)
  .order('created_at', { ascending: false });

const snapshotMap = new Map<number, { id: string; created_at: string }>();
for (const s of snapshots || []) {
  if (!snapshotMap.has(s.tenant_id)) {
    snapshotMap.set(s.tenant_id, { id: s.id, created_at: s.created_at });
  }
}
```

Then in the edge function invocation body (line 244-248), add:
```
snapshot_id: snapshotMap.get(tenantId)?.id,
```

Tenants without a snapshot naturally get `undefined` (omitted from body), preserving fallback behaviour in the edge function.

### Step 4: Add Snapshot Staleness Indicators to Dialog

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

Add a query alongside existing tenant data fetching that retrieves the latest snapshot `created_at` per eligible tenant. In the tenant list UI:

- No indicator if snapshot exists and is less than 90 days old
- Amber clock icon with tooltip "Snapshot is X days old" if 90-180 days old
- Red alert icon with tooltip "No TGA snapshot available" if no snapshot exists
- Summary line near the top: "X tenants missing TGA snapshot" (only shown if X > 0)

These are informational only -- they do not block delivery.

### Step 5: Include Snapshot IDs in Batch Audit Metadata

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

In the batch audit record (lines 281-295), add two fields to the `metadata` object:
- `snapshot_ids`: Object mapping tenant_id to snapshot_id (from the `snapshotMap`)
- `tenants_without_snapshot`: Array of tenant IDs that had no snapshot

This provides full audit traceability for each batch.

### Step 6: Show Snapshot Date in Delivery History

**File**: `src/components/governance/GovernanceDeliveryHistory.tsx`

The existing query already follows an enrichment pattern (tenantMap, versionMap, userMap). Add one more:

- Collect unique non-null `snapshot_id` values from delivery records
- Fetch their `created_at` from `tga_rto_snapshots`
- Build a `snapshotDateMap` using the same Map pattern
- Add a "Snapshot" column to the table showing the formatted date (e.g., "15 Feb 2026"), or "N/A" if null

---

## What This Plan Does NOT Change

| Item | Reason |
|------|--------|
| `v_tenant_merge_fields` view | No changes needed. The view correctly resolves the latest snapshot for merge field data. Snapshot pinning is for idempotency and audit records only. |
| Database schema | No new tables or columns. Existing `snapshot_id` on deliveries and `metadata` on audit log are sufficient. |
| `GovernanceTailoringHealth` | Unchanged -- reads from `v_tenant_merge_fields`. |
| Edge function merge/DOCX logic | Untouched. Only snapshot lookup and parameter parsing change. |
| RLS policies | No changes. `tga_rto_snapshots` already has read access for authenticated users. |
| Stage 5 features | Throttling, cancellation, retry, and batch audit all remain intact. Snapshot pinning slots in alongside them. |

---

## Implementation Sequence

| Order | Task | Scope |
|-------|------|-------|
| 1 | Fix `fetched_at` to `created_at` | Edge function (1 line) |
| 2 | Accept optional `snapshot_id` parameter | Edge function |
| 3 | Pre-fetch and pin snapshot IDs before delivery loop | Frontend |
| 4 | Add snapshot staleness indicators to dialog | Frontend |
| 5 | Include snapshot IDs in batch audit metadata | Frontend |
| 6 | Show snapshot date in delivery history table | Frontend |

---

## Risk Assessment

- **Zero database migrations** -- no risk to existing data
- **Zero RLS changes** -- existing policies are sufficient
- **Backward-compatible** -- `snapshot_id` parameter is optional; all existing flows work if omitted
- **Column fix is corrective** -- restores intended behaviour with no side effects
- **Staleness indicators are advisory only** -- inform but never block
- **JS deduplication is safe** -- even with 200 tenants, snapshot query returns a manageable number of rows
