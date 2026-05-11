## Tenant Staff PDPs page

A tenant-scoped mirror of the SuperAdmin Workforce PDP dashboard, available to client tenant admins for their own tenant only.

### Decisions (confirmed)

- Gate: `canManagePortalUsers` from `useClientTenant()` (same gate as `/client/users`: `access_scope='full'` AND primary or secondary contact).
- Route: `/client/staff-pdps` under `ClientLayout` so it inherits `ClientTenantProvider`, `ClientRouteGuard`, and the client sidebar. The originally-requested `/tenant/staff-pdps` URL is dropped because mounting outside `/client/*` would require duplicating the provider/guard and a custom gate, contrary to the "use existing pattern" rule.

### Files

**New: `src/pages/client/StaffPdpsPage.tsx`**
- Wrapped page component (no `DashboardLayout` — `ClientLayout` already provides chrome).
- Reads `activeTenantId`, `canManagePortalUsers`, `tenantUserLoading` from `useClientTenant()`.
  - While `tenantUserLoading` or `activeTenantId === null` → skeleton.
  - If not `canManagePortalUsers` → render an inline "You don't have access to this page" panel (no redirect; consistent with how `/client/users` blocks non-admins via `ClientRouteGuard`'s `USER_MANAGEMENT_PREFIXES`).
- Reuses existing primitives — no duplication:
  - `useWorkforcePdp()` from `@/features/pdp/useWorkforcePdp` for the data, then filters client-side by `r.tenant_id === activeTenantId`. The view `v_pdp_user_currency` already enforces RLS, and `useWorkforcePdp` caps at 2000 rows; per-tenant volume is far below that. (Optimisation note below.)
  - `CurrencyStatusPill`, `useCycleSummary`, `getCurrentCycle`, types from `@/features/pdp/*`.
  - Same `fmtDate` (dd/MM/yyyy via date-fns), `STATUS_LABEL`, `STATUS_RANK`, `numberAU` formatter as the SuperAdmin page (small local copies — no shared-utility refactor to keep blast radius zero).
- Layout:
  - Header: "Staff PDPs" + subtitle "Latest PDP cycle for your team."
  - Filter bar: Audience (Select), Currency status (multi-select Popover + Checkbox), Cycle year (Select). No tenant selector.
  - KPI tiles (4): total staff, % current, % at risk, % overdue.
  - Table: Staff name, Audience, Cycle year, Target hrs, Actual hrs, % complete (Progress + label), Currency status pill, Cycle end (dd/MM/yyyy). No "Tenant" column. Row click → drawer.
  - Drawer (`Sheet`): cycle summary (target/actual/% with Progress) + "View PDP" → `/academy/pdp/cycle/{cycleId}` via `getCurrentCycle(user_id, activeTenantId)` and `useCycleSummary`.
  - Footer: disabled `Button` "Export audit pack" wrapped in a `Tooltip` saying "Coming soon".
- Filter state stored in `useSearchParams` (audience, status, year) — same pattern as workforce page.
- All TS strictly typed using `WorkforcePdpRow`, `CurrencyStatus`. No `any`.

**New thin wrapper: `src/pages/client/StaffPdpsWrapper.tsx`** (matches the `*Wrapper` convention used by every other `/client/*` route in `App.tsx`).
- Default export wraps `StaffPdpsPage` (no extra logic; just to follow the existing lazy-import naming convention).

**Edited: `src/App.tsx`**
- Add `const StaffPdpsWrapperNew = lazy(() => import("./pages/client/StaffPdpsWrapper"));` near the other `Client*WrapperNew` imports.
- Add route alongside existing `/client/*` routes:
  `<Route path="/client/staff-pdps" element={<ProtectedRoute><StaffPdpsWrapperNew /></ProtectedRoute>} />`
- No changes to `/superadmin/*` routes or any existing component.

**Optional (not in scope unless requested):** sidebar entry in `ClientSidebar.tsx`. Out of scope per "do not touch existing components"; the page is reachable via direct URL until a follow-up.

### Things explicitly NOT done

- No new RLS policies, no DB migrations, no edits to `v_pdp_user_currency`, `pdp_cycles`, or any PDP table.
- No edits to `src/pages/superadmin/workforce-pdp.tsx`, `useWorkforcePdp.ts`, `workforce.ts`, `CurrencyStatusPill.tsx`, `features/pdp/api.ts`, or `features/pdp/hooks.ts`.
- No ZIP/DOCX generation. Export button is a disabled stub with a tooltip.
- No tenant selector.

### Deep-dive findings, gaps, and risks

1. **Terminology mismatch — resolved.** The brief said "tenant_users row of role admin or owner". The schema has no `admin`/`owner` values; `tenant_users.role` is a free-text legacy column and `relationship_role` is an enum (`primary_contact | secondary_contact | user | academy_user`). Confirmed with the user: gate on `canManagePortalUsers`. This is identical to the `/client/users` gate, so no new authorisation surface is introduced.
2. **Route placement — resolved.** `/tenant/staff-pdps` would have been outside `ClientTenantProvider` (only mounted in `ClientLayout` and `AcademyLayout`). Confirmed move to `/client/staff-pdps`.
3. **Data scoping vs RLS.** `v_pdp_user_currency` is a SECURITY INVOKER view; tenant admins already only see their own tenant's rows (per the brief: "existing policies already permit tenant admins to read their own tenant's PDP data"). The client-side `tenant_id === activeTenantId` filter is defence-in-depth, not a primary gate.
4. **Workforce hook reuse.** `useWorkforcePdp` returns up to 2000 rows across all tenants visible to the caller. For a tenant admin RLS will already narrow this, so reuse is safe and avoids forking a parallel hook. If a future tenant grows past ~2000 staff this would need pagination — flagged but not addressed (not relevant today).
5. **Drawer cycle lookup.** `getCurrentCycle(user_id, activeTenantId)` is the same call pattern used by the SuperAdmin drawer; works identically for tenant admins.
6. **`tenantUserLoading` race.** Resolved by gating render on it, mirroring `ClientRouteGuard`. Prevents the brief "no access" flash before tenant_users is fetched.
7. **No regression to existing pages.** Only additive: one new page, one new wrapper, one new route line in `App.tsx`. No shared file is mutated.
8. **Accessibility / a11y.** The disabled "Export audit pack" button uses `Tooltip` (focus-visible), and the table row click is mirrored on Enter via existing `TableRow` semantics — no extra keyboard handler needed since the SuperAdmin equivalent uses the same pattern (acceptable for parity; a follow-up could add explicit `role="button"` but is out of scope).
9. **Memory consistency.** Uses `bigint` `tenant_id`, `dd/MM/yyyy`, cyan (semantic tokens via existing primitives), `__none__` sentinel for empty Selects, `tenant_users` as membership source — all aligned with project memory.

### Risk assessment

- **Functional regression risk:** very low. No existing files modified except `App.tsx` (one lazy import + one route line in the `/client/*` block).
- **Security risk:** very low. RLS unchanged; UI gate matches `/client/users`; route additionally protected by `ProtectedRoute` and the inherited `ClientRouteGuard`.
- **Performance risk:** low. Reuses existing cached query (`["pdp","workforce"]`) — opening this page after the SuperAdmin page (or vice versa for staff who have both) hits cache; for tenant admins it's a single tenant-scoped fetch via RLS.
- **UX risk:** low. Layout/filters mirror an already-shipped page; drawer + deep link reuse identical components.

### Summary of changes

- Add `src/pages/client/StaffPdpsPage.tsx` (page) and `src/pages/client/StaffPdpsWrapper.tsx` (lazy wrapper).
- Add `/client/staff-pdps` route in `src/App.tsx`.

### Benefits

- Tenant admins get the same currency-at-a-glance view Vivacity SuperAdmins use, scoped automatically to their tenant.
- Zero duplication of business logic — all data, types, and pills come from `@/features/pdp/*`.
- No new attack surface; gate and provider already battle-tested by `/client/users`.
