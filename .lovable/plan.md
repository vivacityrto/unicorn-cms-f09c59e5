## Plan: Add DashboardLayout to RolePermissionsEditor

**Scope:** One file only — `src/pages/admin/RolePermissionsEditor.tsx`

**Change:**
1. Import `DashboardLayout` from `@/components/DashboardLayout`.
2. Wrap the entire existing return content in `<DashboardLayout>...</DashboardLayout>`.
3. Preserve all existing content, state, and logic inside the wrapper.

**No other files affected.**
