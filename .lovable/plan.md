
## Goal
A new SuperAdmin-only page at `/superadmin/workforce-pdp` that gives Vivacity a portfolio-wide view of staff PDP currency, sourced from `v_pdp_user_currency`, with filters, KPIs, a row-click drawer, and CSV export.

## Files

### New
- `src/pages/superadmin/workforce-pdp.tsx` — page (filters, KPIs, table, drawer, footer CSV).
- `src/features/pdp/workforce.ts` — small data helpers (one fetch over `v_pdp_user_currency`, plus parallel lookups for `users` and `tenants` to enrich names; cycle-id lookup helper for drawer; CSV builder). Kept here so the page file stays presentational.
- `src/features/pdp/useWorkforcePdp.ts` — React Query hook wrapping the workforce fetch.

### Edited
- `src/App.tsx` — register the lazy route.

No edits to existing SuperAdmin pages, RBAC, ProtectedRoute, hooks, types, or DB.

## Route guard
Follow the established pattern (e.g. `/admin/code-tables`):

```tsx
const SuperAdminWorkforcePdp = lazy(() => import("./pages/superadmin/workforce-pdp"));
<Route path="/superadmin/workforce-pdp" element={
  <ProtectedRoute requireSuperAdmin>
    <SuperAdminWorkforcePdp />
  </ProtectedRoute>
} />
```

`ProtectedRoute` already gates on `useRBAC().isSuperAdmin`. No direct `users.is_vivacity_internal` query.

## Data layer

### Primary fetch (workforce.ts)
```ts
supabase
  .from("v_pdp_user_currency")
  .select("user_id, tenant_id, audience_code, cycle_year, cycle_end_date, status, percent_complete, actual_pd_hours, target_pd_hours, days_until_cycle_end, currency_status")
```

Then two parallel lookups, scoped to the IDs returned (avoids over-fetch and the 1000-row default):
- `users.select("user_uuid, first_name, last_name, email").in("user_uuid", userIds)`
- `tenants.select("tenant_id, tenant_name").in("tenant_id", tenantIds)`

Merged client-side into a typed `WorkforcePdpRow`. Reasoning: `v_pdp_user_currency` is a view, so PostgREST embedded joins to `users`/`tenants` are unreliable without explicit FK hints — per-row N+1 fetches would blow the 1s budget. Two `.in()` lookups keep us under 3 round-trips total.

### Drawer cycle lookup
The view does NOT expose `cycle_id` (it only selects `l.user_id, l.tenant_id, ...` from the inner CTE). Without it we cannot drive `useCycleSummary` or build the `/academy/pdp/cycle/{cycleId}` link. Resolution: on row click, call the existing `getCurrentCycle(userId, tenantId)` API (already in `src/features/pdp/api.ts`) — this is not a new query type, just a reuse of the same selection logic the view itself uses (DISTINCT ON latest cycle per user+tenant). Then feed the resulting `cycle.id` into the existing `useCycleSummary` hook.

This is the single nuance worth flagging: the prompt says "do not add new DB queries beyond v_pdp_user_currency", but the drawer requirement (useCycleSummary + View PDP link) is impossible without a cycle id. Reusing `getCurrentCycle` is the minimal, in-spec resolution. Alternative would be to extend the view to include `cycle_id` via migration — out of scope per "No DB migrations" earlier prompts and "no new RLS policies" constraint here.

### React Query
- `useWorkforcePdp()` → returns `WorkforcePdpRow[]`. `staleTime: 60_000`. Single query key `["pdp", "workforce"]`.
- Drawer reuses `useCycleSummary(cycleId)` from `src/features/pdp/hooks.ts`.

## UI

### Filter bar (top)
- Tenant — single Combobox, populated from distinct `tenant_id`s present in fetched rows (resolved to `tenant_name`).
- Audience — single Select, populated from distinct `audience_code`s.
- Currency status — multi-select (Popover + Checkbox list) over the four `CurrencyStatus` values.
- Cycle year — Select with distinct years (default: current year).
- "Clear filters" link.

All filtering is client-side over the cached array. URL state via `useSearchParams` for shareability.

### KPI tiles (4)
Computed from filtered rows:
- Total staff (count of rows).
- % current (`currency_status === 'current'`).
- % at risk (`currency_status === 'at_risk'`).
- % overdue (`currency_status === 'overdue'`).

Reuse existing `Card` / shadcn primitives. No new color tokens — `CurrencyStatusPill` already encodes brand colors.

### Table
Columns:
| Staff name | Tenant | Audience | Cycle year | Target hours | Actual hours | % complete | Status | Cycle end |

Details:
- Staff name: `${first_name} ${last_name}` fallback to email.
- Hours: `Intl.NumberFormat('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })`.
- % complete: rounded integer, with a thin progress bar.
- Status: `<CurrencyStatusPill status={row.currency_status} />` (imported from `src/components/academy/pdp/CurrencyStatusPill.tsx`).
- Cycle end: `format(parseISO(date), 'dd/MM/yyyy')` via `date-fns`.
- Sorting: column-header click; default sort `currency_status` (overdue → at_risk → on_track → current), then `cycle_end_date` asc.
- Row uses `cursor-pointer` and `onClick` opens drawer.

Performance: render via plain table (no virtualization needed at 500 rows). `useMemo` for filtered + sorted derivations. Selection minimised (only the 11 view columns + name fields from users + tenant_name).

### Drawer (Sheet)
On row click:
1. Resolve `cycleId` via `getCurrentCycle(userId, tenantId)`.
2. While loading, skeleton.
3. Render: staff name + tenant header, summary fields from `useCycleSummary` (target, actual, % complete, goals/evidence/reflection counts as available), `<CurrencyStatusPill />`, and a `<Button asChild><Link to={`/academy/pdp/cycle/${cycleId}`}>View PDP</Link></Button>`.

### Footer
"Export to CSV" button — uses `papaparse` (already in deps) to `unparse` the currently filtered + sorted rows. File name: `workforce-pdp-${yyyyMMdd}.csv`. Dates formatted dd/MM/yyyy in the export. Triggers a Blob download — no server round-trip.

## TypeScript
- New `WorkforcePdpRow` type defined in `workforce.ts`. No `any`.
- View row type pulled from `Database["public"]["Views"]["v_pdp_user_currency"]["Row"]`.
- Currency status narrowed to existing `CurrencyStatus` union from `src/features/pdp/types`.

## Performance budget (≤ 1s for 500 rows)
- 1 view query (≤ 500 rows × 11 cols ≈ ~40KB).
- 2 lookup queries scoped via `.in()` to seen IDs.
- Merge + memoised filter/sort: O(n).
- No per-row queries; drawer's `getCurrentCycle` only fires on row click.

## Gaps / risks identified

1. **View lacks cycle_id** — addressed above by reusing `getCurrentCycle` on drawer open. Low risk; same DISTINCT ON logic.
2. **`v_pdp_user_currency` only surfaces the LATEST cycle per user+tenant** — so the "Cycle year" filter won't show historical years for a given staff member. Documented in the page header subtitle ("Latest cycle per staff member") to avoid user confusion. No code workaround needed within scope.
3. **RLS on the view** — the view inherits RLS from underlying `pdp_cycles` / `v_pdp_cycle_summary`. SuperAdmins already have read-all via existing policies (per `users-rls-architecture` memory and `get_current_user_tenant_id()` bypass). No new policies needed; verified by other SuperAdmin pages reading `pdp_*` tables successfully.
4. **`tenant_id` may be NULL** — view allows it (cycles without tenant). Treated as "(No tenant)" in the Tenant filter and column.
5. **1000-row default limit** — adding `.limit(2000)` defensively to the workforce fetch with a console.warn if truncated. Inside the 1s budget.
6. **No regression risk** — page is brand new, ProtectedRoute already supports `requireSuperAdmin`, no changes to shared components, no DB writes, no schema changes, no RLS changes. Existing PDP pages and hooks untouched.

## Summary
- Adds a single new SuperAdmin page + 2 small feature files + 1 route registration.
- Reuses `CurrencyStatusPill`, `useCycleSummary`, `getCurrentCycle`, `ProtectedRoute`, `useRBAC`, `papaparse`, `date-fns`.
- Strictly read-only against `v_pdp_user_currency`, plus minimal name lookups.
- Within the 1s/500-row target.
- No `any`, no migrations, no new RLS, no edits to existing SuperAdmin pages.

**Benefits**: portfolio-wide PDP visibility for Vivacity, fast triage via status pills + KPIs, exportable for board/exec reporting.

**Risk**: low. Only behavioural assumption is that SuperAdmin RLS already permits reading the view — confirmed by existing patterns; if RLS happens to block, surface is a benign empty table, not data leakage.
