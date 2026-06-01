# Remove Facilitator Mode toggle; replace with always-on guidance + per-chart Edit button (SuperAdmin only)

## Goal
Kill the redundant global Facilitator Mode toggle in the top bar. Keep the genuinely useful EOS guidance panels visible to eligible staff at all times. Replace the Accountability Chart edit-latch with an explicit per-chart **Edit** button that only SuperAdmins can use on Active charts.

## Changes

### 1. Remove the toggle, banner, and provider
- Delete `<FacilitatorModeToggle />` from `src/components/layout/TopBar.tsx` (line 280) and the import (line 32).
- Delete `<FacilitatorModeBanner />` from `src/components/DashboardLayout.tsx` (line 609) and the import (line 12).
- Remove `<FacilitatorModeProvider>` wrapper in `src/App.tsx` (lines 265, 1152) and the import (line 9).
- Delete files:
  - `src/contexts/FacilitatorModeContext.tsx`
  - `src/components/eos/FacilitatorModeToggle.tsx`
  - `src/components/eos/FacilitatorModeBanner.tsx`

### 2. Make EOS guidance panels always-on for eligible staff
Each of these components currently early-returns `null` when Facilitator Mode is off. Replace the `useFacilitatorMode()` check with an eligibility check (`profile.unicorn_role === 'Super Admin' || 'Team Leader'`) via a small shared helper hook `useEosFacilitatorEligible()` (placed in `src/hooks/useEosFacilitatorEligible.ts`).

Files updated to use the new hook (remove `useFacilitatorMode`, swap the gate):
- `src/components/eos/facilitator/FacilitatorAlertsPanel.tsx`
- `src/components/eos/facilitator/FacilitatorChecklist.tsx`
- `src/components/eos/facilitator/FacilitatorHealthPanel.tsx`
- `src/components/eos/facilitator/FacilitatorOnboardingPanel.tsx`
- `src/components/eos/facilitator/FacilitatorPrompts.tsx`
- `src/components/eos/facilitator/QCInsights.tsx`
- `src/components/eos/facilitator/RocksInsights.tsx`
- `src/pages/EosHealth.tsx` (line 195 guidance block → eligibility check)
- `src/pages/EosOnboarding.tsx` (lines 137, 172, 271 → eligibility check; rename prop `isFacilitatorMode` → `showFacilitatorGuidance` for clarity)

### 3. Accountability Chart — per-chart Edit button (SuperAdmin only)
In `src/components/eos/accountability/ChartBuilder.tsx`:
- Remove the `useFacilitatorMode` import and usage.
- Add local state: `const [editingActive, setEditingActive] = useState(false)`.
- Add SuperAdmin check: `const isSuperAdmin = profile?.unicorn_role === 'Super Admin'`.
- Replace the edit gate:
  - **Before:** `canEdit = hasEditPermission && (isFacilitatorMode || chart?.status === 'Draft' || !chart)`
  - **After:** `canEdit = hasEditPermission && (chart?.status === 'Draft' || !chart || (chart?.status === 'Active' && isSuperAdmin && editingActive))`
- When `chart.status === 'Active'` and `isSuperAdmin` and not yet editing: render an inline **"Edit chart"** button (cyan, with pencil icon) in the chart header. Clicking sets `editingActive = true`.
- While `editingActive` is true: show a small banner *"You are editing an Active chart"* with a **"Done"** button that sets `editingActive = false`.
- Non-SuperAdmins viewing an Active chart see read-only, no Edit button — even if they have `hasEditPermission`.
- The seat-warning panel (lines 280, 291) and any other `isFacilitatorMode`-gated UI in this file: show whenever `canEdit` is true (i.e., during any edit session) instead of facilitator mode.

### 4. Tests
- `src/test/admin/addin-settings-shell.test.tsx` (lines 97-98): drop the `FacilitatorModeBanner` mock — the file no longer exists.
- Spot-check any other test mocks of the deleted modules.

## What does NOT change
- All EOS guidance/alerts/insights stay in the product — they're just always visible to Super Admin & Team Leader inside EOS pages.
- Team Members and client users continue to see no facilitator-only UI.
- `/eos/health` and stuck-alert data are untouched.
- No DB, RLS, or backend changes.

## Behavioural diff (user-facing)
- Top bar loses the green "FA… Active" pill on every page.
- Light blue banner on EOS pages is gone.
- EOS pages (Health, Onboarding, Meetings, Rocks, QC) automatically show their facilitator guidance to Super Admin and Team Leader users.
- Accountability Chart: Active charts show an **"Edit chart"** button — but only to SuperAdmins. Team Leaders can no longer edit a published Active chart (this is a tightening).

## Risk
- Low. Pure UX/permission refactor; no schema changes, no data migration.
- The one tightening: Team Leaders lose the ability to edit Active Accountability Charts. Per your direction this is intentional (SuperAdmin only).
