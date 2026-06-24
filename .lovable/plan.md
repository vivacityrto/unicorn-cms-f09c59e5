# Hide QA test accounts (kpi_pod = 'qa') from general Vivacity views

QA-flagged users (`public.users.kpi_pod = 'qa'`) are excluded from every staff dropdown, selector, and EOS lookup except the KPI module, where they remain visible with an amber "QA" badge.

## 1. Database migration — RPC filters

Recreate both RPCs with an added `COALESCE(u.kpi_pod, '') <> 'qa'` filter. Signatures, RLS, grants, `SECURITY DEFINER`, and `SET search_path = ''` stay identical.

- `public.get_vivacity_team_directory()`
- `public.get_vivacity_team_directory_staff()`

No schema, policy, or grant changes.

## 2. Frontend — add `.neq('kpi_pod', 'qa')` to all direct `users` queries

Add `.neq('kpi_pod', 'qa')` to the existing filter chain in each file below. No other logic changes.

**General staff dropdowns**
- `src/hooks/useTriageStaffOptions.ts`
- `src/components/client/ReassignConsultantDialog.tsx`
- `src/components/StageNotesTab.tsx`
- `src/pages/TenantNotes.tsx`
- `src/components/client/ClientNotesTab.tsx`
- `src/components/client/ClientActionItemsTab.tsx`
- `src/components/audit/NewAuditModal.tsx`

**EOS — list-building queries**
- `src/hooks/useAccountabilityChart.tsx`
- `src/hooks/useSeatSuccession.tsx`
- `src/hooks/useFunctionTeamMembers.tsx`
- `src/hooks/useCalendarShares.tsx`
- `src/hooks/useTenantTeamUsers.tsx`

**EOS — L10 meeting owner lookups** (prevent QA names appearing in live meetings if a QA account is accidentally assigned to a rock or todo during testing)
- `src/components/eos/LiveMeetingView.tsx`
- `src/components/eos/RockPlanningPane.tsx`

## 3. KPI module — keep QA visible with amber badge

Do NOT filter QA out. Include `kpi_pod` in each `users` select and render a small amber "QA" `Badge` (`bg-amber-100 text-amber-800`) next to the display name when `kpi_pod === 'qa'`:

- `src/components/kpi/KpiStaffSelector.tsx` — badge inside each `SelectItem`.
- `src/pages/KpiOverviewPage.tsx` — badge next to the staff name in the overview grid row.

## 4. Verification

- Staff directory, all note assignee dropdowns, audit modal, triage, reassign-consultant, accountability chart, seat succession, function team members, calendar shares, tenant team users, L10 live meeting & rock planning lookups — QA users absent.
- `/admin/kpi-review` `KpiStaffSelector` and `/admin/kpi-overview` grid — QA users present with amber "QA" badge.
- No RLS, FK, schema, or grant changes.
