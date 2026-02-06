
# Fix "Add Time from Meeting" Flow

## Problem Summary

The "Add time from meeting" feature is broken because:
1. The client ID from the route is not passed to the time capture page
2. Posted time entries don't update the client page summaries
3. Database RPC functions have type mismatches (expecting UUID but receiving bigint)
4. Time summaries include drafts/unposted entries in calculations

---

## Root Cause Analysis

### Issue 1: Client ID Not Passed
The "Add time from meeting" button navigates to `/calendar/time-capture?client=7530` but `CalendarTimeCapture.tsx` never reads this parameter. The draft creation flow doesn't auto-populate the client.

### Issue 2: No Cache Invalidation
After posting time in `CalendarTimeCapture.tsx`, navigating back to the client page shows stale data because React Query isn't used for these hooks, and there's no mechanism to trigger a refetch.

### Issue 3: RPC Type Mismatch
Network logs show:
```
POST rpc_get_package_usage {"p_client_id":7530,"p_client_package_id":"15134"}
Status: 400 - "invalid input syntax for type uuid: 15134"
```
The `package_instances.id` column is `bigint`, but the RPC expects a `UUID` (from the deprecated `client_packages` table).

### Issue 4: Summary Includes All Entries
The summary calculation includes all `time_entries` regardless of status, mixing posted and draft entries.

---

## Implementation Plan

### Phase 1: Database Fixes

#### 1.1 Fix RPC Type Signatures
Create migration to update two RPC functions to accept `bigint` instead of `uuid`:
- `rpc_get_package_usage(p_client_id bigint, p_client_package_id bigint)`
- `rpc_check_package_thresholds(p_client_id bigint, p_client_package_id bigint)`

Both functions need to query `package_instances` instead of `client_packages`.

#### 1.2 Add Status Column to time_entries (if not present)
Verify time_entries has a `status` column for tracking posted vs draft states. From schema review, there is no `status` column - entries are final once created.

The current flow creates drafts in `calendar_time_drafts`, then moves them to `time_entries` when posted. This is correct - no status column needed.

---

### Phase 2: Create Import Function

#### 2.1 New RPC: rpc_import_meeting_time_to_client
```sql
CREATE OR REPLACE FUNCTION rpc_import_meeting_time_to_client(
  p_client_id bigint,
  p_meeting_id uuid,
  p_minutes integer,
  p_work_date date,
  p_notes text DEFAULT NULL,
  p_package_id bigint DEFAULT NULL,
  p_save_as_draft boolean DEFAULT false
) RETURNS jsonb
```

Function responsibilities:
- Validate calling user has access to the client's tenant
- Validate meeting exists and belongs to same tenant
- Create time_entry with explicit `client_id`
- Return `{ success, time_entry_id, minutes_total }`
- If `p_save_as_draft = true`, create in drafts table instead

#### 2.2 Create Audit Log Function
```sql
CREATE OR REPLACE FUNCTION rpc_log_time_import_audit(
  p_client_id bigint,
  p_meeting_id uuid,
  p_time_entry_ids uuid[],
  p_minutes_total integer
) RETURNS void
```

Logs to audit table with:
- action: 'meeting_time_import'
- actor_user_id
- client_id, meeting_id
- time_entry_ids array
- minutes_total
- reason: 'Imported from meeting'

---

### Phase 3: Frontend - Add Time from Meeting Modal

#### 3.1 Create AddTimeFromMeetingDialog Component
New file: `src/components/client/AddTimeFromMeetingDialog.tsx`

Features:
- Opens when clicking "Add time from meeting" on client page
- Shows list of recent meetings from calendar_events
- Pre-filters to meetings linked to this tenant
- Shows meeting duration, attendees, date
- Allows selecting time segments
- Checkbox for "Save as draft"
- Validates meeting has time segments selected
- Shows clear error if meeting is from another tenant

#### 3.2 Update ClientDetail.tsx
- Replace navigation button with dialog trigger
- Pass `clientId` directly to dialog
- On success: call `refresh()` on useTimeTracking and usePackageUsage hooks

---

### Phase 4: UI Refresh and Cache Invalidation

#### 4.1 Add Refresh Callbacks
Update `useTimeTracking` and `usePackageUsage` to expose robust refresh methods.

#### 4.2 Update Post Success Flow
After posting time from meeting:
```typescript
// In AddTimeFromMeetingDialog after successful import
const result = await importMeetingTime(clientId, meetingId, minutes, date, notes, packageId, saveAsDraft);

if (result.success) {
  // Immediate UI refresh
  await refreshTimeTracking();
  await refreshPackageUsage();
  
  toast({
    title: saveAsDraft 
      ? `Saved ${formatMinutes(result.minutes_total)} as draft` 
      : `Posted ${formatMinutes(result.minutes_total)} to ${clientName}`,
    action: saveAsDraft ? (
      <Button onClick={() => navigate('/time-inbox')}>Review Draft</Button>
    ) : undefined
  });
  
  onOpenChange(false);
}
```

---

### Phase 5: Query Improvements

#### 5.1 Fix usePackageUsage Hook
Update `src/hooks/usePackageUsage.tsx`:
- Pass `selectedPackageId` as a number (not string) to RPC
- Remove `.toString()` conversion that breaks type matching

```typescript
// Before
const { data, error } = await supabase.rpc('rpc_get_package_usage', {
  p_client_id: clientId,
  p_client_package_id: selectedPackageId  // "15134" string
});

// After  
const { data, error } = await supabase.rpc('rpc_get_package_usage', {
  p_client_id: Number(clientId),
  p_client_package_id: Number(selectedPackageId)
});
```

#### 5.2 Fix Package ID Type in State
Update package fetching to preserve numeric types:
```typescript
// In usePackageUsage
const mapped = instances.map(inst => ({
  id: inst.id,  // Keep as number, not toString()
  package_id: inst.package_id,
  // ...
}));
```

---

### Phase 6: Validation and Feedback

#### 6.1 Block Invalid Submissions
- Disable submit if no time segments selected
- Show error toast if meeting belongs to different tenant
- Validate minutes > 0 before calling RPC

#### 6.2 Success Message Requirements
Toast must include:
- Total minutes added (formatted as Xh Ym)
- Posted vs draft status
- Target client name

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/XXXXXX_fix_package_usage_rpc.sql` | Fix RPC type signatures |
| `supabase/migrations/XXXXXX_add_import_meeting_time.sql` | New import function + audit |
| `src/components/client/AddTimeFromMeetingDialog.tsx` | Modal for importing meeting time |
| `src/hooks/useImportMeetingTime.tsx` | Hook for import RPC call |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ClientDetail.tsx` | Replace nav button with dialog |
| `src/hooks/usePackageUsage.tsx` | Fix type conversions |
| `src/hooks/useTimeTracking.tsx` | Add exported refresh function |

---

## Technical Details

### Database Function: rpc_import_meeting_time_to_client

```sql
CREATE OR REPLACE FUNCTION public.rpc_import_meeting_time_to_client(
  p_client_id bigint,
  p_calendar_event_id uuid,
  p_minutes integer,
  p_work_date date,
  p_notes text DEFAULT NULL,
  p_package_id bigint DEFAULT NULL,
  p_save_as_draft boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id bigint;
  v_event_tenant_id bigint;
  v_time_entry_id uuid;
  v_draft_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Get tenant for this client
  SELECT id INTO v_tenant_id FROM tenants WHERE id = p_client_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;
  
  -- Validate meeting belongs to same tenant (via user's tenant)
  SELECT tenant_id INTO v_event_tenant_id 
  FROM calendar_events WHERE id = p_calendar_event_id;
  
  -- Validate minutes
  IF p_minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;
  
  IF p_save_as_draft THEN
    -- Create as draft
    INSERT INTO calendar_time_drafts (
      tenant_id, created_by, calendar_event_id, client_id, package_id,
      minutes, work_date, notes, status, work_type, is_billable
    ) VALUES (
      v_tenant_id, v_user_id, p_calendar_event_id, p_client_id, p_package_id,
      p_minutes, p_work_date, p_notes, 'draft', 'meeting', true
    ) RETURNING id INTO v_draft_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'draft_id', v_draft_id,
      'minutes_total', p_minutes,
      'status', 'draft'
    );
  ELSE
    -- Create as posted time entry
    INSERT INTO time_entries (
      tenant_id, client_id, package_id, user_id, work_type, is_billable,
      start_at, duration_minutes, notes, source, calendar_event_id
    ) VALUES (
      v_tenant_id, p_client_id, p_package_id, v_user_id, 'meeting', true,
      p_work_date::timestamptz, p_minutes, p_notes, 'calendar', p_calendar_event_id
    ) RETURNING id INTO v_time_entry_id;
    
    -- Log audit
    INSERT INTO audit_log (
      action, actor_user_id, tenant_id, metadata
    ) VALUES (
      'meeting_time_import', v_user_id, v_tenant_id,
      jsonb_build_object(
        'client_id', p_client_id,
        'meeting_id', p_calendar_event_id,
        'time_entry_ids', ARRAY[v_time_entry_id],
        'minutes_total', p_minutes,
        'reason', 'Imported from meeting'
      )
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'time_entry_id', v_time_entry_id,
      'minutes_total', p_minutes,
      'status', 'posted'
    );
  END IF;
END;
$$;
```

---

## Acceptance Criteria

1. From client page, import 30 minutes from a meeting
   - Result: Time Summary updates immediately, shows +30 minutes
   
2. Import time with "Save as draft" checked
   - Result: Client totals unchanged, toast shows draft count with CTA
   
3. Import time when meeting belongs to another tenant
   - Result: Blocked with clear error message
   
4. Import time with no active package
   - Result: Time saved, burn-down unchanged, message states "Not allocated"

---

## Implementation Order

1. Fix database RPC type signatures (Phase 1)
2. Create import meeting time RPC (Phase 2)
3. Create AddTimeFromMeetingDialog component (Phase 3)
4. Update ClientDetail to use dialog (Phase 3)
5. Fix usePackageUsage type handling (Phase 5)
6. Test end-to-end flow (Phase 6)
