## Goal
Replace all hardcoded `isSuperAdmin` / `unicorn_role` RBAC checks across the Academy module pages with `usePermission` calls, keeping any existing Phase 5 feature gates intact.

## Files and Changes

### 1. `src/pages/superadmin/AcademyTenantAccessPage.tsx`
- Import `usePermission` from `@/hooks/usePermission`.
- Remove `useRBAC` and `useAuth` if they become unused.
- Replace `canManage = isSuperAdmin || profile?.unicorn_role === 'Team Leader'` with:
  - `const canManage = usePermission('academy.tenant_access.manage');`
- Apply `canManage` to: Switch disabled state, toggle handler guard, Edit button visibility, Enrolments link visibility.

### 2. `src/pages/superadmin/AcademyEnrolmentsPage.tsx`
- Import `usePermission`.
- Remove `useRBAC` and `useAuth` if they become unused.
- Replace gate variables:
  - `canCreateEnrolment` → `usePermission('academy.enrolments.create')` for the New Enrolment button.
  - `canExportCSV` → `usePermission('academy.enrolments.revoke', 'full')` for the Export CSV button.
  - `canManageEnrolments` → `usePermission('academy.enrolments.revoke')` for row actions (extend, reactivate, revoke) and bulk actions.

### 3. `src/pages/superadmin/AcademyCertificatesPage.tsx`
- Import `usePermission`.
- Remove `useRBAC` and `useAuth` if they become unused.
- Replace `canManageCertificates = isSuperAdmin || profile?.unicorn_role === 'Team Leader'` with:
  - `const canManageCertificates = usePermission('academy.certificates.issue');`
- Apply to: Issue Certificate button, dropdown Revoke action.

### 4. `src/pages/superadmin/AcademyBuilderLibrary.tsx`
- Import `usePermission`.
- Remove `useRBAC` and `useAuth` if they become unused.
- Replace gate variables:
  - `canCreateCourse` → `usePermission('academy.builder.edit')` for the New Course button.
  - `canBackfill` → `usePermission('academy.builder.publish')` for the Backfill Video Durations button.

### 5. `src/pages/superadmin/AcademyBuilderCourse.tsx`
- Import `usePermission`.
- Remove `useRBAC` and `useAuth` if they become unused.
- Replace gate variables:
  - `canEdit` → `usePermission('academy.builder.edit')` applied to: Save Changes button, module title edit, module delete, lesson edit, lesson delete, Add Module button, Add Lesson button, Import Videos button.
  - `canPublishOrDelete` → `usePermission('academy.builder.publish')` applied to: Publish Course, Back to Draft, Archive, Restore to Draft buttons, and the publish toggles on modules and lessons.

### 6. `src/pages/superadmin/AcademyPackageCourseRulesPage.tsx`
- Import `usePermission`.
- Remove `useRBAC` and `useAuth` if they become unused.
- Replace gate variables:
  - `hasAccess` → `usePermission('academy.mapping.view', 'full')` for the `<Navigate>` guard.
  - `canManage` → `usePermission('academy.mapping.edit')` for the New rule FAB and the `readOnly` derivation (`readOnly = !canManage`).

## Cleanup
- Remove `useRBAC` and `useAuth` imports from each file where they are no longer referenced after the replacements.
- Ensure all `usePermission` calls remain at the top level of each component (React hook rules).

## Verification
- Run TypeScript compilation to confirm no type errors.
- Confirm no remaining hardcoded `isSuperAdmin` or `unicorn_role` checks in the six files above.
