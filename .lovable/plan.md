

## Plan: Preliminary Audit Summary — email-only, with CC to creator

### Refinement (vs. previous plan)
Per your direction, this is **information-only** correspondence. We will:
- **Not** persist a new `client_audit_preliminary_summaries` table.
- **Not** store generated PDFs in the `audit-documents` bucket.
- **Not** emit `client_timeline_events` for these summaries.
- **Not** show a "history" of past summaries in the UI.
- **Not** apply any acknowledgement/governance tracking.

The artefact lives only in the recipients' inboxes. The creator is automatically **CC'd** so they retain a personal copy via their own mail trail.

### Where it lives
A single **"Send Preliminary Summary"** button in the **Report** tab of the audit workspace (`/audits/:id`), available in any audit status except after the final report has been released to the client (where the released report supersedes it). No card, no list — just the action.

### Flow
1. User clicks **Send Preliminary Summary**.
2. A dialog opens (reusing `ComposeEmailDialog` patterns) pre-filled with:
   - **To**: client primary contact(s) — editable, free-text additions allowed for "interested parties".
   - **CC**: the current user's email address, locked (cannot be removed).
   - **Subject**: `Preliminary Audit Summary — {client} — {audit title}`.
   - **Body**: auto-generated HTML summary + mandatory disclaimer paragraph at the top.
3. Body content is built in-memory from current `client_audits` data:
   - Audit title, type, client, today's date.
   - Coverage so far (sections completed, evidence outstanding, opening/closing meeting status).
   - Findings to date grouped by priority (Critical/High/Medium/Low) — one-line each, AI-generated ones flagged "AI draft, pending review".
   - Current `risk_rating` if set, otherwise "Not yet rated".
   - Open action items (top items by priority + due date).
   - `audit.executive_summary` if populated.
4. User can edit subject/body in the rich-text editor before sending.
5. A confirm dialog before send: *"Send PRELIMINARY summary to N recipient(s)? You will be CC'd. They will be told this is a draft, subject to change."*
6. Send goes through the existing Mailgun/Outlook integration — same path as other staff-initiated emails.

### Mandatory disclaimer (in two places)
- **Top of email body** (auto-inserted, editable but warned if removed):  
  *"PRELIMINARY SUMMARY — This document reflects the current state of an audit in progress. Findings, ratings and recommendations are provisional and may change before the final report is issued."*
- **Confirm dialog** before sending (as above).

### What we explicitly do NOT do
- No database table, no row written.
- No file in the `audit-documents` bucket — body is HTML only, no PDF attachment.
- No `client_timeline_events` entry, no audit-trail row beyond the standard email-send log already produced by the existing email integration.
- No history list in the UI; no way to "re-download" a previously sent summary.
- No portal visibility, no governance register entry, no acknowledgement tracking.
- No flip of `report_client_visible` or any release flag.

### Files to add / change
- **New component**: `src/components/audit/workspace/SendPreliminarySummaryDialog.tsx` — composes the email body from audit data, locks the CC, opens compose flow.
- **New helper**: `src/lib/buildPreliminaryAuditSummary.ts` — pure function that takes the audit + findings + actions and returns the HTML body string with disclaimer.
- **Edit**: `src/components/audit/workspace/ReportTab.tsx` — add a single **Send Preliminary Summary** button above the existing Report Generation card. Hide once final report is released.

No edge functions, no migrations, no new hooks beyond a thin wrapper if needed for the existing email sender.

### Verification
1. Open `/audits/<in-progress audit>` → Report tab shows **Send Preliminary Summary** button.
2. Click → dialog opens with client primary contact in **To**, current user in **CC** (locked), disclaimer at top of body, summary content populated.
3. Add an extra "interested party" address → confirm dialog → send → email arrives at recipients **and** the creator's inbox via CC.
4. No new rows in any audit/timeline table; only the existing email-send log entry from the standard mail integration.
5. Open another audit where the final report has been released → button is hidden.

