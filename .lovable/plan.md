# Plan: Replace hardcoded role checks with `isVivacityStaffRole`

Apply drop-in role-check replacements across 12 files so internal staff with new roles (Integrator, BGT, CSC, CET) gain the same access as Super Admin / Team Leader / Team Member.

## Files & edits

1. **src/hooks/useLeadershipDashboard.tsx** (L748) — `enabled: isVivacityStaffRole(profile?.unicorn_role)`.
2. **src/pages/EosPeopleAnalyzer.tsx** (L32) — `const canView = isVivacityStaffRole(profile?.unicorn_role)`.
3. **src/pages/DocumentDetail.tsx** (L172–173, 624–625, 869, 1109) — replace every `isSuperAdmin || isTeamLeader` gate with `isVivacityStaffRole(profile?.unicorn_role)`.
4. **src/pages/ManageDocuments.tsx** (L155) — redefine `isTeamLeader` via `isVivacityStaffRole`.
5. **src/pages/ManagePackages.tsx** (L98) — same.
6. **src/pages/ManageInvites.tsx** (L76–77) — collapse `isTeamLeader` + `isSuperAdmin` into `canManageInvites = isVivacityStaffRole(profile?.unicorn_role)`; update downstream conditionals to use it.
7. **src/pages/ClientDetail.tsx** (L125) — redefine `isTeamLeader` via `isVivacityStaffRole(authProfile?.unicorn_role)`.
8. **src/hooks/useSeatScorecard.tsx** (L353) — replace TL check with `isVivacityStaffRole(profile.unicorn_role)`.
9. **src/contexts/ClientPreviewContext.tsx** (L111) — redefine `isTeamLeader` via `isVivacityStaffRole`.
10. **src/hooks/useEosFacilitatorEligible.ts** (L15) — return `isVivacityStaffRole(role)`.
11. **src/pages/ManageUsers.tsx** — expand `unicorn_role` type unions (L66, 113, 222, 263, 895) to include `Integrator | BGT | CSC | CET`, and ensure the role-change dropdown renders all internal roles.
12. **src/components/InviteUserDialog.tsx** (L29) — extend `UnicornRole` type with the new roles.

Add `import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';` to any file that doesn't already have it.

## Out of scope (explicitly untouched)
QCScheduler.tsx, RecommendationsPanel.tsx, useRBAC.tsx, ProfileHeader.tsx, TeamMemberRow.tsx, TeamMembersSection.tsx, AdminActions.tsx — per spec.

## Verification
- Read each touched line post-edit to confirm.
- `rg "=== 'Team Leader'" src` and `rg "'Super Admin', 'Team Leader'" src` should return only intentional survivors (the "do not change" files and `vivacityRoles.ts`).
- No logic changes beyond role-list substitution and type widening.
