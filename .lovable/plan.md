

## Wire Compliance Auditor Navigation

### Problem
The sidebar item "Compliance Auditor" links to `/compliance-audits`, which currently redirects to `/manage-tenants`. The actual audit list page lives at `/compliance-audits/:tenantId` and requires a tenant ID param.

### Solution
Create a lightweight global audit list page at `/compliance-audits` that shows all audits across all tenants (SuperAdmin view). This mirrors how Vivacity staff would use it — they pick from a list rather than navigating via a specific tenant first.

### Changes

**New file: `src/pages/ComplianceAuditGlobal.tsx`**
- A simple page that queries `compliance_audits` joined with `tenants` (for tenant name) and `compliance_templates` (for template name)
- Displays a table with columns: Tenant, Template, Status, Audit Date, Actions (View)
- "View" navigates to `/compliance-audits/:tenantId/audit/:auditId`
- Search/filter by tenant name
- Uses `DashboardLayout` wrapper consistent with other pages

**Modified file: `src/App.tsx`**
- Change line 964 from the `Navigate` redirect to render the new `ComplianceAuditGlobal` component:
  ```
  <Route path="/compliance-audits" element={<ProtectedRoute><ComplianceAuditGlobal /></ProtectedRoute>} />
  ```
- Add lazy import for the new page

**No changes to:**
- `DashboardLayout.tsx` (sidebar link already points to `/compliance-audits`)
- Existing tenant-scoped routes (`:tenantId`, `:auditId`, `:auditId/report`)
- Any data fetching hooks or component styling

