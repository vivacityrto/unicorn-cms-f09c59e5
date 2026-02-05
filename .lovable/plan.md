

# Fix: Meeting Scheduling RPC Ambiguity (`create_meeting_from_template`)

## Problem Summary

When scheduling an EOS meeting, the RPC call fails with:

```
Could not choose the best candidate function between:
public.create_meeting_from_template(p_tenant_id => bigint, ...)
public.create_meeting_from_template(p_tenant_id => integer, ...)
```

**Root Cause**: Two overloaded PostgreSQL functions exist with the same name but different parameter types for `p_tenant_id`:

| Function 1 | Function 2 |
|------------|------------|
| `p_tenant_id bigint` | `p_tenant_id integer` |

When the frontend sends `p_tenant_id: 6372` (a JavaScript number), PostgREST cannot determine which function to call because both `integer` and `bigint` are valid matches for a numeric value.

---

## Investigation Findings

### Database Functions (Confirmed)
Two functions found in `pg_proc`:

```text
1. p_tenant_id bigint, p_agenda_template_id uuid, ... (8 params)
2. p_tenant_id integer, p_agenda_template_id uuid, ... (8 params)
```

### Frontend Code
- **File**: `src/components/eos/MeetingScheduler.tsx` (line 75)
- **Constant**: `VIVACITY_TENANT_ID = 6372` (from `src/hooks/useVivacityTeamUsers.tsx`)
- **RPC Call**:
```typescript
await supabase.rpc('create_meeting_from_template', {
  p_tenant_id: VIVACITY_TENANT_ID,  // JavaScript number, ambiguous to Postgres
  ...
});
```

### Target Table Column Type
- `eos_meetings.tenant_id` is `bigint` (int8)

---

## Solution

### Strategy
Drop the duplicate `integer` overload and keep only the `bigint` version (canonical signature). This is the safest approach since:
1. The target table uses `bigint`
2. `bigint` is a superset of `integer`
3. No data loss or type coercion issues

---

## Implementation Steps

### Step 1: Database Migration

Drop the `integer` overload function:

```sql
-- Drop the integer overload (exact signature match required)
DROP FUNCTION IF EXISTS public.create_meeting_from_template(
  integer,      -- p_tenant_id
  uuid,         -- p_agenda_template_id
  text,         -- p_title
  timestamp with time zone,  -- p_scheduled_date
  integer,      -- p_duration_minutes
  uuid,         -- p_facilitator_id
  uuid,         -- p_scribe_id
  uuid[]        -- p_participant_ids
);

-- Also drop any legacy overload with different parameter order if exists
DROP FUNCTION IF EXISTS public.create_meeting_from_template(
  integer,      -- p_tenant_id
  text,         -- p_title
  uuid,         -- p_agenda_template_id
  timestamp with time zone,
  integer,
  uuid,
  uuid,
  uuid[]
);
```

### Step 2: Frontend Patch (Defensive Type Coercion)

Update `src/components/eos/MeetingScheduler.tsx` to explicitly cast the tenant ID as a number:

```typescript
// Line 75-84 - Add explicit Number() cast for safety
const { data, error: meetingError } = await supabase.rpc('create_meeting_from_template', {
  p_tenant_id: Number(VIVACITY_TENANT_ID),  // Explicit cast
  p_agenda_template_id: templateId,
  p_title: title,
  p_scheduled_date: scheduledDate,
  p_duration_minutes: parseInt(duration),
  p_facilitator_id: facilitatorId,
  p_scribe_id: null,
  p_participant_ids: participantIds,
});
```

This ensures consistent type handling even if `VIVACITY_TENANT_ID` were ever changed to a string in the future.

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| New migration SQL | Drop duplicate `integer` function |
| `src/components/eos/MeetingScheduler.tsx` | Add explicit `Number()` cast (lines 76, 90) |

### Verification Query

After migration, run this to confirm only one function exists:

```sql
SELECT p.oid::regproc as signature, 
       pg_get_function_identity_arguments(p.oid) as args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_meeting_from_template';
```

Expected: Only one row with `p_tenant_id bigint`.

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Breaking existing calls | Low | All callers already pass numeric values which work with `bigint` |
| Data loss | None | This is a function signature change, not data modification |
| Rollback | Easy | Function can be recreated if needed |

---

## Testing Plan

After implementation:

1. Navigate to `/eos/meetings`
2. Click "Schedule Meeting"
3. Select template, facilitator, set date/time
4. Click "Schedule Meeting" button
5. Verify meeting is created successfully
6. Check `eos_meetings` table for the new record
7. Test all three meeting types: L10 (Weekly), Quarterly, Annual

---

## Done Criteria

- No "best candidate function" errors when scheduling meetings
- Only one `create_meeting_from_template` function exists in `public` schema
- Meeting scheduling works for Weekly, Quarterly, and Annual templates
- Participants are correctly added to meetings

