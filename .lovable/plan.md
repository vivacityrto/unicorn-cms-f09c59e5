## Goal
Remove the legacy `/manage-packages` dashboard page (frontend only). Leave `/admin/manage-packages` and all data/hooks/DB objects untouched.

## Files to delete
- `src/pages/ManagePackages.tsx`
- `src/pages/ManagePackagesWrapper.tsx`

## Files to edit

1. **`src/App.tsx`**
   - Remove the lazy import of `ManagePackagesWrapper` (line 48).
   - Remove the `<Route path="/manage-packages" ...>` block (lines 598-605).

2. **`src/components/DashboardLayout.tsx`**
   - Remove the sidebar entry `{ icon: Package2, label: "Packages", path: "/manage-packages" }` (line 51). Keep the `/admin/manage-packages` entry at line 123 (Admin Package Builder list — different feature).

3. **`src/components/layout/TopBar.tsx`**
   - Remove the `"/manage-packages": "Packages"` breadcrumb label (line 51). Keep `/admin/manage-packages`.

4. **`src/pages/PackageDetail.tsx`** (line 784)
   - The "Package not found" fallback button currently navigates to `/manage-packages`. Redirect it to `/admin/manage-packages` so nothing 404s. All other back-buttons in this file already point to `/admin/manage-packages`.

## Not touched
- `/admin/manage-packages` route, `AdminManagePackages.tsx`, `AdminManagePackagesWrapper.tsx`, `PackageBuilderEditor.tsx` — different feature.
- `src/test/rbac/useRBAC.test.ts` references `/admin/manage-packages` only — no change.
- No Supabase migrations, RLS, edge functions, tables, or shared hooks are touched. `ManagePackages.tsx` uses only inline `supabase` queries and shared UI primitives — nothing else imports from it.

## Verification
Run after edits:
```
rg "/manage-packages\"" src                          # expect zero (only /admin/manage-packages remains)
rg "ManagePackagesWrapper|ManagePackages\b" src      # expect zero after deletion, aside from the admin equivalents
```
Plus a typecheck/build via the harness.

## Summary reported after implementation
- Deleted: `ManagePackages.tsx`, `ManagePackagesWrapper.tsx`.
- Nav removed: sidebar "Packages" entry in `DashboardLayout.tsx`.
- Other references updated: `App.tsx` route + lazy import, `TopBar.tsx` breadcrumb, `PackageDetail.tsx` not-found fallback redirected to `/admin/manage-packages`.
