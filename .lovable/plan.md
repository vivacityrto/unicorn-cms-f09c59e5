# Plan: Allow all Vivacity staff to browse client SharePoint

## Context
`supabase/functions/browse-sharepoint-folder/index.ts` currently restricts cross-tenant SharePoint browsing to Super Admin only. With the "View as Client" impersonation feature, all internal Vivacity staff (Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET) need this ability.

There is **no** `supabase/functions/_shared/vivacityRoles.ts` file. The existing `_shared/auth-helpers.ts` exports a `VIVACITY_STAFF_ROLES` constant, but per the user's instruction ("If the shared folder uses a different export pattern, replicate the VIVACITY_STAFF_ROLES array inline"), I'll inline the constant in this edge function to avoid coupling.

## Changes (single file)

**File:** `supabase/functions/browse-sharepoint-folder/index.ts`

1. Add a top-level helper (near other constants/imports):
   ```ts
   const VIVACITY_STAFF_ROLES = [
     'Super Admin', 'Team Leader', 'Team Member',
     'Integrator', 'BGT', 'CSC', 'CET',
   ];
   const isVivacityStaffRole = (role?: string | null) =>
     !!role && VIVACITY_STAFF_ROLES.includes(role);
   ```

2. **Line ~138** (main handler): replace
   ```ts
   const isSuperAdmin =
     userData?.global_role === "SuperAdmin" || userData?.unicorn_role === "Super Admin";
   ```
   with
   ```ts
   const isSuperAdmin =
     isVivacityStaffRole(userData?.unicorn_role) || userData?.global_role === "SuperAdmin";
   ```

3. **Line ~445** (`list_drives` diagnostic branch): same replacement pattern, using inline expression on `userData.unicorn_role` / `userData.global_role`.

## Out of scope
- No changes to SharePoint token handling, site resolution, or any downstream logic.
- No changes to other edge functions.
- Variable name `isSuperAdmin` kept as-is to minimise diff (semantics widen to "internal staff").
