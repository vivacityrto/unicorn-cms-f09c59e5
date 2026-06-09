# Role Permission Editor — Implementation Plan

## Route & Access
- New route `/administration/role-permissions` registered in `src/App.tsx` wrapped in `ProtectedRoute requireSuperAdmin`.
- Add nav entry in `src/config/navigationConfig.ts` under Administration, gated so it only renders when `isSuperAdmin()` from `useRBAC()` returns true.
- Page component is SuperAdmin-only; non-SA users are redirected by `ProtectedRoute`.

## Files to create
- `src/pages/admin/RolePermissionsEditor.tsx` — page shell (PageHeader, filters, table, drawer).
- `src/hooks/useRolePermissions.ts` — React Query hooks for the 4 reads + the save mutation.
- `src/components/admin/role-permissions/PermissionMatrix.tsx` — the sticky-header table grouped by category.
- `src/components/admin/role-permissions/PermissionCell.tsx` — dropdown cell with color-coded chips, lock state, unset state, dirty state.
- `src/components/admin/role-permissions/ChangeLogDrawer.tsx` — right-side drawer using `Sheet`.
- `src/components/admin/role-permissions/ModuleFilterTabs.tsx` — horizontal scrollable pill tabs.

## Data Loading (parallel via React Query)
On mount, fire four queries in parallel:
1. `permission_features` ordered by `sort_order` (active only).
2. `role_permissions` — full matrix.
3. `dd_unicorn_roles WHERE is_internal = true AND is_active = true ORDER BY sort_order` → dynamic column headers (`value` is DB key, `label` is display).
4. Gap detection — computed client-side by cross-joining features × roles and subtracting existing `role_permissions` rows (no need for a server view; simpler and avoids the SQL `CROSS JOIN ... WHERE ... LEFT JOIN` ordering issue in the prompt).

If gaps > 0: yellow banner above the table — "⚠️ N unconfigured permissions — review and set below."

## Layout
```
PageHeader: "Role Permission Editor"
  Subtitle: Control which roles can access each feature...
  Actions: [Save All Changes (N)]  [View Change Log]

[Yellow gap banner — conditional]

ModuleFilterTabs: All | Administration | Clients | Packages | EOS | Audits | Academy | Resource Hub
Search input: filter features by label (client-side)

PermissionMatrix:
  sticky <thead>: Feature | <role columns from dd_unicorn_roles>
  category header rows (dark bg, full-width <td colspan>)
  feature rows: label + tooltip(description) + one PermissionCell per role
```

Module filter maps to `permission_features.module` (or `category`). Tabs render only modules present in the data plus "All".

## PermissionCell behaviour
| State | Render |
|---|---|
| Role = `Super Admin` | Lock icon + static "● Full" chip, no dropdown, tooltip "Super Admin always has full access." |
| No `role_permissions` row (gap) | Amber striped background, "— Unset" label. Click → becomes active dropdown. |
| Configured | `Select` with options: `● Full` (purple), `◐ Limited` (cyan), `★ Owner only` (amber), `○ None` (grey). |
| Staged edit | Subtle ring/tint border; row gets a small yellow dot in the leftmost gutter. |

Color tokens added to `src/index.css` / `tailwind.config.ts` as semantic chips (`--perm-full`, `--perm-limited`, `--perm-owner`, `--perm-none`) — no raw hex in components.

## Staged edit state
Local `useState<Map<string, Permission>>` keyed by `${feature_key}::${role}`. Save button disabled until map is non-empty. Discard button clears the map.

## Save flow
On "Save All Changes":
1. Iterate staged edits sequentially.
2. For each: `supabase.functions.invoke('update-role-permission', { body: { feature_key, role, new_permission, reason } })`.
3. Progress toast: `"Saving 4 of 7..."` (updated in place).
4. Track per-cell success/failure.
5. On all success: success toast `"N permission changes saved and logged."` + `queryClient.invalidateQueries(['role-permissions'])` + clear staged map.
6. On any failure: keep failed cells staged, show a summary toast listing failed `(feature, role)` pairs with a Retry button that re-runs only those.

No optimistic UI — wait for edge function confirmation per cell.

## Change Log Drawer
- `Sheet` from `right`, width ~`sm:max-w-xl`.
- Query: `permission_change_log` joined with `users` for changed-by name, ordered `created_at desc`, limit 200 with "Load more".
- Each entry card: timestamp (`dd/MM/yyyy HH:mm`), changed-by, feature label (joined via `permission_features`), role, `old_permission → new_permission` colored chips, reason (italic if present, "—" if null).
- Filters at top of drawer: date range (`DateRangePicker`), feature `Select`, role `Select`. All applied client-side over the loaded page; if filters cause empty result, show "No matching entries."

## Technical Notes
- Reuse: `PageHeader`, `Table` primitives, `Select`, `Sheet`, `Input`, `Tabs`, `Tooltip`, `Badge`, sonner `toast`.
- Date formatting via existing `date-fns` `dd/MM/yyyy` per project standard.
- All DB reads via `supabase.from(...)`; writes ONLY via the `update-role-permission` edge function (no direct writes to `role_permissions` from the browser).
- Empty-value Select handling: not needed here — permission set is fixed and complete.
- No new migrations. No new edge functions (uses existing `update-role-permission`).

## Out of scope
- Adding/removing features or roles (managed via Code Tables / migrations).
- Bulk apply (e.g. "set all Limited") — can be added later if requested.
- Per-tenant permission overrides.
- RLS audit for `role_permissions` table (separate task).

## Manual verification after build
1. Load page as SA → matrix renders with dynamic role columns from `dd_unicorn_roles`.
2. Load page as non-SA → redirected to `/dashboard`, nav entry not visible.
3. Gap banner appears when unconfigured cells exist; clicking an unset cell allows configuration.
4. Stage edits across 2+ rows → row dots + Save button enabled → Save runs sequentially with progress → success toast + cache invalidated.
5. Force an edge function failure (e.g. attempt to set Super Admin to None via devtools) → error surfaced, edit retained, retry works once corrected.
6. Open Change Log drawer → recent entries appear with correct old→new chips and reason; filters narrow results.
