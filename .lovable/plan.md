

# Fix Missing Recurring L10 Meetings on EOS Meetings Page

## Problem Summary

Your recurring Level 10 meeting series is set up correctly, but **no future L10 meeting instances are displaying** on the `/eos/meetings` page. The original L10 meeting from January 27, 2026 appears in the "Completed" tab, but no upcoming weekly L10 meetings are shown.

---

## Root Cause Analysis

Three issues are contributing to this problem:

### Issue 1: Status Inconsistency (Primary Cause)
The L10 meeting has inconsistent state:
- `is_complete: true` (marked as completed)
- `status: 'scheduled'` (never updated to 'closed' or 'completed')

The `auto_generate_next_meeting` trigger only fires when `status` changes to `'closed'` or `'completed'`. Since the status was never properly updated, the trigger never fired and **no new L10 instances were generated**.

### Issue 2: No Future Instances Generated
The L10 meeting series (`id: 7ba1d1e6-189d-4814-9c91-9cd1549895c6`) has `recurrence_type: 'weekly'` and `is_active: true`, but only ONE meeting instance exists in `eos_meetings`:
- Jan 27, 2026 (completed) - **No Feb 3, Feb 10, Feb 17, etc.**

### Issue 3: Unused Data from Occurrences Table
There ARE 12 weekly occurrences in `eos_meeting_occurrences` (Feb 3 through April 14), but these come from a separate recurrence system and are **not displayed on the meetings page**. The page only reads from `eos_meetings`.

---

## Solution Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      FIX APPROACH                           │
├─────────────────────────────────────────────────────────────┤
│  1. Data Fix: Generate missing L10 meeting instances        │
│  2. Status Fix: Update the completed L10 meeting's status   │
│  3. Future-Proofing: Ensure trigger works for future runs   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Generate Missing L10 Meeting Instances (Database Migration)

Call the existing `generate_series_instances` function to create the missing L10 meetings:

```sql
-- Generate 12 weeks of L10 meetings for the active series
SELECT * FROM generate_series_instances(
  '7ba1d1e6-189d-4814-9c91-9cd1549895c6'::uuid,  -- L10 series ID
  12  -- Generate 12 weeks ahead
);
```

This will create meeting instances in `eos_meetings` for:
- Feb 10, 2026 (Mon)
- Feb 17, 2026 (Mon)
- Feb 24, 2026 (Mon)
- And so on...

### Step 2: Fix the Completed Meeting Status

Update the original L10 meeting to have consistent status:

```sql
UPDATE eos_meetings 
SET status = 'completed'
WHERE id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb'
  AND is_complete = true
  AND status = 'scheduled';
```

### Step 3: Add Workspace ID to Generated Meetings

Ensure all generated meetings have the correct `workspace_id` for Vivacity access:

```sql
UPDATE eos_meetings m
SET workspace_id = s.workspace_id,
    meeting_scope = 'vivacity_team'
FROM eos_meeting_series s
WHERE m.series_id = s.id
  AND m.workspace_id IS NULL
  AND s.workspace_id IS NOT NULL;
```

### Step 4: Verify the Fix

After migration, verify:
1. L10 meetings appear in the Upcoming tab
2. RLS policies allow viewing the meetings
3. Meeting instances have correct workspace_id

---

## Technical Details

### Database Tables Involved

| Table | Role |
|-------|------|
| `eos_meeting_series` | Defines the recurring series (weekly L10) |
| `eos_meetings` | Stores individual meeting instances (what the page displays) |
| `eos_meeting_recurrences` | Alternative recurrence system (not used by page) |
| `eos_meeting_occurrences` | Occurrence slots from alternative system (not used by page) |

### Why the Trigger Didn't Fire

The `auto_generate_next_meeting` trigger condition:
```sql
IF NEW.status IN ('closed', 'completed') AND OLD.status NOT IN ('closed', 'completed')
```

The meeting's `is_complete` was set to `true` without updating the `status` column, so the trigger never fired.

### RLS Consideration

The generated meetings will automatically be accessible because:
- They will have `workspace_id = ae971006-d1a1-48ad-b26a-1d933ded2509` (Vivacity workspace)
- The RLS policy `vivacity_select_meetings` allows authenticated users who pass `is_vivacity_team_safe(auth.uid())` and have matching workspace_id

---

## Files to Modify

1. **New Migration SQL** - Database migration to generate missing instances and fix status

No frontend code changes are required since:
- The `useEosMeetings` hook already fetches all meetings
- The page categorization logic correctly handles upcoming vs completed meetings
- RLS policies are already in place

---

## Expected Outcome

After implementation:
1. The `/eos/meetings` page will show upcoming L10 meetings in the "Upcoming" tab
2. L10 meetings will appear for the next 12 Mondays at 10:00 AM
3. Future meeting completions will properly trigger the auto-generation of next instances

---

## Migration Summary

A single idempotent migration will:
1. Generate 12 weeks of L10 meeting instances using `generate_series_instances`
2. Update the completed meeting's status to 'completed'
3. Ensure all generated meetings have proper `workspace_id` and `meeting_scope`
4. Add a data integrity check to prevent future status/is_complete inconsistencies

