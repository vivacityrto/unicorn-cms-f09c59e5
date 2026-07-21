Broaden the template-document lookup in `src/hooks/useDocumentSyncAudit.ts` so the sync audit counts documents linked via `document_stage_links` in addition to documents whose primary `stage` column matches.

Changes
- In the `queryFn`, after fetching `documents` where `stage = stageId`, also fetch `document_stage_links` where `stage_id = stageId`.
- Merge both result sets into `templateDocIds` (a `Set<number>`).
- Leave all downstream logic unchanged: `missingDocIds`, `extraDocIds`, `extraCount`, `missingCount`, `inSync`, `templateDocCount`, and the returned aggregates will automatically reflect the corrected union-aware set.

Out of scope
- No UI or rendering changes in `DocumentSyncAuditPanel.tsx`.
- No changes to the "Sync All Packages" button or `publish_stage_version`.
- No changes to how `document_instances`, `stage_instances`, or `package_instances` are queried.

Verification
- Open the Document Sync Status panel for stage 1114.
- Confirm "Template documents" reads 210 (173 primary + 37 linked), not 173.
- Confirm package rows previously showing HAS 210 / EXTRA 37 / MISSING 0 now show HAS 210 / EXTRA 0 / MISSING 0 and are marked in-sync.
- Confirm the overall in-sync counter reflects the corrected totals.