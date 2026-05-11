# PDP Cycle Detail View

Build the learner cycle detail page at `src/pages/academy/pdp/cycle/[cycleId].tsx`, wrapped in `AcademyLayout` + `AcademyPageWrapper`, registered as a lazy route in `src/App.tsx` at `/academy/pdp/cycle/:cycleId`.

## Header band

`CycleHeaderBand.tsx` (new):
- Title: `{audience.label} — {cycle_year}` (audience resolved via `useAudiences`)
- Subhead: date range `dd/MM/yyyy → dd/MM/yyyy`
- Right: status `Badge` (Planning / Active / Under review / Completed)
- "Edit cycle" button → `EditCycleDrawer` (shadcn `Sheet`) with fields: `target_pd_hours` (number), `cycle_end_date` (shadcn date picker w/ `pointer-events-auto`), `notes` (textarea). Saves via new `useUpdateCycle` mutation (updates `pdp_cycles` row, invalidates summary + cycle queries).
- "Close cycle" button (only when status is `active` or `under_review`) → confirmation `AlertDialog` with required `outcome_notes` textarea. On confirm: new `useCloseCycle` mutation sets `status='completed'`, `completed_at=now()`, `completed_by=auth.uid()`, appends outcome notes to `notes` column.

## Tabs (shadcn `Tabs`)

### Overview
- Re-uses `PdpProgressCard` from Prompt 2 (dial + stats).
- New `EvidenceByTypeChart.tsx` — `recharts` stacked `BarChart` of `sum(duration_minutes)/60` grouped by `evidence_type`. Data from `useEvidence(cycleId)` reduced client-side. Brand cyan `#23C0DD` for primary bar, fuchsia `#ED1878` for secondary stack (formal vs informal).
- New `CurrencySplitChart.tsx` — small `BarChart` showing `vet_currency_hours` vs `industry_currency_hours` from `v_pdp_cycle_summary`.

### Goals
`GoalsTab.tsx`:
- `useGoals(cycleId)` + new `useStandardsReference(ids[])` to bulk-resolve `standards_reference` (joins `framework + code` → `"SRTO 3.2(c)"`).
- Each row: priority `Badge` (high/medium/low colour), standard code chip, title, status badge, `evidence_count / target_evidence_count` progress (counts via groupBy of evidence on `goal_id`).
- Add/Edit triggers existing `AddGoalSheet` (Prompt 5 wires the form). Delete via icon → `useDeleteGoal` mutation.

### Evidence
`EvidenceTab.tsx`:
- Table columns: `occurred_on` (dd/MM/yyyy), type (icon + label via `iconForEvidenceType` helper), title, `duration_hours` (= minutes/60), goal title, status, verified (`CheckCircle2` icon).
- Filters: type `Select` (multi via popover), date range picker.
- "Add evidence" opens `AddEvidenceSheet` (Prompt 6).

### Reflections
`ReflectionsTab.tsx`:
- `useReflections(cycleId)` joined client-side with `academy_lesson_progress` → `academy_lessons.title`, or `pdp_evidence_items.title` when sourced from evidence.
- Each card: source label (lesson title / evidence title), prompt, response (`prose` styling), `created_at` (dd/MM/yyyy).
- Read-only (new reflections are created in-lesson Prompt 7 or from an evidence row).

### Reviews
`ReviewsTab.tsx`:
- `useReviews(cycleId)`. Rows: review type, reviewer, review_date, outcome badge, notes.
- Pending end-of-cycle reviews show "Sign off" button → `useSignOffReview` (already exists). Wired by Prompt 8.

## Right rail (desktop only, `lg:` breakpoint)
`AuditExportCard.tsx`:
- "Audit-ready export" button → calls `supabase.functions.invoke('pdp-export', { body: { cycle_id } })` (Edge Function lands in Prompt 11 — button shows toast "Export coming soon" with disabled state if function returns 404; otherwise opens returned `signed_url` in a new tab and stores latest URL in component state with copy-to-clipboard.)
- Shows last-generated timestamp.

## Layout
- Mobile: header + tabs + content stacked, no right rail.
- Desktop ≥ `lg`: 2-column grid `lg:grid-cols-[1fr_320px]` with right rail.
- Use semantic tokens; brand hex inline only on chart series and currency pill.

## Data layer additions (`src/features/pdp/`)
- `api.ts`: `updateCycle({ cycleId, target_pd_hours, cycle_end_date, notes })`, `closeCycle({ cycleId, outcomeNotes })`, `deleteGoal(goalId)`, `getCycleById(cycleId)`, `listStandardsReference(ids)`.
- `hooks.ts`: `useCycle(cycleId)`, `useUpdateCycle`, `useCloseCycle`, `useDeleteGoal`, `useStandardsReference(ids)`.
- All mutations invalidate `[pdp, cycle, cycleId]`, `[pdp, cycle-summary, cycleId]`, `[pdp, current-cycle]` as appropriate.

## Files
- **Created**: `src/pages/academy/pdp/cycle/[cycleId].tsx` and 8 components under `src/components/academy/pdp/cycle/` (`CycleHeaderBand`, `EditCycleDrawer`, `CloseCycleDialog`, `OverviewTab`, `EvidenceByTypeChart`, `CurrencySplitChart`, `GoalsTab`, `EvidenceTab`, `ReflectionsTab`, `ReviewsTab`, `AuditExportCard`).
- **Edited**: `src/App.tsx` (add `/academy/pdp/cycle/:cycleId` lazy route), `src/features/pdp/api.ts` and `hooks.ts` (new functions/hooks above).

## Out of scope
- The Add/Edit Goal form internals (Prompt 5), Add Evidence form internals (Prompt 6), in-lesson Reflection drawer (Prompt 7), Review sign-off UX details (Prompt 8), `pdp-export` edge function (Prompt 11). Existing placeholder sheets are reused.
- No DB migrations.

## Verification
- `bunx tsc --noEmit` clean.
- Navigate from `/academy/pdp` → "Open my PDP cycle" lands on detail view.
- Tabs switch; charts render with sample evidence; close-cycle dialog requires notes; status pill flips to Completed after close.
