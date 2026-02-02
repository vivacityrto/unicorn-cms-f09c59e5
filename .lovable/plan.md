
# Fix: Infinite Recursion in RLS for EOS Meeting Tables

## Problem Summary

The meeting rating, attendees, and outcome confirmations features fail with:

**"infinite recursion detected in policy for relation 'tenant_users'"**

## Root Cause

Multiple EOS meeting tables have RLS policies that directly query `tenant_users`. The `tenant_users` table has self-referential policies (e.g., `tenant_users_select_own` references `tenant_users tu2`), which creates infinite recursion when these policies are evaluated.

### Affected Tables and Policies

| Table | Policy | Problem |
|-------|--------|---------|
| `eos_meeting_attendees` | "Attendees viewable by tenant members" | JOINs `tenant_users` |
| `eos_meeting_attendees` | "Attendees manageable by meeting owner or admin" | JOINs `tenant_users` |
| `eos_meeting_outcome_confirmations` | "Users can view outcome confirmations for their tenant" | Subquery on `tenant_users` |

### Why eos_meeting_ratings Still Fails

Although I previously fixed the `eos_meeting_ratings` policies to use `eos_meetings`, the `eos_meetings` RLS policies then trigger queries on other tables (like attendees), which then trigger the `tenant_users` recursion.

## Solution

Replace all direct `tenant_users` references with the existing `user_has_tenant_access(p_tenant_id)` SECURITY DEFINER function, which bypasses RLS.

---

## Implementation Details

### Step 1: Fix eos_meeting_attendees Policies

**Current (broken):**
```sql
-- Policy: "Attendees viewable by tenant members"
EXISTS (
  SELECT 1
  FROM eos_meetings m
  JOIN tenant_users tu ON tu.tenant_id = m.tenant_id  -- RECURSION
  WHERE m.id = eos_meeting_attendees.meeting_id
    AND tu.user_id = auth.uid()
)
```

**Fixed:**
```sql
-- Use SECURITY DEFINER function instead
is_staff() OR is_super_admin() OR (
  EXISTS (
    SELECT 1 FROM eos_meetings m
    WHERE m.id = eos_meeting_attendees.meeting_id
      AND user_has_tenant_access(m.tenant_id)
  )
)
```

### Step 2: Fix eos_meeting_outcome_confirmations Policies

**Current (broken):**
```sql
-- Policy: "Users can view outcome confirmations for their tenant"
tenant_id IN (
  SELECT tenant_users.tenant_id 
  FROM tenant_users 
  WHERE tenant_users.user_id = auth.uid()  -- RECURSION
)
```

**Fixed:**
```sql
-- Use SECURITY DEFINER function
user_has_tenant_access(tenant_id) OR is_super_admin()
```

### Step 3: Add INSERT Policy for eos_meeting_outcome_confirmations

Currently missing the WITH CHECK clause for INSERT.

**Add:**
```sql
WITH CHECK (
  user_has_tenant_access(tenant_id)
)
```

---

## SQL Migration Summary

```sql
-- 1. Fix eos_meeting_attendees SELECT policy
DROP POLICY IF EXISTS "Attendees viewable by tenant members" ON eos_meeting_attendees;
CREATE POLICY "Attendees viewable by tenant members"
ON eos_meeting_attendees FOR SELECT
USING (
  is_staff() OR is_super_admin() OR (
    EXISTS (
      SELECT 1 FROM eos_meetings m
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND user_has_tenant_access(m.tenant_id)
    )
  )
);

-- 2. Fix eos_meeting_attendees write policies  
DROP POLICY IF EXISTS "Attendees manageable by meeting owner or admin" ON eos_meeting_attendees;
CREATE POLICY "Attendees manageable by meeting owner or admin"
ON eos_meeting_attendees FOR ALL
USING (
  is_super_admin() OR (
    EXISTS (
      SELECT 1 FROM eos_meetings m
      WHERE m.id = eos_meeting_attendees.meeting_id
        AND (m.created_by = auth.uid() OR can_facilitate_eos(auth.uid(), m.tenant_id))
    )
  )
);

-- 3. Fix eos_meeting_outcome_confirmations SELECT policy
DROP POLICY IF EXISTS "Users can view outcome confirmations for their tenant" ON eos_meeting_outcome_confirmations;
CREATE POLICY "Users can view outcome confirmations for their tenant"
ON eos_meeting_outcome_confirmations FOR SELECT
USING (
  user_has_tenant_access(tenant_id) OR is_super_admin()
);

-- 4. Fix eos_meeting_outcome_confirmations INSERT policy
DROP POLICY IF EXISTS "Users can insert outcome confirmations for their tenant" ON eos_meeting_outcome_confirmations;
CREATE POLICY "Users can insert outcome confirmations for their tenant"
ON eos_meeting_outcome_confirmations FOR INSERT
WITH CHECK (
  user_has_tenant_access(tenant_id)
);
```

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| New SQL migration | Create | Replace recursive policies with SECURITY DEFINER function calls |

---

## Expected Outcome After Fix

1. User can view meeting attendees without 500 errors
2. User can rate the meeting
3. User can submit outcome confirmations
4. Meeting Close Checklist loads properly
5. No more "infinite recursion" errors in database logs

---

## Testing Checklist

After implementation:
1. Open a live meeting
2. Verify the participant list loads
3. Click a rating number (1-10)
4. Confirm rating saves without error
5. Open Meeting Close Checklist
6. Verify all sections load
7. Submit any required confirmations
8. Close the meeting successfully
