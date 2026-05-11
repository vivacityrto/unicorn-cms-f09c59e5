## /academy/pdp — Learner Dashboard

Builds the staff member's own PDP home page using existing PDP feature hooks (`src/features/pdp/hooks.ts`) and the Academy shell. Sheets/drawers referenced (Add Evidence, Add Goal, Reflection) are stubbed as placeholder components in this prompt — they will be implemented in Prompts 5–7.

### Files

**`src/pages/academy/pdp/index.tsx`** — route entry, wrapped in `AcademyPageWrapper` (title "My Professional Development Plan", icon `Target`).

**`src/components/academy/pdp/`** (new directory):
- `PdpHeaderBand.tsx` — heading, audience label + cycle year subhead, right-aligned status `Badge`.
- `PdpProgressCard.tsx` — `recharts` `RadialBarChart` (percent_complete) + stacked stats (hours logged, goals met, reflections) + `CurrencyStatusPill` beside the dial.
- `CurrencyStatusPill.tsx` — traffic-light pill mapping `currency_status` → `current` emerald, `on_track` cyan `#23C0DD`, `at_risk` macaron `#F9CB0C`, `overdue` fuchsia `#ED1878`.
- `PdpActionRow.tsx` — three buttons: primary "Log evidence", secondary "Add a goal", tertiary "Open my PDP cycle" → `/academy/pdp/cycle/${cycleId}`.
- `RecommendedCoursesPanel.tsx` — up to 6 course cards.
- `RecentEvidenceList.tsx` — 5 most recent items, type icon, title, hours, `dd/MM/yyyy`, "Add reflection" link.
- `StartCycleEmptyState.tsx` — single CTA card; opens `StartCycleModal` (shadcn `Dialog`) that submits `useCreateCycle` with the defaults below.
- Sheet placeholders: `AddEvidenceSheet.tsx`, `AddGoalSheet.tsx`, `AddReflectionDrawer.tsx` — render an empty shadcn `Sheet`/`Drawer` with TODO note (full UI deferred to later prompts). Page wires open/close state and selected evidence id for reflections.

### Route registration

`src/App.tsx`: add `const AcademyPdpPage = lazy(() => import("./pages/academy/pdp"));` and `<Route path="/academy/pdp" element={<ProtectedRoute><AcademyPdpPage /></ProtectedRoute>} />` next to other `/academy/*` routes.

### Data flow

- `useCurrentCycle(userId, tenantId)` — userId from `useAuth`, tenantId from existing tenant context. If `null` → render `StartCycleEmptyState`.
- `useCycleSummary(cycleId)` → `percent_complete`, hours logged, goals met, reflections count.
- `useUserCurrency(userId)` (new hook in `src/features/pdp/hooks.ts`, queries `v_pdp_user_currency`) → currency status.
- `useAudiences()` for label resolution.
- Recommended courses: new `useRecommendedAcademyCourses(audienceCode, userId)` query — `academy_courses` where `status='published'` and `target_audience` array contains audience code, left-anti-joined against `academy_enrollments` for the user. "Start course" calls a mutation inserting into `academy_enrollments` with `source='pdp_recommendation'`, then invalidates the recommendations query.
- Recent evidence: `useEvidence(cycleId)` → slice top 5 by `occurred_on desc`.

### Start-cycle defaults

Used by `StartCycleModal` via `useCreateCycle`:
- `audience_code`: from user's primary role on `users` table (read-once query).
- `cycle_year`: `new Date().getFullYear()`.
- `cycle_start_date`: today (ISO).
- `cycle_end_date`: today + 12 months.
- `target_pd_hours`: `audience.target_pd_hours_default` (from `useAudiences`).
- `status`: `'active'`.

### Styling

- Mobile-first single column; `md:` breakpoint for two-column header (dial + currency pill side-by-side).
- Use Tailwind tokens; brand hex inline only for the four currency states (cyan `#23C0DD`, macaron `#F9CB0C`, fuchsia `#ED1878`, emerald via Tailwind `emerald-500`).
- Active nav state for "My PDP" already wired via Vivacity Acai (`#44235F`) in the nav config.

### Out of scope

- Full Add Evidence / Goal / Reflection forms (Prompts 5–7).
- `/academy/pdp/cycle/[cycleId]` detail page (separate prompt).
- No DB migrations, no edits to existing Academy components.

### Verification

- `bunx tsc --noEmit` clean.
- Route loads under Academy shell with side nav and Vivacity logo.
- With no current cycle → empty-state CTA → modal creates cycle → page rerenders with dial.
- Currency pill colours match the four states.
- "Start course" inserts an enrollment and the card disappears from the list.
