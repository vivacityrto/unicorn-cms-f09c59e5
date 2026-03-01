

# Stage 5: Bulk Generation Engine with Throttling -- Final Reviewed Plan

## Audit of Current State

After thorough code review, here is the actual state of the system and issues found:

---

## Issues Found in Existing Implementation (Pre-Stage 5)

### Bug 1: Audit Log Column Mismatch (Critical)
The `deliver-governance-document` edge function (lines 489-505) inserts into `document_activity_log` using column names that **do not exist**:
- Uses `details` -- actual column is `metadata`
- Uses `document_version_id` -- column does not exist on this table

This means **zero audit records** are being written for governance deliveries (confirmed: 0 rows with `activity_type = 'governance_document_delivered'`). The insert silently fails because Supabase returns a non-error response for inserts with unknown columns.

**Fix**: Change `details` to `metadata` and remove `document_version_id` (move it inside the `metadata` JSONB).

### Bug 2: `mergeFieldDefs` Undefined Reference (Low, Separate System)
`bulk-generate-phase-documents` line 236 references `mergeFieldDefs` which is undefined in its fallback path. This is in the package-builder system, not governance, but worth fixing.

### Bug 3: No 429 Retry in Graph Client (Risk at Scale)
`graph-app-client.ts` has zero retry or rate-limit handling. All `fetch()` calls are fire-once. At 20+ tenants, SharePoint API will return HTTP 429 and deliveries will fail.

---

## Stage 5 Implementation Plan

### Step 1: Fix Audit Log Bug in `deliver-governance-document`

**File**: `supabase/functions/deliver-governance-document/index.ts`

Change the audit log insert (lines 489-505):
- Rename `details` to `metadata`
- Move `document_version_id` inside the `metadata` JSONB object
- This restores the compliance audit trail that Stage 4 intended

### Step 2: Add 429 Retry Logic to Graph App Client

**File**: `supabase/functions/_shared/graph-app-client.ts`

Modify the `graphRequest()` function (lines 77-114):
- After `const resp = await fetch(url, init)`, check for HTTP 429
- Read `Retry-After` header (default to 5 seconds if absent)
- Wait and retry up to 3 times with exponential backoff
- Log each retry with `console.warn`
- Also add retry for HTTP 503 (service unavailable) and 504 (gateway timeout)
- Apply the same retry logic to `graphUploadSmall` and `graphUploadSession` which make their own direct `fetch()` calls

This is foundational -- it benefits all SharePoint operations platform-wide.

### Step 3: Add Inter-Request Throttling to Delivery Dialog

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

In the `handleDeliver` function (line 217 loop):
- Add `await new Promise(r => setTimeout(r, 1500))` between each tenant delivery (after each completes, before starting the next)
- Skip delay before the first tenant and after the last
- This prevents burst patterns that trigger Graph API rate limiting

### Step 4: Add Cancellation Support

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

- Add a `useRef` (`cancelledRef`) flag
- Show a "Stop" button during delivery that sets `cancelledRef.current = true`
- Check the flag at the top of each loop iteration; break if set
- Show "Stopped -- X of Y delivered" in the toast
- Already-delivered tenants remain recorded (idempotent)

### Step 5: Add "Retry Failed" Capability

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

After all deliveries complete:
- If any failed, show a "Retry Failed" button alongside the Close button
- Clicking it collects failed tenant IDs, resets their status to `pending`, and re-runs the delivery loop with only those IDs
- Includes the same throttle delay and cancellation support

### Step 6: Add Batch-Level Audit Record

**File**: `src/components/governance/GovernanceDeliveryDialog.tsx`

After the delivery loop completes (including after retry):
- Insert a summary record into `document_activity_log` with:
  - `activity_type: 'governance_bulk_delivery_complete'`
  - `document_id`
  - `metadata`: total count, success count, fail count, list of failed tenant IDs, cancelled flag
  - `actor_user_id`: current user

This provides a single audit trail entry per batch operation.

---

## What This Plan Intentionally Excludes

| Item | Reason |
|------|--------|
| Server-side batch orchestration | Browser-side sequential loop is correct. Each edge function call gets its own timeout budget. Moving to a queue adds complexity without benefit at current scale (<200 tenants). |
| Parallel/concurrent delivery | Would trigger Graph API rate limits faster. Sequential with throttle is safer. |
| WebSocket/Realtime progress | In-memory progress bar works because user stays on the dialog. |
| New database tables | Existing `governance_document_deliveries` and `document_activity_log` are sufficient. |
| Changes to `GovernanceDeliveryHistory` or `GovernanceTailoringHealth` | These are already complete from Stage 4 and working correctly. |

---

## Implementation Sequence

| Order | Task | Scope |
|-------|------|-------|
| 1 | Fix audit log column mismatch in `deliver-governance-document` | Edge function bug fix |
| 2 | Add 429/503/504 retry logic to `graph-app-client.ts` | Shared edge function helper |
| 3 | Add 1.5s throttle delay between deliveries in `GovernanceDeliveryDialog` | Frontend |
| 4 | Add cancellation (Stop button) | Frontend |
| 5 | Add "Retry Failed" button | Frontend |
| 6 | Add batch audit event after loop completes | Frontend |
| 7 | Fix `mergeFieldDefs` in `bulk-generate-phase-documents` (bonus) | Edge function |

---

## Risk Assessment

- **No database schema changes required** -- no migration needed, no risk to existing data
- **No changes to existing delivery logic** -- only additions (throttle, retry, cancel) around the existing loop
- **Graph retry is additive** -- existing behaviour is preserved; retry only activates on 429/503/504
- **Audit fix is corrective** -- restores intended Stage 4 behaviour, no new side effects
- **All changes are backward-compatible** -- existing delivery records, tailoring data, and UI remain untouched

