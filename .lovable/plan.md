

## Fix: QC Visibility — Team Members Seeing Others' Quarterly Conversations

### Problem
Every Vivacity team member can see all Quarterly Conversations instead of only their own. The root cause is in both the database policies and frontend permissions.

### Root Cause Analysis

**Database (RLS):** The `eos_qc_manage` policy (FOR ALL, which includes SELECT) still grants access via `is_vivacity_team_safe()`, meaning any Vivacity staff can read all QCs — bypassing the restrictive `eos_qc_select` policy added later.

**Frontend (RBAC):** The `qc:view_all` permission is granted to Team Leader and Team Member roles, so the UI shows the "All Conversations" tab and skips client-side filtering for those roles.

### Plan

#### 1. Database Migration — Tighten `eos_qc_manage` policy
Drop the existing `eos_qc_manage` policy and replace it so only managers on the QC or SuperAdmin-Administrator can modify (and implicitly read via FOR ALL):

```sql
DROP POLICY IF EXISTS "eos_qc_manage" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can insert qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can update qc" ON public.eos_qc;
DROP POLICY IF EXISTS "Vivacity team can delete qc" ON public.eos_qc;

CREATE POLICY "eos_qc_manage" ON public.eos_qc
FOR ALL TO authenticated
USING (
  public.is_qc_admin_safe(auth.uid())
  OR auth.uid() = ANY(manager_ids)
)
WITH CHECK (
  public.is_qc_admin_safe(auth.uid())
  OR auth.uid() = ANY(manager_ids)
);
```

Also tighten related tables (`eos_qc_answers`, `eos_qc_fit`, `eos_qc_signoffs`, `eos_qc_links`) to use `can_access_qc()` for SELECT, ensuring answers/fit data from other people's QCs aren't leaked.

#### 2. Frontend — Remove `qc:view_all` from non-admin roles
In `src/hooks/useRBAC.tsx`, remove `qc:view_all` from the Team Leader and Team Member permission arrays. Only Super Admin (Administrator level) should retain it.

#### 3. Frontend — Ensure query fetches only relevant QCs
In `src/hooks/useQuarterlyConversations.tsx`, the query already fetches all and relies on RLS. After the RLS fix, the database will only return QCs the user participates in. No code change needed here — the RLS fix handles it.

### Files Changed
- **New migration** — Drop old permissive policies, tighten `eos_qc_manage` and related table policies
- **`src/hooks/useRBAC.tsx`** — Remove `qc:view_all` from Team Leader and Team Member roles

