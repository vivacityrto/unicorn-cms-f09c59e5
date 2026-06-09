Replace hardcoded Vivacity staff role arrays in 3 production files with imports from `@/lib/roles/vivacityRoles`, using the same pattern already applied to the other 12 files.

### Files and changes

1. **`src/components/layout/AuthenticatedLayout.tsx`** (~L39)
   - Import `isVivacityStaffRole` from `@/lib/roles/vivacityRoles`.
   - Replace the inline `isVivacityTeam` array with `isVivacityStaffRole(profile?.unicorn_role)`.

2. **`src/components/StageNotesTab.tsx`** (~L89)
   - Import `VIVACITY_STAFF_ROLES` from `@/lib/roles/vivacityRoles`.
   - Replace the Supabase `.in("unicorn_role", ["Super Admin", "Team Leader", "Team Member"])` array with `.in("unicorn_role", [...VIVACITY_STAFF_ROLES])`.

3. **`src/pages/TenantNotes.tsx`** (~L219)
   - Import `VIVACITY_STAFF_ROLES` from `@/lib/roles/vivacityRoles`.
   - Replace the Supabase `.in("unicorn_role", ["Super Admin", "Team Leader", "Team Member"])` array with `.in("unicorn_role", [...VIVACITY_STAFF_ROLES])`.

### Validation
- TypeScript build must pass with zero errors after the changes.
- No runtime behavior changes — same 7 roles, just centralized.