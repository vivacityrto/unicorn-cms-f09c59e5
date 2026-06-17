## Phase 5 — Ticket Detail Panel (approved + My Tickets SLA highlighting)

Adds a read+update side panel for tickets in **All Tickets** and **My Tickets** tabs. Triage Queue is untouched. Also adds SLA breach highlighting to My Tickets rows.

### 1. Extend `EmailTicket` and `SELECT_COLS`

File: `src/hooks/useEmailTickets.ts`

- Add to interface: `resolution_notes: string | null`, `closed_at: string | null`, `closed_by: string | null`.
- Append the three columns to `SELECT_COLS`.

### 2. New `TicketDetailPanel.tsx`

File: `src/components/email-triage/TicketDetailPanel.tsx`. Props: `{ ticket, open, onOpenChange }`.

- shadcn `Sheet`, `side="right"`, `sm:max-w-xl`, `flex flex-col`.
- Header: ticket number as `SheetTitle`; subject in `SheetDescription`.
- Closed banner (when `status === 'closed'`): "Closed {dd/MM/yyyy HH:mm} by {name}" — `closed_by` resolved via `useTriageStaffOptions`.
- Read-only metadata: Category (`CategoryBadge` + `UrgentIcon`), From (name + email), Received (`dd/MM/yyyy HH:mm`), Assigned to (staff lookup with role), Triaged by + Triaged at.
- Body block: `body_preview` in bordered muted container, `whitespace-pre-wrap`, `max-h-[30vh] overflow-y-auto`.
- Update form (hidden when closed):
  - Status `<Select>` from `useEmailTicketStatuses()`, seeded from `ticket.status`.
  - Resolution notes `<Textarea>`, placeholder "Add resolution notes…", seeded from `ticket.resolution_notes ?? ""`.
- Footer (hidden when closed):
  - **Cancel** — close panel.
  - **Save** — enabled when status or notes differ. `useUpdateEmailTicket().mutateAsync({ id, patch: { status, resolution_notes: notes || null } })`. Toast "Ticket updated"; panel stays open.
  - **Close Ticket** — destructive. `AlertDialog` confirm ("Close this ticket? This cannot be undone."). On confirm: mutate `{ status: 'closed', resolution_notes: notes || null }` (DB trigger fills `closed_at`/`closed_by`). Toast "Ticket closed"; close panel.
- Seeding pattern (mirrors `TriageSidePanel`):
  ```ts
  useEffect(() => {
    if (ticket) { setStatus(ticket.status ?? ""); setNotes(ticket.resolution_notes ?? ""); }
  }, [ticket?.id, ticket?.status, ticket?.resolution_notes]);
  ```

### 3. Wire into `AllTicketsTab.tsx`

- Add `selected`/`open` state; row `onClick` opens panel; add `cursor-pointer hover:bg-muted/50` (preserve existing `rowBorderClass`).
- After mutation, look up live row: `const live = selected ? tickets.find(t => t.id === selected.id) ?? selected : null;` and pass `live` to the panel.

### 4. Wire into `MyTicketsTab.tsx` + add SLA highlighting

- Same panel wiring pattern as step 3.
- **Add SLA highlighting**: import the same `rowBorderClass(response_due_at, sla_breached)` helper used in `AllTicketsTab.tsx` (move it to a shared spot — `src/components/email-triage/slaBorder.ts` — and import in both tabs). Apply to each `<TableRow>` via `cn(rowBorderClass(t.response_due_at, t.sla_breached))`.

### 5. No changes to

- `useUpdateEmailTicket` (trigger handles `closed_at`/`closed_by`).
- `TicketBadges.tsx` (exports reused as-is).
- `TriageQueueTab.tsx` / `TriageSidePanel.tsx`.
- DB / migrations.

### Acceptance

- Row click in All Tickets or My Tickets opens detail panel populated correctly.
- Save updates status/notes, toasts, panel stays open with refreshed values.
- Close Ticket confirms, mutates, toasts, panel closes; row disappears from My Tickets.
- Closed tickets show read-only banner; Save/Close buttons hidden.
- My Tickets rows now show red border when `sla_breached`, amber when due within 60 min.
- Triage Queue unchanged.
