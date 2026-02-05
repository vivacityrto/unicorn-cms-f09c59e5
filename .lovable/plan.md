
# Fix EOS Meetings Infinite RLS Recursion (42P17)

## Problem Summary

The `/eos/meetings` page fails with Postgres error **42P17: infinite recursion detected in policy for relation "eos_meetings"**. This blocks all EOS meeting functionality.

---

## Root Cause

Three interrelated issues cause the recursion:

### 1. Direct Table Cross-Reference (Primary Cause)
The policy `Vivacity team can view vivacity_team meetings` on `eos_meetings` contains:
```sql
EXISTS (SELECT 1 FROM eos_meeting_attendees ema 
        WHERE ema.meeting_id = eos_meetings.id AND ema.user_id = auth.uid())
```
Meanwhile, `eos_meeting_attendees` has a policy that references back:
```sql
EXISTS (SELECT 1 FROM eos_meetings m WHERE m.id = eos_meeting_attendees.meeting_id ...)
```
**This creates an infinite loop between the two tables.**

### 2. Multiple Overlapping Policies
There are **10 SELECT policies** on `eos_meetings`, many redundant and using different helper functions:
- `Vivacity can view L10 meetings`
- `Vivacity team can view meetings`
- `Vivacity team can view vivacity_team meetings` (problematic)
- `Meetings read access for authenticated users`
- `Users with EOS access can view meetings`
- etc.

### 3. Helper Functions Missing row_security=off
Only `is_vivacity_member(uuid)` has `SET row_security = off`. These do not:
- `is_vivacity_team_user(uuid)` 
- `is_staff()`
- `can_access_vivacity_meetings(uuid)`
- `get_vivacity_workspace_id()`

When these query `public.users` or `eos_workspaces`, they can trigger nested RLS evaluation.

---

## Solution Overview

Create a **clean, minimal, recursion-proof** RLS configuration:

```text
┌─────────────────────────────────────────────────────────────────┐
│                        SAFE APPROACH                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Create recursion-safe helper functions (row_security=off)  │
│  2. Drop ALL existing eos_meetings SELECT/DELETE policies      │
│  3. Drop ALL existing eos_meeting_participants policies        │
│  4. Create minimal workspace-based policies                     │
│  5. Use only safe functions in all new policies                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Recursion-Safe Helper Functions

Two new functions with `SECURITY DEFINER` and `SET row_security = off`:

**1a. `is_vivacity_team_safe(uuid)`** - Membership check that bypasses RLS
```sql
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users au
    JOIN public.users u ON u.user_uuid = au.id
    WHERE au.id = p_user_id
      AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND u.archived IS DISTINCT FROM true
  );
$$;
```

**1b. `get_vivacity_workspace_id_safe()`** - Workspace ID getter that bypasses RLS
```sql
CREATE OR REPLACE FUNCTION public.get_vivacity_workspace_id_safe()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id FROM public.eos_workspaces WHERE slug = 'vivacity' LIMIT 1;
$$;
```

Grant execute only to `authenticated` role.

---

### Step 2: Drop All Existing Policies on Target Tables

Use a loop to drop all policies, avoiding partial fixes:

```sql
-- Drop all policies on eos_meetings
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE schemaname = 'public' AND tablename = 'eos_meetings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.eos_meetings;', r.policyname);
  END LOOP;
END $$;

-- Drop all policies on eos_meeting_participants
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE schemaname = 'public' AND tablename = 'eos_meeting_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.eos_meeting_participants;', r.policyname);
  END LOOP;
END $$;

-- Drop all policies on eos_meeting_attendees
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies 
           WHERE schemaname = 'public' AND tablename = 'eos_meeting_attendees'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.eos_meeting_attendees;', r.policyname);
  END LOOP;
END $$;
```

---

### Step 3: Create Clean Workspace-Based Policies

**Policy Design Rules:**
- Use ONLY `is_vivacity_team_safe()` and `get_vivacity_workspace_id_safe()`
- Filter by `workspace_id` column (row data only, no subqueries)
- Never reference another EOS table in a policy
- Separate policies per operation (SELECT, INSERT, UPDATE, DELETE)

**3a. eos_meetings Policies**
```sql
-- SELECT: Vivacity team can view meetings in vivacity workspace
CREATE POLICY "vivacity_select_meetings"
ON public.eos_meetings FOR SELECT TO authenticated
USING (
  is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id_safe())
);

-- INSERT: Vivacity team can create meetings in vivacity workspace
CREATE POLICY "vivacity_insert_meetings"
ON public.eos_meetings FOR INSERT TO authenticated
WITH CHECK (
  is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id_safe())
);

-- UPDATE: Vivacity team can update their workspace meetings
CREATE POLICY "vivacity_update_meetings"
ON public.eos_meetings FOR UPDATE TO authenticated
USING (is_vivacity_team_safe(auth.uid()) 
       AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id_safe()))
WITH CHECK (is_vivacity_team_safe(auth.uid())
            AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id_safe()));

-- DELETE: Vivacity team can delete their workspace meetings
CREATE POLICY "vivacity_delete_meetings"
ON public.eos_meetings FOR DELETE TO authenticated
USING (
  is_vivacity_team_safe(auth.uid())
  AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id_safe())
);
```

**3b. eos_meeting_participants Policies**
```sql
-- SELECT: Vivacity team can view all participants
CREATE POLICY "vivacity_select_participants"
ON public.eos_meeting_participants FOR SELECT TO authenticated
USING (is_vivacity_team_safe(auth.uid()));

-- INSERT/UPDATE/DELETE: Vivacity team can manage participants
CREATE POLICY "vivacity_manage_participants"
ON public.eos_meeting_participants FOR ALL TO authenticated
USING (is_vivacity_team_safe(auth.uid()))
WITH CHECK (is_vivacity_team_safe(auth.uid()));
```

**3c. eos_meeting_attendees Policies**
```sql
-- SELECT: Vivacity team can view all attendees
CREATE POLICY "vivacity_select_attendees"
ON public.eos_meeting_attendees FOR SELECT TO authenticated
USING (is_vivacity_team_safe(auth.uid()));

-- ALL: Vivacity team can manage attendees
CREATE POLICY "vivacity_manage_attendees"
ON public.eos_meeting_attendees FOR ALL TO authenticated
USING (is_vivacity_team_safe(auth.uid()))
WITH CHECK (is_vivacity_team_safe(auth.uid()));
```

---

### Step 4: Validation Queries

After migration, run these to confirm the fix:

```sql
-- 1. Verify safe functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('is_vivacity_team_safe', 'get_vivacity_workspace_id_safe');

-- 2. Verify no recursion-prone policies remain
SELECT policyname, qual::text FROM pg_policies
WHERE tablename IN ('eos_meetings', 'eos_meeting_participants', 'eos_meeting_attendees')
  AND schemaname = 'public'
  AND (qual::text ILIKE '%eos_meetings%' OR qual::text ILIKE '%eos_meeting%');

-- 3. Test meetings query (should not error)
SELECT id, title, meeting_type FROM public.eos_meetings LIMIT 5;

-- 4. Count Vivacity team members (expected: ~13-15)
SELECT count(*) FROM public.users u
JOIN auth.users au ON au.id = u.user_uuid
WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  AND u.archived IS DISTINCT FROM true;
```

---

## Technical Details

### Why workspace_id is the Safe Filter

The `workspace_id` column on `eos_meetings` defaults to `get_vivacity_workspace_id()` and identifies internal vs client meetings:
- Internal Vivacity meetings: `workspace_id = (vivacity workspace UUID)`
- Client meetings: different workspace or NULL

By filtering on this column value directly (not via subquery), we avoid any cross-table RLS triggers.

### Why row_security=off is Required

`SECURITY DEFINER` alone elevates to the function owner's permissions, but RLS policies still apply to queries inside the function. Adding `SET row_security = off` completely disables RLS evaluation within the function, preventing any recursion path.

### Files Changed

Only Supabase migration SQL is required. No frontend code changes needed since:
- Query in `useEosMeetings` hook is unchanged
- RLS filtering happens server-side transparently

---

## Acceptance Criteria

1. `/eos/meetings` loads without 42P17 error
2. Vivacity Team members see all workspace meetings
3. Non-Vivacity users cannot see EOS meetings (empty result)
4. Create, update, delete operations work for Vivacity Team
5. No recursion errors in Supabase logs

---

## Risks & Rollback

**Risk**: Dropping all policies temporarily opens tables. The migration is atomic (single transaction), so this is safe.

**Rollback**: If issues occur, revert by restoring previous policies from Supabase dashboard > Auth > Policies history, or run a new migration recreating the old policies.
