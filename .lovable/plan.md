Replace hardcoded Vivacity staff role arrays in 4 files with `isVivacityStaffRole` / `VIVACITY_STAFF_ROLES` from `@/lib/roles/vivacityRoles`.

**1. src/hooks/useEos.tsx**
- Add import: `import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';`
- Replace the 3 `isVivacityTeam` declarations (lines ~28-30, ~131-133, ~230-232) from `['Super Admin', 'Team Leader', 'Team Member'].includes(...)` to `isVivacityStaffRole(profile?.unicorn_role)`.

**2. src/hooks/useDashboardTriage.ts**
- Import already present.
- Replace line ~128 `const isExec = isSuperAdmin || profile?.unicorn_role === 'Team Leader';` with `const isExec = isVivacityStaffRole(profile?.unicorn_role);`.

**3. src/hooks/useAccountabilityChart.tsx**
- Add import: `import { VIVACITY_STAFF_ROLES } from '@/lib/roles/vivacityRoles';`
- Replace line ~105 `.in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])` with `.in('unicorn_role', [...VIVACITY_STAFF_ROLES])`.

**4. src/pages/ManageDocuments.tsx**
- Add import: `import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';`
- Replace lines ~386-388 (the `isSuperAdmin || isTeamLeader` block) with `if (isVivacityStaffRole(currentUserRole))`.

No other logic changes. These are drop-in replacements that unblock CSC, BGT, Integrator, and CET internal roles from loading data.