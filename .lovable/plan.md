In `src/pages/admin/CohortAccessSenderJob.tsx`:

1. Add state variable:
   - `const [tenantNames, setTenantNames] = useState<Map<number, string>>(new Map())`

2. In the `refresh()` function, after loading items into state:
   - Collect all unique non-null `tenant_id` values from the items array.
   - Query `supabase.from("tenants").select("id, name").in("id", uniqueIds)`.
   - Build a `Map<number, string>` from the query result.
   - Call `setTenantNames(map)`.

3. In the Recipients table's Tenant cell:
   - Change from `{it.tenant_id ?? "—"}` to `{tenantNames.get(it.tenant_id) ?? (it.tenant_id ? it.tenant_id.toString() : "—")}`.

No other files touched.