# Global Vivacity Staff Role Cleanup

Replace every remaining hardcoded `['Super Admin', 'Team Leader', 'Team Member']` literal across `src/` with the canonical helpers from `@/lib/roles/vivacityRoles`.

## Pattern A — Predicate checks
Replace:
```ts
['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '')
```
With:
```ts
isVivacityStaffRole(profile?.unicorn_role)
```
Add import `{ isVivacityStaffRole }` from `@/lib/roles/vivacityRoles` where missing.

**Files (Pattern A):**
- `src/hooks/useEos.tsx` (lines ~329, ~463)
- `src/hooks/useMeetingSeries.tsx` (~46)
- `src/hooks/useFlightPlan.tsx` (~16, ~108)
- `src/hooks/useQuarterlyConversations.tsx` (~11)
- `src/hooks/useRisksOpportunities.tsx` (~35)
- `src/hooks/useScorecardMetrics.tsx` (~58)
- `src/hooks/useEosScorecardEntries.tsx` (~13)
- `src/hooks/usePortfolioCockpit.ts` (~71)
- `src/hooks/useProfileSetupReminder.tsx`
- `src/hooks/usePeopleAnalyzer.tsx`
- `src/components/eos/scorecard2/MetricEditorDialogV2.tsx` (~77)
- `src/components/profile/MicrosoftAccountCard.tsx` (~80)
- `src/components/profile/OutlookIntegration.tsx` (~58)
- `src/components/settings/CalendarTab.tsx` (~24)
- `src/components/tenant/TenantLogoUpload.tsx`
- `src/components/tenant/TenantRelationships.tsx`

## Pattern B — Supabase `.in()` queries
Replace:
```ts
.in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
```
With:
```ts
.in('unicorn_role', [...VIVACITY_STAFF_ROLES])
```
Add import `{ VIVACITY_STAFF_ROLES }` from `@/lib/roles/vivacityRoles` where missing.

**Files (Pattern B):**
- `src/hooks/useCalendarShares.tsx` (~72)
- `src/hooks/useSeatSuccession.tsx` (~87)
- `src/hooks/useTenantTeamUsers.tsx` (~46)
- `src/components/workboard/ClientWorkboardTab.tsx` (~76)

## Verification
After edits, run `rg "\['Super Admin', 'Team Leader', 'Team Member'\]" src/` — only allowed survivors are `src/lib/roles/vivacityRoles.ts` and test files under `src/test/`. Fix any others found.

## Out of scope
- No logic changes beyond the role-list substitution.
- No changes to `vivacityRoles.ts` itself or test fixtures.
- No changes to `useEosFacilitatorEligible.ts` or `useTenantTeamUsers.tsx`'s Admin/User branch (different role sets).
