
## Scope

Update `src/components/client/ClientGovernanceDocumentsPage.tsx` and add one new database view `public.v_client_governance_documents`.

## Migration

```sql
CREATE OR REPLACE VIEW public.v_client_governance_documents
WITH (security_invoker = true)
AS
SELECT
  di.id,
  di.tenant_id,
  di.document_id,
  di.generationdate,
  di.generated_file_url,
  di.status,
  di.document_title,
  d.title          AS doc_title,
  d.description,
  d.category,
  d.framework_type,
  STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name) AS active_package_names
FROM public.document_instances di
JOIN public.documents d ON d.id = di.document_id
LEFT JOIN public.stage_instances si ON si.id = di.stageinstance_id
LEFT JOIN public.package_instances pi
  ON pi.id = si.packageinstance_id
  AND pi.membership_state = 'active'
LEFT JOIN public.packages p ON p.id = pi.package_id
GROUP BY
  di.id, di.tenant_id, di.document_id, di.generationdate,
  di.generated_file_url, di.status, di.document_title,
  d.title, d.description, d.category, d.framework_type;

GRANT SELECT ON public.v_client_governance_documents TO authenticated;
GRANT SELECT ON public.v_client_governance_documents TO service_role;
```

- `security_invoker = true` — required; underlying-table RLS is enforced for the caller. No RLS policies on any base table are modified.
- Grants for `authenticated` and `service_role` only (no `anon`).
- Idempotent (`CREATE OR REPLACE VIEW`).
- Rollback: `DROP VIEW public.v_client_governance_documents;`

## Page changes — `ClientGovernanceDocumentsPage.tsx`

### Change 1 — Framework filter from `dd_governance_framework`

- Replace `frameworkOptions` (which derives from loaded rows) with an array built from `fwRes.data` containing `{ value, label }` pairs.
- The query currently returns only `GovernanceDocRow[]`. Change the `queryFn` return to `{ rows, frameworks, governanceFolderUrl }` so the framework list and folder URL are cached together.
- `frameworkFilter` state still defaults to `"all"`. Comparison in `filtered` becomes `r.framework_type !== frameworkFilter` (compare by canonical `value`, e.g. `"RTO"`).
- Dropdown `<SelectItem value={fw.value}>{fw.label}</SelectItem>`.
- Table cell still renders `row.framework_label` (label resolved via `fwMap`).

### Change 2 — Actions column (View + SharePoint)

- Add to the same `Promise.all`:
  ```ts
  (supabase as any)
    .from("tenant_sharepoint_settings")
    .select("governance_folder_url")
    .eq("tenant_id", activeTenantId)
    .maybeSingle()
  ```
  Store `governanceFolderUrl = spRes.data?.governance_folder_url ?? null`. Use `maybeSingle()` so a missing row is not an error.
- Imports: add `Eye`, `ExternalLink` from `lucide-react`; drop unused `Download` import once the button is removed; remove unused `useToast` / `toast` if not referenced elsewhere (keep if still used).
- Render two buttons in the Actions cell:
  - **View** — same `window.open(row.file_path, "_blank", "noopener,noreferrer")` behaviour and the same disabled + "File not available" tooltip when `file_path` is null. Replaces Download verbatim.
  - **SharePoint** — only rendered when `governanceFolderUrl` is a non-empty string. `onClick={() => window.open(governanceFolderUrl!, "_blank", "noopener,noreferrer")}`.
- Layout: wrap both buttons in `<div className="flex justify-end gap-2">` to preserve right-alignment.

### Change 3 — Packages column + view consumption

- Replace the four-step fetch chain (`document_instances` → `documents` → `stage_instances` → `package_instances` → `packages`) with a single call:
  ```ts
  (supabase as any)
    .from("v_client_governance_documents")
    .select("id, document_id, generationdate, generated_file_url, document_title, doc_title, description, category, framework_type, active_package_names")
    .eq("tenant_id", activeTenantId)
    .eq("status", "generated")
  ```
- Map row → `GovernanceDocRow`:
  - `file_name` / `title` ← `document_title ?? doc_title`
  - `category_label` / `category_sort` ← `catMap.get(category)`
  - `framework_label` ← `fwMap.get(framework_type) ?? framework_type`
  - `package_name` ← `active_package_names` (already comma-separated; rename intent preserved without renaming the field)
- Keep the existing sort: `category_sort` then `title`.
- `status = 'generated'` filter preserved verbatim.

### Untouched

- `dd_document_categories` fetch and category filter behaviour.
- Sort logic, empty-state copy, search behaviour.
- `canAccess` guard and `Navigate` redirect.
- All other pages, hooks, edge functions, RLS policies, FK constraints.

## Risk assessment

| Area | Risk | Mitigation |
|------|------|-----------|
| RLS on underlying tables | View must not bypass RLS | `security_invoker = true` enforces caller's policies on `document_instances`, `documents`, `stage_instances`, `package_instances`, `packages` |
| Tenant isolation | View exposes `tenant_id` from `document_instances`; query filters by `tenant_id = activeTenantId`; underlying RLS still gates rows | No regression; defence-in-depth preserved |
| Package aggregation correctness | `LEFT JOIN ... AND pi.membership_state = 'active'` ensures only active packages contribute; documents with no active package still appear with `NULL` `active_package_names` | Matches "Active packages only" intent without dropping rows |
| Filter semantics change | Switching framework comparison from label to value changes URL-less state shape; no persisted state exists for this filter | Safe — local component state only |
| Removed Download label | Users may look for "Download" copy | New "View" button uses identical open-in-new-tab behaviour |
| SharePoint button absence | Tenants without `governance_folder_url` will not see the button | Conditional render avoids broken links |
| Audit logging | Read-only view, no mutations introduced | No audit impact |
| Backward compatibility | Old query key `client-governance-documents-v4` should be bumped to invalidate stale cache shape | Use `client-governance-documents-v5` |

## Benefits

- One round-trip query replaces a 4-step chain (~75% fewer requests, lower latency).
- Framework filter is now complete (all configured frameworks, not just those present in current rows) and uses stable codes per project conventions.
- Clients gain a one-click jump to their tenant's SharePoint governance folder.
- View is reusable for other governance reporting surfaces.

