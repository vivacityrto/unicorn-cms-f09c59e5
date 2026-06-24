## Add KPI entries to EOS sidebar section

In `src/components/DashboardLayout.tsx`:

1. Import `useAuth` (if not already used in component for `profile`) and `useKpiAccess` from `@/hooks/useKpiAccess`. Add `Gauge` (or reuse an existing lucide icon already imported, e.g. `BarChart3`/`Target`) for KPI items.
2. Inside the component, read `profile?.kpi_role` and `const { canViewAnyStaff } = useKpiAccess();`.
3. Extend `filteredEosItems` memo (deps include `profile?.kpi_role`, `canViewAnyStaff`) to append, after the existing static EOS items:
   - If `profile?.kpi_role` is set (any non-null value): `{ icon: Gauge, label: "My KPI", path: "/my/kpi" }`
   - If `canViewAnyStaff` is true: `{ icon: BarChart3, label: "KPI Review", path: "/admin/kpi-review" }` and `{ icon: Target, label: "KPI Overview", path: "/admin/kpi-overview" }`
4. Users with no `kpi_role` and not SuperAdmin/reviewer get nothing extra.

No other sections, routes, or styles changed — entries follow the same `{ icon, label, path }` shape as the existing EOS items so `renderSection("eos", ...)` handles them automatically.
