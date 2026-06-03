Fix the `generate-membership-certificate` edge function by replacing the single PostgREST `!inner` relational query (step 4) with 3 separate flat queries to avoid the schema cache join error.

### Change
In `supabase/functions/generate-membership-certificate/index.ts`:

**Replace lines 96–115 (the single relational lookup):**

```
const { data: row, error: rowErr } = await supabase
  .from("package_instances")
  .select("start_date, packages!inner(name, package_type), tenants!inner(name)")
  .eq("tenant_id", tenantId)
  .eq("is_active", true)
  .eq("packages.package_type", "membership")
  .limit(1)
  .maybeSingle();

if (rowErr) {
  return jsonResponse(500, { ok: false, code: "LOOKUP_FAILED", detail: rowErr.message });
}
if (!row) {
  return jsonResponse(404, { ok: false, code: "NO_MEMBERSHIP" });
}

const packageCode = (row as any).packages?.name as string | undefined;
const tenantName = (row as any).tenants?.name as string | undefined;
const commencementDate = (row as any).start_date as string | undefined;
```

**With 3 flat queries:**

1. Query `package_instances` for the active membership instance (using `billing_category = "membership_rto"` instead of the inner join package_type filter).
2. Query `packages` by `id` to get the package name for tier mapping.
3. Query `tenants` by `id` to get the tenant name.

**Then wire the results into the existing tier mapping and PDF generation logic** using the same variable names (`packageCode`, `tenantName`, `commencementDate`) so nothing below step 4 changes.

### Scope
- Only `supabase/functions/generate-membership-certificate/index.ts` is touched.
- No frontend, routing, sidebar, or other file changes.
- No changes to auth, CORS, tier mapping, template fetch, or PDF overlay logic.
- The `eq("billing_category", "membership_rto")` filter replaces the previous `.eq("packages.package_type", "membership")` constraint on the joined relation.