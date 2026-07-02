Surgical refactor: switch three KPI data sources from `tenant_csc_assignments` to `tenants`.

1. **KpiDrillDownSheet.tsx** — communication branch (line ~133)
   - Replace the `.from("tenant_csc_assignments")` query with `.from("tenants").select("id").eq("assigned_consultant_user_id", subjectUuid).eq("status", "active")`.
   - Derive `tenantIds` from `tenantRows` mapped by `a.id`.

2. **fetchers.ts — `fetchCommunication`** (line ~63)
   - Same replacement: query `tenants` by `assigned_consultant_user_id` and `status = active`, derive `tenantIds` from result.
   - All downstream logic (client message fetch, conversation filtering, SLA calculation) remains unchanged.

3. **fetchers.ts — `fetchRetention`** (lines ~39-53)
   - Replace entire function body with a `tenants` query selecting `id, churned_at, created_at` filtered by `assigned_consultant_user_id = subjectUuid`.
   - Compute `atStart` (created_at <= endTs), `churned` (churned_at within period), and return the same `RetentionResult` shape.

No UI changes. No other files touched.