Replace the `queryFn` in `src/components/client/ClientGovernanceDocumentsPage.tsx` with the flat-query version provided, which adds a separate `documents` lookup (id, title, description, category, framework_type) keyed by `document_id` from `document_instances`, alongside the existing flat resolution for package names via `stage_instances` → `package_instances` → `packages`.

Also bump `queryKey` to `["client-governance-documents-v4", activeTenantId]` to bust cache.

No other changes — UI, filters, types, access guard, skeleton, empty states, and `handleDownload` all untouched.