## Bug Fix Plan: Dashboard label terminology + "View Tasks" navigation

Two minimal, isolated edits across two files.

### File 1: `src/pages/Dashboard.tsx`

**Edit A (line 76) — subtitle terminology:**
Change the conditional text only. Comparison values (`'my_tenants'`) are untouched.
```tsx
{savedView === 'my_tenants' ? 'My Clients' : 'All Clients'} · {activePortfolio.length + lowAttention.length} active
```

**Edit B (lines 112–114) — TodaysFocus onAction:**
Route-aware navigation; falls back to drawer when no route.
```tsx
onAction={(item) => {
  if (item.actionRoute) {
    navigate(item.actionRoute);
  } else {
    openDrawerById(item.tenantId);
  }
}}
```
`navigate` is already in scope (line 19). `actionRoute?: string` exists on focus items (`src/hooks/useDashboardTriage.ts:114`) and is populated for the task-related focus items (`/my-work`, `/tasks-management`).

### File 2: `src/components/portfolio/PortfolioFilterBar.tsx`

**Edit C (lines 40–41) — SelectItem display labels only:**
```tsx
<SelectItem value="my_tenants">My Clients</SelectItem>
<SelectItem value="all_tenants">All Clients</SelectItem>
```
The `value` attributes remain `my_tenants` / `all_tenants` so all filtering logic and `savedView` comparisons continue to work unchanged.

### Out of scope (explicitly untouched)
- `savedView` state, its values, or any filter logic
- `openDrawerById` and all other callers
- Any DB / RLS / migrations / edge functions
- Any other files, hooks, or components

### Verification after apply
- Saved-view toggle still filters My/All correctly (values unchanged).
- Today's Focus items with `actionRoute` (`/my-work`, `/tasks-management`) navigate via router; items without a route still open the tenant drawer.
- Subtitle active count renders unchanged.