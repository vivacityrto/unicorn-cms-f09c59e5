## Client Burndown Chart

Adds a third hours surface to the client `/packages` cards: a compact line chart plotting cumulative hours used over time vs. an ideal pacing line. Strictly additive — one new view, one new hook, one new component, one wire-up.

### 1. Migration — `v_client_package_hours_timeline`

New file: `supabase/migrations/<timestamp>_v_client_package_hours_timeline.sql`

- `CREATE OR REPLACE VIEW public.v_client_package_hours_timeline WITH (security_invoker = true)`
- CTE `daily` aggregates `time_entries.duration_minutes` → hours, bucketed by `(start_at AT TIME ZONE 'Australia/Sydney')::date`, joined to `package_instances` for `tenant_id`
- Filters: `package_instance_id NOT NULL`, `duration_minutes > 0`, `start_at >= pi.start_date` (when set)
- Outer SELECT adds `cumulative_hours_used` via window `SUM ... ROWS UNBOUNDED PRECEDING` and `point_rank` via `ROW_NUMBER`
- `GRANT SELECT ... TO authenticated` + `COMMENT ON VIEW`
- Sparse: only days with activity. No DDL on existing tables. No modifications to any existing view.

### 2. RLS sanity test

New file: `supabase/tests/v_client_package_hours_timeline.sql` — three-persona pattern (tenant A, tenant B, super_admin) mirroring existing dashboard view tests.

### 3. Hook — `useClientPackageHoursTimeline`

New file: `src/hooks/use-client-package-hours-timeline.ts`

- Exports `ClientPackageHoursTimelinePoint` interface (typed, no `any`)
- `useQuery` keyed on `['client_package_hours_timeline', activeTenantId, packageInstanceId]`, `staleTime: 60_000`
- Explicit `.eq('tenant_id', activeTenantId)` AND `.eq('package_instance_id', packageInstanceId)`, ordered by `activity_date asc`
- `enabled` only when both IDs present
- Mirrors `use-client-package-hours-by-type.ts` patterns

### 4. Component — `PackageBurndownChart`

New file: `src/components/client/package-dashboard/PackageBurndownChart.tsx`

Props: `points`, `hoursTotal`, `hoursUsed`, `startDate`, `endDate`, `isLoading`, `isError`.

- Section heading: small uppercase muted **"Hours over time"** (matches sibling sections)
- `ResponsiveContainer` height ~180px
- `LineChart` with merged data array combining ideal endpoints + actual points, sorted + deduped by date, `connectNulls`
- **Actual line:** solid emerald, `type="stepAfter"`, plots `cumulative_hours_used`
- **Ideal line:** dashed slate-400, only when `startDate && endDate && hoursTotal > 0` (two endpoints: `(startDate, 0)` and `(endDate, hoursTotal)`)
- **Today marker:** `ReferenceLine` dashed fuchsia `#ED1878`, only when today falls inside plotted x-range
- X axis: `d MMM` if span ≤ 6mo else `MMM yyyy` (date-fns)
- Y axis: integers, domain `[0, ceil(max(hoursTotal, hoursUsed) * 1.1)]`
- Custom tooltip: date (`d MMM yyyy`), actual via `formatHours`, interpolated ideal at hovered date, delta — emerald "ahead", amber "behind", muted "On pace" (±0.5h band)
- No grid (or single muted horizontal), no legend, tight margins

**Edge cases:**
- `points.length === 0` → render nothing (parent receives empty fragment / null)
- One point → dot, no line; ideal still renders if applicable
- `hoursTotal === 0` → no ideal line
- `endDate` null → no ideal line; today marker still renders
- Over budget → Y-axis grows; tooltip honest
- Loading → ~180px skeleton
- Error → small inline destructive alert; doesn't block rest of card

### 5. Wire-up — `PackageCard` in `ClientPackagesPage.tsx`

- Import `useClientPackageHoursTimeline` and `PackageBurndownChart`
- Call hook alongside existing dashboard / breakdown / recent hooks
- Insert `<PackageBurndownChart ... />` directly after `<PackageHoursBreakdown />` (line ~251) and before `<PackageStageStepper />` (line ~258)
- Pass `dashboard.data?.hours_total/hours_used/start_date/end_date` plus `timeline.data ?? []`, `timeline.isLoading`, `timeline.isError`

### Privacy & security guarantees

- View `security_invoker = true` → RLS delegated to `time_entries` and `package_instances`
- Hook adds explicit `tenant_id` filter (defence in depth, matches `useReleasedAudits`)
- No `is_billable`, no `user_id`, no consultant attribution surfaced
- AEST/AEDT date bucketing matches operational reality
- `start_at >= pi.start_date` excludes pre-period mis-attributions, consistent with sibling views

### Out of scope (explicit non-goals)

Cross-package burndown, PDF export, forecast/projection lines, per-stage burndown, drill-to-entries, on-hold annotations. Existing views, tables, EOS/L10, Scorecards, audit module, Vivacity Academy untouched.

### Sanity SQL (for PR description after deploy)

1. AHMRC `package_instance_id = 15152` timeline rows
2. Final cumulative reconcile against `v_client_package_dashboard.hours_used`
3. Cross-platform count of packages with ≥ 2 timeline points
