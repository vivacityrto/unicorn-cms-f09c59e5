
# Plan: Fix Level 10 Meeting Supabase Errors

## Summary

This plan fixes three categories of Supabase errors in the Level 10 meeting:

1. **Issue Creation Error** - RPC uses `rock_id` but column is `linked_rock_id`
2. **Participants Query Error (400)** - Missing FK constraint from `eos_meeting_participants.user_id` to `public.users`
3. **Query Errors (500s)** - Attendees/Ratings/Outcome confirmations returning errors

---

## Root Cause Analysis

### A) Issue Creation Error

**Error Message:**
```
column "rock_id" of relation "eos_issues" does not exist
```

**Root Cause:**
The `create_issue` RPC function (line 118 in the latest migration) attempts to insert into a column named `rock_id`, but the actual `eos_issues` table schema has a column named `linked_rock_id`.

```sql
-- Current RPC (WRONG):
INSERT INTO eos_issues (
  tenant_id, client_id, title, description, priority, status,
  raised_by, rock_id, meeting_id, created_by  -- rock_id doesn't exist!
)
```

**Confirmed Schema:**
| Column | Type |
|--------|------|
| `linked_rock_id` | uuid (nullable) |
| `priority` | integer |

---

### B) Participants Query Error (400)

**Error:**
GET `eos_meeting_participants?select=*,users(first_name,last_name)` returns 400 Bad Request.

**Root Cause:**
The `eos_meeting_participants.user_id` column has a foreign key to `auth.users(id)` (the internal auth schema), NOT to `public.users(user_uuid)`. Supabase PostgREST cannot join across schemas using implicit syntax.

```text
Current FK: eos_meeting_participants.user_id -> auth.users.id
Required: eos_meeting_participants.user_id -> public.users.user_uuid
```

Compare to `eos_meeting_attendees` which correctly references `public.users(user_uuid)`:
```text
FK: eos_meeting_attendees.user_id -> public.users.user_uuid
```

---

### C) 500 Errors for Attendees/Ratings/Outcome Confirmations

The 500 errors are likely caused by one of:
1. RLS policy evaluation failures due to recursive lookups
2. FK join issues similar to participants

**Current RLS Policies (verified working):**
- All three tables have SELECT policies that check `tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())`
- Policies appear correct but may have edge cases

---

## Implementation Plan

### Step 1: Fix create_issue RPC (Database Migration)

Update the `create_issue` function to use the correct column name `linked_rock_id`:

```sql
-- Fix create_issue RPC to use correct column name
CREATE OR REPLACE FUNCTION public.create_issue(
  p_tenant_id BIGINT,
  p_source TEXT DEFAULT 'ad_hoc',
  p_title TEXT DEFAULT '',
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_client_id UUID DEFAULT NULL,
  p_linked_rock_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id UUID;
  v_priority_int INTEGER;
BEGIN
  -- Convert text priority to integer
  v_priority_int := CASE LOWER(p_priority)
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 2
  END;

  INSERT INTO eos_issues (
    tenant_id, client_id, title, description, priority, status,
    raised_by, linked_rock_id, meeting_id, created_by
  ) VALUES (
    p_tenant_id, p_client_id, p_title, p_description, v_priority_int, 'open',
    auth.uid(), p_linked_rock_id, p_meeting_id, auth.uid()
  )
  RETURNING id INTO v_issue_id;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id, auth.uid(), p_meeting_id, 'issue', v_issue_id, 'created',
    'Issue created from ' || p_source,
    jsonb_build_object('source', p_source, 'priority', p_priority)
  );

  RETURN v_issue_id;
END;
$$;
```

---

### Step 2: Fix Participants FK Join (Database Migration)

Add a foreign key from `eos_meeting_participants.user_id` to `public.users.user_uuid` to enable PostgREST joins:

```sql
-- Add FK from eos_meeting_participants.user_id to public.users
ALTER TABLE public.eos_meeting_participants
DROP CONSTRAINT IF EXISTS eos_meeting_participants_user_id_users_fkey;

ALTER TABLE public.eos_meeting_participants
ADD CONSTRAINT eos_meeting_participants_user_id_users_fkey
FOREIGN KEY (user_id) REFERENCES public.users(user_uuid)
ON DELETE CASCADE;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

---

### Step 3: Update Participants Query in LiveMeetingView

Update the query to use explicit FK join syntax (matching the pattern in `useMeetingAttendance.tsx`):

**File: `src/components/eos/LiveMeetingView.tsx` (lines 77-84)**

```typescript
// Before:
.select('*, users(first_name, last_name)')

// After:
.select(`
  *,
  users!eos_meeting_participants_user_id_users_fkey (first_name, last_name)
`)
```

---

### Step 4: Add Error Handling to Queries

Update the queries in `useMeetingOutcomes.tsx` to handle errors gracefully:

**File: `src/hooks/useMeetingOutcomes.tsx`**

Add try-catch and return empty arrays on failure to prevent UI crashes:

```typescript
// For confirmations query
queryFn: async () => {
  try {
    const { data, error } = await supabase
      .from('eos_meeting_outcome_confirmations')
      .select('*')
      .eq('meeting_id', meetingId!);
    
    if (error) {
      console.error('Error fetching outcome confirmations:', error);
      return [];
    }
    return data as OutcomeConfirmation[];
  } catch (e) {
    console.error('Exception fetching outcome confirmations:', e);
    return [];
  }
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration | Create | Fix `create_issue` RPC column name + add participants FK |
| `src/components/eos/LiveMeetingView.tsx` | Modify | Use explicit FK join for participants |
| `src/hooks/useMeetingOutcomes.tsx` | Modify | Add error handling for graceful failures |

---

## Technical Notes

### Error Root Causes Summary

| Error | Root Cause | Fix |
|-------|------------|-----|
| `rock_id of relation eos_issues does not exist` | RPC uses wrong column name | Change `rock_id` to `linked_rock_id` in RPC |
| Participants 400 | No FK to public.users | Add FK constraint + use explicit join |
| 500 on various endpoints | RLS or FK issues | Add FK, update queries, add error handling |

### Audit Trail Preserved
- The `create_issue` RPC maintains the audit log insert to `audit_eos_events`
- FK changes use `ON DELETE CASCADE` for data integrity
- No changes to RLS policies required

### Schema Naming Conventions
- Database columns remain `snake_case` (e.g., `linked_rock_id`)
- Frontend interfaces remain `camelCase` in TypeScript
