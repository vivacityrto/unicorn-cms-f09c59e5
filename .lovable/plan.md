# Fix Ask Viv Fact Builder Empty Responses

Three bugs in the shared fact builder cause empty/incorrect data for both `compliance-assistant` and `compliance-assistant-client`. Fix in two files only.

## File 1: `supabase/functions/_shared/ask-viv-fact-builder/data-retrieval.ts`

**Change 1 — Package lookup (lines 77–103):** Replace the current block (which reads `tenant.package_ids` and queries the `packages` template table) with a two-step fetch from `package_instances` (source of truth), then look up names/types from `packages`.

- Step A: Query `package_instances` filtered by `tenant_id` and `is_complete = false`, limit 20.
- Step B: Collect distinct `package_id`s and fetch `id, name, package_type, total_hours` from `packages`.
- Map to `PackageFactData[]` using the instance as the primary row: `id` = instance id, `status` = `is_complete ? "closed" : "active"`, `updated_at` from instance, name/type/hours from the matched package row (fallbacks: `"Unknown package"`, `null`, `null`).
- Push `"package_instances"` to `tablesQueried` and `recordIds` (not `"packages"`).

**Change 2 — Tasks query (line 134):** Add `.eq("tenant_id", tenantId)` so tasks are tenant-scoped.

**Change 3 — Consult logs query (line 180):** Add `.eq("tenant_id", tenantId)` before the `.gte("date", lookbackDate)` filter.

## File 2: `supabase/functions/_shared/ask-viv-fact-builder/fact-derivation.ts`

Update `source_table` from `"packages"` → `"package_instances"` at lines 113, 129, and 153, so derived facts match the `LABEL_BUILDERS` whitelist used by `compliance-assistant-client`.

## Out of Scope

No changes to `compliance-assistant/index.ts`, `compliance-assistant-client/index.ts`, other shared modules, frontend components, or migrations.
