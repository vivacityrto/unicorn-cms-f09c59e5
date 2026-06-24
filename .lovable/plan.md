## Email Log section on My KPI

Add an Email Log section to `KpiDashboard.tsx` (own dashboard only) for staff whose `profile.kpi_role` is `csc_consultant` or `cst_assistant`, with a connect CTA when Outlook isn't linked and a log table + manual "Log a response" sheet when it is.

### 1. Backend — extend `supabase/functions/kpi-email-log-sync/index.ts`

Add a manual-pair mode while keeping the existing bulk sync intact.

- New request body shape: `{ mode: "manual", inboundMessageId: string, outboundMessageId: string, emailType: "general_email" | "client_message" }`.
- When `mode === "manual"`:
  - Reuse existing JWT/staff gate and `refreshIfNeeded`.
  - Fetch each message by id via Graph: `GET /me/messages/{id}?$select=id,subject,conversationId,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview`.
  - Compute `response_minutes = round((sentDateTime - receivedDateTime)/60000)` if the outbound is at or after the inbound; `sla_met` against existing `SLA_MINUTES[emailType]`.
  - Upsert two rows into `kpi_email_log` (one inbound + one outbound) with `email_type = emailType` (override classifier), `responded_at = outbound.sentDateTime` on the inbound row, same `conversation_id` derived from the inbound message. Use the existing `onConflict: "user_uuid,message_id"`.
  - Return `{ ok: true, mode: "manual", inserted: 2 }`.
- Otherwise fall through to the existing bulk-sync path unchanged.

### 2. Hook — `src/hooks/useKpiEmailLog.tsx`

Add a `logManualPair({ inboundMessageId, outboundMessageId, emailType })` method that invokes `kpi-email-log-sync` with `mode: "manual"` body, then calls `fetchRows()`. Export it alongside `sync`.

### 3. Reuse component — `src/components/email/OutlookInboxBrowser.tsx`

Add an optional `onSelectEmail?: (email: OutlookEmail) => void` prop. When provided:
- Skip `LinkEmailModal` entirely — clicking a row (and the trailing icon button) calls `onSelectEmail(email)` instead of `handleLinkEmail`.
- `tenantId` becomes optional (only used by the link-modal path).
- Card title/description still derive from `folderLabel`.

No other behavior changes for existing callers.

### 4. New component — `src/components/kpi/KpiEmailLogSection.tsx`

Props: `{ subjectUuid: string }` (kept for symmetry; section is hidden when not own dashboard).

- Connection state from `useOutlookConnectionStatus()` → `{ isConnected, isLoading, connect, isConnecting }`.
- Data from `useKpiEmailLog({ userUuid: subjectUuid })` → `{ rows, isLoading, logManualPair, refetch }`.

**State 1 — not connected** (`!isConnected`):
Card with:
- Heading "Connect your Outlook to start logging"
- Sub "Once connected, log email response times from your inbox. One-time setup."
- Primary button "Connect Outlook" → `connect()` (popup-blocked fallback matches `OutlookIntegration` — store `authUrl` and surface a "Click to open" link if `result.openedInNewTab === false`).

**State 2 — connected**:
Card header: title "Email log" + right-aligned button `+ Log a response` opening the sheet.
Table (inbound rows only — `r.direction === "inbound"`, sorted `received_at desc`, already provided by hook):
- Received: `format(parseISO(received_at), "dd/MM/yyyy HH:mm")`
- Replied: `responded_at` formatted, or `—`
- Response time: `response_minutes` rendered as `Xh Ym` or `—`
- SLA: badge `Met` (emerald) / `Missed` (rose) / `—`
- Type: "General email" or "Client message" derived from `email_type`

Skeleton while `isLoading`, empty-state copy when `rows.length === 0`.

**"+ Log a response" sheet** (`Sheet` from `@/components/ui/sheet`, `side="right"`, width ~640px):
Three-step controlled flow with a top stepper:

1. **Select received email** — `<OutlookInboxBrowser folder="inbox" onSelectEmail={(e) => { setInbound(e); setStep(2); }} />`. Show selected summary chip once chosen.
2. **Select sent reply** — `<OutlookInboxBrowser folder="sent" onSelectEmail={(e) => { setOutbound(e); setStep(3); }} />`. Back button returns to step 1.
3. **Confirm** — Show selected pair summary; `RadioGroup` toggle for `email_type` with options "General email" (default) and "Client message"; primary `Confirm` button calls `logManualPair({ inboundMessageId: inbound.id, outboundMessageId: outbound.id, emailType })`, on success closes sheet, resets state, toasts via the hook's existing success path; secondary `Back` returns to step 2.

### 5. Wire into `KpiDashboard.tsx`

- Import `useAuth` and `KpiEmailLogSection`.
- Below the `<Tabs>` block, render:
  ```tsx
  {profile?.user_uuid === subjectUuid &&
    (profile?.kpi_role === "csc_consultant" || profile?.kpi_role === "cst_assistant") && (
      <div className="mt-6">
        <KpiEmailLogSection subjectUuid={subjectUuid} />
      </div>
  )}
  ```
- No changes to existing tabs, props, or callers.

### Notes

- No DB or RLS changes — `kpi_email_log` table, policies, and `oauth_tokens` lookup already exist.
- `kpi-email-log-sync` deploys automatically.
- Type values used (`csc_consultant`, `cst_assistant`) match the spec; `profile.kpi_role` is already exposed in `UserProfile`.
