

## Plan: Package → Course Mapping — already built

This module was implemented earlier in this session and is live at `/superadmin/academy/package-course-rules`. Re-checking the codebase confirms every acceptance item in the spec is already in place:

| Acceptance item | Implementation |
|---|---|
| Matrix loads (packages × courses) | `RulesMatrixTab.tsx` |
| Filters + search narrow the matrix | Built into `RulesMatrixTab` (package type, audience, Show, search) |
| Click unchecked cell → INSERT, instant on | Optimistic `useToggleRule` in `useAcademyPackageRules.ts` |
| Click checked cell → soft-disable | Same hook, sets `is_active = false` |
| Rules list with sort/filter | `RulesListTab.tsx` |
| Backfill modal with accurate counts | `BackfillConfirmModal.tsx` runs the spec's preview query |
| Backfill calls `fn_academy_backfill_enrollments_for_rule` | `useBackfillRule` |
| Non-staff get 403 | Route registered with `ProtectedRoute requireSuperAdmin` in `App.tsx` |
| Create rule + backfill → `auto_package_backfill` rows | `CreateRuleModal.tsx` + RPC fan-out |
| Real-time sync within 2s | `useRulesRealtime` channel subscription on `academy_package_course_rules` |
| Stats tiles | `fn_academy_rule_dashboard_stats` RPC + `useRuleStats` |

Files in place:
- `src/pages/superadmin/AcademyPackageCourseRulesPage.tsx`
- `src/components/academy/admin/rules/RulesMatrixTab.tsx`
- `src/components/academy/admin/rules/RulesListTab.tsx`
- `src/components/academy/admin/rules/CreateRuleModal.tsx`
- `src/components/academy/admin/rules/BackfillConfirmModal.tsx`
- `src/hooks/academy/useAcademyPackageRules.ts`
- Migration: `fn_academy_rule_dashboard_stats()` (security definer, staff-guarded)

### What I recommend

Rather than rebuild, please open `/superadmin/academy/package-course-rules` and exercise the flow. Likely targets to verify against the acceptance checklist:

1. Matrix view loads with all 30 active packages as columns and 27 published courses as rows.
2. Toggle a cell → row flips instantly; refresh → still on. Toggle again → soft-disabled.
3. Open the FAB → create one rule with "Backfill" checked → check `academy_enrollments` for new rows with `source = 'auto_package_backfill'`.
4. In a second browser tab, toggle a cell → confirm the first tab updates within 2 seconds (real-time).
5. Hit the route as a non-staff user → confirm redirect.
6. Rules list → click Backfill → preview counts render → confirm → toast shows new enrollment count.

If any item misbehaves, tell me which one and the observed vs expected behaviour and I'll target a fix. If you want a feature beyond the original spec (e.g. time-windowed rules or RTO/CRICOS conditional rules — both currently flagged out of scope), say so and I'll plan that as a new piece of work.

