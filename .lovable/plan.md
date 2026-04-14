

## Historical Audit References — Implementation Plan

### Summary
Add a "Historical Reference Audits" section to the client Audits tab and a collapsible "Reference Library" to the `/audits` dashboard. This includes an upload modal, reference cards with AI analysis integration, edit/delete capabilities, and a new hooks file.

### Files to Create

**1. `src/types/auditReferences.ts`** — Types for `ClientAuditReference`, source/outcome unions, and label/color maps for badges.

**2. `src/hooks/useAuditReferences.ts`** — React Query hooks:
- `useClientAuditReferences(tenantId)` — fetch references for a client
- `useAllAuditReferences()` — fetch all references joined with tenants for dashboard
- `useCreateAuditReference()` — upload file to `audit-references` bucket + INSERT row
- `useUpdateAuditReference()` — PATCH metadata fields
- `useDeleteAuditReference()` — DELETE row + remove file from storage
- `useAnalyseAuditReference()` — PATCH `ai_status`, invoke `analyze-document` edge function, poll for completion

**3. `src/components/audit/references/UploadReferenceModal.tsx`** — Single-step form modal with source selector, metadata fields, date picker, outcome dropdown, notes textarea, and file upload zone. On save: uploads to storage path `{tenantId}/{uuid}/{filename}`, inserts record, shows toast.

**4. `src/components/audit/references/ReferenceCard.tsx`** — Card component showing source badge, outcome badge, label, date, auditor, framework, file info, notes. Action buttons: Download (signed URL), Analyse with AI (with polling spinner), Edit, Delete. Expandable AI results section when `ai_status = 'complete'`.

**5. `src/components/audit/references/ReferenceBadges.tsx`** — Source badge and Outcome badge components with the specified color mappings.

**6. `src/components/audit/references/EditReferenceDrawer.tsx`** — Drawer/modal for editing metadata fields (not the file).

**7. `src/components/audit/references/HistoricalReferencesSection.tsx`** — Wrapper component rendering the heading, upload button, reference cards list, and empty state. Used in `ClientAuditsTab`.

**8. `src/components/audit/references/ReferenceLibrarySection.tsx`** — Collapsible section for the `/audits` dashboard showing a searchable/filterable table of all references across clients.

### Files to Modify

**9. `src/components/client/ClientAuditsTab.tsx`** — Import and render `HistoricalReferencesSection` below the existing audit history, passing `tenantId`.

**10. `src/pages/AuditsAssessments.tsx`** — Import and render `ReferenceLibrarySection` below the active audits table, collapsed by default.

### No Database Migrations
Table `client_audit_references` and storage bucket `audit-references` already exist with correct schema and RLS policies.

### Key Design Decisions
- File upload max 100MB; accepts PDF, DOCX, XLSX, ZIP
- Storage path: `{subject_tenant_id}/{reference_id}/{filename}`
- AI analysis calls existing `analyze-document` edge function with `{ reference_id, file_path, document_type: "audit_report", context: "historical_reference" }`
- Poll interval: 5 seconds for AI status
- Reference library on `/audits` is collapsible to keep it secondary
- Follows existing patterns: `as any` cast for Supabase queries, React Query for state, sonner for toasts

