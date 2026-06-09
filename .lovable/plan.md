## Vivacity Staff Roles — Single Source of Truth Refactor

### Step 1: Create `src/lib/roles/vivacityRoles.ts`

New file exporting:
- `VIVACITY_STAFF_ROLES` — readonly tuple of the 7 canonical roles (Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET)
- `VivacityStaffRole` type
- `isVivacityStaffRole(role)` predicate — safe outside React

### Step 2: Update `src/hooks/useRBAC.tsx`

Replace the inline `is_vivacity_team` array with `VIVACITY_STAFF_ROLES.includes(...)` using the new import.

### Step 3: Refactor all hardcoded role lists

For each file below, add the import and replace the local hardcoded array with either `isVivacityStaffRole(profile?.unicorn_role)` (predicate pattern) or `[...VIVACITY_STAFF_ROLES]` (Supabase `.in()` pattern).

**Predicate pattern (`isVivacityStaffRole`):**
1. `src/hooks/useDashboardTriage.ts` (~L125) — critical, fixes infinite spinner
2. `src/contexts/TenantTypeContext.tsx` (~L42)
3. `src/components/DashboardLayout.tsx` (~L188)
4. `src/components/client/ClientFilesTab.tsx` (~L102)
5. `src/components/client/SharePointFolderConfig.tsx` (~L166)
6. `src/components/client/PackageStagesManager.tsx` (~L262) — inline `isVivacityStaff` prop
7. `src/components/client/ClientTimelineTab.tsx` (~L80-82)
8. `src/components/client/ClientTimeTab.tsx` (~L1069-1070)
9. `src/components/client/MembershipWeightsPanel.tsx` (~L35-36)
10. `src/components/eos/accountability/RecommendationsPanel.tsx` (~L66-69)

**Supabase `.in()` pattern (`[...VIVACITY_STAFF_ROLES]`):**
11. `src/components/client/ClientNotesTab.tsx` (~L178)
12. `src/components/client/ClientActionItemsTab.tsx` (~L109)

### Out of scope (per instructions)
- `src/hooks/useAuth.tsx` — UserProfile union type kept explicit
- ask-viv components — already use `useRBAC`
- `supabase/functions/` — has its own `_shared/auth-helpers.ts`

### Verification
TypeScript build runs automatically; will confirm zero errors after edits. No behavior changes — same 7 roles, just centralized.
