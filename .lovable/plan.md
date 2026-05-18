## Fix evidence request status values in `useAuditPrep.ts`

### Problem
Frontend writes `status: 'sent'` when creating evidence requests, but the DB CHECK constraint on `evidence_requests.status` only allows: `draft`, `open`, `partially_received`, `received`, `overdue`, `closed`, `cancelled`. This causes a CHECK constraint violation on every create.

The `sent_at` timestamp already records dispatch time — status does not need to carry that signal.

### Changes

File: `src/hooks/useAuditPrep.ts` (2 edits only)

1. **Line 89** — `useCreateAuditEvidenceRequest` insert payload:
   - Change `status: 'sent'` → `status: 'open'`
   - `sent_at: new Date().toISOString()` stays unchanged

2. **Line 206** — `useClientEvidenceRequests` query filter:
   - Change `.in('status', ['sent', 'in_progress'])` → `.in('status', ['open', 'partially_received'])`
   - Logic: client portal shows requests that are actively awaiting evidence (`open`) or partially fulfilled (`partially_received`). Fully received or closed requests drop out of the prep section.

### Out of scope
- DB / migrations / RPCs / triggers
- `audit_send_evidence_reminders` cron (known broken, separate fix)
- `useEvidenceRequests.tsx` (System 1 hook)
- Any other status-related code

### Verification
1. `tsc --noEmit` passes.
2. As CSC on `/audits/{id}` → Evidence Requests → Send → submit succeeds with no CHECK error.
3. As TP on `/client/home`, AuditPreparationSection renders the request with upload buttons.
