# Wire "Release Report to Client" to the edge function

The Report tab UI (confirmation dialog, notes textarea, success state, action count) is already built in `src/components/audit/workspace/ReportTab.tsx`. It calls `useReleaseReport` from `src/hooks/useAuditReport.ts`, which today invokes the Supabase RPC `release_audit_report`. We need to point that hook at the `release-audit-report` edge function and handle its documented status codes. No component changes required beyond a tiny notes-length guard.

## Changes

### 1. `src/hooks/useAuditReport.ts` — rewrite `useReleaseReport`

Replace the RPC call with a `fetch` to the edge function (so we can read non-2xx JSON bodies cleanly; `supabase.functions.invoke` swallows status codes into a generic `FunctionsHttpError`).

- Build URL from `SUPABASE_URL` + `/functions/v1/release-audit-report`.
- Send `Authorization: Bearer <session.access_token>` from `supabase.auth.getSession()`.
- Body: `{ audit_id: auditId, release_notes: trimmedNotes || null }`.
- Parse JSON regardless of status; branch on `response.status`:

  | Status | Behaviour |
  |---|---|
  | 200 | `toast.success("Report released to client")`; invalidate `['client-audit', auditId]` and `['audit', auditId]`; call existing `autoCompleteStageTasks(auditId, 'report_released')`. |
  | 409 | `toast.info("This report was already released on " + formatted released_at)`; still invalidate so UI flips to released state. |
  | 422 | `toast.error(body.error)` — do not throw past onError generic; mutation resolves so the button stays enabled. |
  | 403 | `toast.error(body.error || "You don't have access to this audit.")` |
  | 401 / 500 / network | `toast.error("Couldn't release the report. Try again, or contact support.")` |

- Mutation input shape stays `{ releaseNotes?: string }` so `ReportTab.tsx` does not change.
- Add a 4000-char guard: if `trimmedNotes.length > 4000`, toast error and return early before fetching.

### 2. `src/components/audit/workspace/ReportTab.tsx` — minor cleanup

- Pass `auditId` into the hook (already does: `useReleaseReport(audit.id)`).
- Remove the amber `<Alert>` warning banner at lines 559–564 (the AlertDialog at 572–588 already states the same thing). Keep the textarea, helper copy, and dialog as-is.
- Add `maxLength={4000}` to the notes `<Textarea>` to mirror the server limit.
- The existing released-state card (lines 592+) already shows "Released on …" and a revoke control, satisfying the "disabled released state with timestamp" requirement.

## Out of scope

- No edge-function code changes (it already exists and is tested).
- No DB migrations.
- No changes to the revoke flow, PDF generation, or client notifications.
- "View release log" link: skipped — there is no audit-log surface on this page today; adding one is a separate task.

## Acceptance

- Clicking "Release Report to Client" opens the confirmation dialog, then POSTs to `/functions/v1/release-audit-report` with the user's JWT.
- 200 → success toast, page refetches, card flips to green "Released on …" state.
- 409 → info toast with prior release date, card flips to released state.
- 422 → error toast with server message, button remains enabled.
- 403 / 401 / 500 / network → generic error toast, button remains enabled.
- Notes >4000 chars are rejected client-side before the request fires.
