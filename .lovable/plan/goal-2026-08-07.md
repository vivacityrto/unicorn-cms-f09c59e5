## Goal
Let staff download the audit report as a Word (.docx) document in addition to the existing PDF, from the Report Generation card in the audit workspace (`ReportTab.tsx`) — and, for consistency, also from the client-facing Audit Reports card.

## Scope decision
The edge function that builds the audit report (`generate-client-audit-report`) is deployed but not tracked in this repo. To avoid touching an untracked file blindly, I propose adding DOCX generation as a **new, self-contained edge function** that reads the same source data and writes a `.docx` next to the existing PDF. The current PDF flow stays untouched.

## Changes

### 1. New edge function: `supabase/functions/generate-client-audit-report-docx/index.ts`
- Auth: same JWT + `audits.report` permission check pattern used by the PDF function.
- Input: `{ audit_id: string }`.
- Loads the same audit record, findings, actions, executive summary, overall finding, risk rationale, and closing meeting info that the PDF version uses.
- Builds a `.docx` using `docx` (npm via esm.sh) with the same section order as the PDF (Cover, Executive Summary, Scope, Findings by priority, Action Plan, Closing).
- Uploads to storage bucket `audit-reports` at `{tenant_id}/{audit_id}/report-{timestamp}.docx`.
- Updates `client_audits` with a new column `report_docx_path` and refreshes `report_generated_at` only if null (PDF remains the primary generated-at marker).
- Returns `{ download_url, file_name, pages: null }` with a short-lived signed URL.

### 2. Migration: add `report_docx_path`
- `ALTER TABLE public.client_audits ADD COLUMN report_docx_path text;` + `NOTIFY pgrst, 'reload schema';`
- No RLS/grant changes (column inherits existing table policies).

### 3. Frontend: `src/hooks/useAuditReport.ts`
- Add `useGenerateClientAuditReportDocx(auditId)` — mirror of the PDF hook, calling the new function, opening the signed URL, and invalidating the same query keys.

### 4. Frontend: `src/components/audit/workspace/ReportTab.tsx`
- In the "Report Generation" card:
  - Add a **"Download Word"** outline button next to "Download PDF" — visible only when `report_docx_path` exists.
  - Add a small **"Generate Word"** secondary button next to the primary Generate/Regenerate PDF button, gated by the same `canReport` permission and same soft-guard for incomplete audits.
  - Reuse `handleDownloadPdf`'s signed-URL pattern for a new `handleDownloadDocx` reading `report_docx_path` from the `audit-reports` bucket.
- No changes to existing PDF wording, layout order, or generate flow.

### 5. Client portal parity (small): `src/components/client/ClientAuditReportsSection.tsx`
- If `report_docx_path` is present on a released report, show an extra "Download Word" outline button beside the existing "Download Report PDF" button, using the same signed-URL flow.
- No change to acknowledgement / release logic.

### 6. Types
- `src/types/clientAudits.ts` and `src/hooks/useClientAuditPortal.ts` — extend `ClientAudit` / `ClientAuditReport` with `report_docx_path: string | null`, and include it in the client-portal select list.

## Out of scope
- No changes to the existing PDF edge function.
- No changes to release/acknowledgement flow, RLS, or permissions.
- No changes to report content / sections beyond DOCX rendering parity with the PDF.

## Verification
- Build succeeds; types updated.
- Manual: on an existing audit, click **Generate Word**, confirm the `.docx` opens and mirrors the PDF sections; click **Download Word** later to re-open from the stored path.
- Confirm client portal shows the Word download only when `report_docx_path` is populated.
