## Wire "Generate Report" to `generate-client-audit-report` edge function

The Report tab's "Generate Report" button currently shows a "coming soon" toast (`ReportTab.tsx` line 169 / 174). The "Download PDF" button next to "Last generated" is also a stub with no `onClick`. Wire both to the new edge function and surface real status.

### 1. New hook: `useGenerateClientAuditReport(auditId)` in `src/hooks/useAuditReport.ts`

Mirror the pattern of `useReleaseReport` (raw `fetch` so we can branch on status codes cleanly).

- POST to `${SUPABASE_URL}/functions/v1/generate-client-audit-report` with `Authorization: Bearer <session.access_token>`, `apikey`, `Content-Type: application/json`.
- Body: `{ audit_id: auditId }`.
- Status handling:
  | Status | Behaviour |
  |---|---|
  | 200 | `toast.success("Report generated (${pages} pages)")`. Open `download_url` in new tab via `window.open(download_url, '_blank', 'noopener')`. Invalidate `['audit-details', auditId]`, `['audit', auditId]`, `['client-audit', auditId]`, `['audits']` so `report_pdf_path` / `report_generated_at` flow back in. Return body so the caller can use `download_url`. |
  | 403 | `toast.error(body.error \|\| "You don't have access to this audit.")` |
  | 401 / 500 / network / other | `toast.error("Couldn't generate the report. Try again in a moment.")` |
- Per-status toasts emitted inside `mutationFn` (matches `useReleaseReport` style). No `onError` toast to avoid double-fire.

### 2. `src/components/audit/workspace/ReportTab.tsx` — wire the buttons

- Import and instantiate `const generateReport = useGenerateClientAuditReport(audit.id);`
- Replace `proceedToGenerate` and the `else` branch in `handleGenerateClick` (lines 168–169 and 172–175) with `generateReport.mutate()` — keep the existing `softGuardOpen` confirmation flow for incomplete audits (`incompleteCount > 0`); on "Generate anyway" call `generateReport.mutate()`.
- "Generate Report" button (line 276):
  - `disabled={generateReport.isPending}`
  - When `isPending`, swap label/icon to `<Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating PDF report...`
- "Download PDF" button (lines 267–269): wire `onClick` to open `audit.report_pdf_path` via a signed URL. Simplest approach matching the rest of the codebase: call the edge function again is overkill — instead, generate a short-lived signed URL on click using `supabase.storage.from('audit-reports').createSignedUrl(audit.report_pdf_path, 60)` and `window.open(signed.signedUrl, '_blank')`. Bucket name comes from the 200 response (`bucket: 'audit-reports'`) and is stable.
- Update the helper copy under the button (line 280–284): when `incompleteCount === 0`, drop the "coming soon" sentence and show nothing (or `"Generates a timestamped PDF and stores it on the audit."`).

### 3. Out of scope (leave untouched)

- The legacy `generate-audit-report` edge function — orphan it; not called from anywhere we're touching.
- Versioning of historical PDFs — each click overwrites `report_pdf_path` server-side, old files remain in the bucket.
- Re-generate confirmation dialog — single click is fine per brief.

### Acceptance

- Click "Generate Report" with a complete audit → spinner appears, button disabled, ~3–15s later toast `"Report generated (N pages)"`, the PDF opens in a new tab, and the card flips to show "Last generated: <today>" with a working "Download PDF" button.
- Click "Generate Report" with incomplete responses → existing soft-guard dialog appears; "Generate anyway" triggers the same flow.
- 403 → error toast with server message; button re-enabled.
- 401 / 500 / network → generic error toast; button re-enabled.
- "Release Report to Client" subsequently succeeds because `report_pdf_path` is now populated.
- No call to the old `generate-audit-report` function from the Report tab.
