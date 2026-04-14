

## Audit Scheduling, Calendar Sync & Report Template

### Summary
Add a Schedule tab to the audit workspace with three appointment panels (document deadline, opening meeting, closing meeting), calendar sync via `sync-outlook-calendar`, a client portal upcoming audit section, and report template with three-phase structure. All DB infrastructure (audit_appointments table, schedule_audit_phase RPC, client_audits columns) already exists.

---

### Files to Create

**1. `src/hooks/useAuditSchedule.ts`** — Appointment data hooks
- `useAuditAppointments(auditId)` — fetches from `audit_appointments` where `audit_id`, returns grouped by type
- `useScheduleAuditPhase()` — calls `schedule_audit_phase` RPC, then creates `calendar_events` record for meetings, then invokes `sync-outlook-calendar` edge function, updates `outlook_event_id`
- `useCancelAuditAppointment()` — PATCH status=cancelled + sync-outlook-calendar with action=cancel
- `useCompleteAuditAppointment()` — PATCH status=completed + completed_at, transitions audit status for opening meeting completion

**2. `src/components/audit/workspace/ScheduleTab.tsx`** — Main schedule tab
- Three stacked panels: DocumentDeadlinePanel, OpeningMeetingPanel, ClosingMeetingPanel
- Each panel has unscheduled form state and scheduled display state
- Scheduling order enforcement (opening before closing, validation on dates)
- Outlook sync indicators (synced/syncing/failed with retry)

**3. `src/components/audit/workspace/AppointmentPanel.tsx`** — Reusable meeting panel
- Date picker, time picker (30-min increments), duration select, online/on-site toggle
- Attendee multi-selector (internal users + tenant contacts + free-text email)
- Client instructions textarea, internal notes collapsible
- Scheduled state card with join link, attendees, edit/cancel/mark complete buttons

**4. `src/components/client/ClientUpcomingAuditSection.tsx`** — Client portal section
- Queries `audit_appointments` for tenant's active audit
- Vertical timeline: document deadline → opening meeting → review period (calculated) → closing meeting
- Shows client_instructions, meeting links, attendee names
- "Add to my calendar" .ics download (client-side generation)
- "Upload documents →" link to evidence section

### Files to Modify

**5. `src/pages/AuditWorkspaceNew.tsx`**
- Add Schedule tab (CalendarClock icon) between Overview and Audit Form
- Import ScheduleTab, pass audit and auditId
- Add `useAuditAppointments` query

**6. `src/components/audit/workspace/AuditSidebar.tsx`**
- Add compact schedule summary below progress bar
- Shows evidence due date, opening/closing times, review period
- "Not scheduled" with "Set date" link jumps to Schedule tab

**7. `src/components/audit/workspace/ReportTab.tsx`**
- Add report readiness checklist before generate button (opening meeting status, questions answered, closing meeting status)
- Update generate-audit-report invocation to include `include_sections` payload with opening_meeting, document_review, and closing_meeting data
- Show "Generate draft report" when closing meeting incomplete with advisory

**8. `src/types/auditWorkspace.ts`**
- Add `AppointmentType`, `AppointmentStatus`, `AuditAttendee`, `AuditAppointment` types

**9. `src/components/client/ClientHomePage.tsx`**
- Import and render `ClientUpcomingAuditSection` above AuditPreparationSection

### Technical Details

```text
Tab order: Overview | Schedule | Audit Form | Documents | Findings | Actions | Report
```

Calendar event creation pattern:
```typescript
const { data: event } = await supabase.from('calendar_events').insert({
  tenant_id: audit.subject_tenant_id,
  user_id: userId,
  title: `Opening Meeting — ${audit.snapshot_rto_name}`,
  start_at: `${date}T${startTime}:00`,
  end_at: `${date}T${endTime}:00`,
  location, meeting_url, attendees,
  provider: 'internal', status: 'confirmed',
}).select('id').single();

// Sync to Outlook
const { data } = await supabase.functions.invoke('sync-outlook-calendar', {
  body: { event_id: event.id, action: 'create', send_invites: true }
});
```

.ics generation (client-side):
```typescript
function generateICS(appointment: AuditAppointment): string {
  return `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:${...}\nDTEND:${...}\nSUMMARY:${...}\nLOCATION:${...}\nEND:VEVENT\nEND:VCALENDAR`;
}
```

No database migrations required.

| Action | File |
|--------|------|
| Create | `src/hooks/useAuditSchedule.ts` |
| Create | `src/components/audit/workspace/ScheduleTab.tsx` |
| Create | `src/components/audit/workspace/AppointmentPanel.tsx` |
| Create | `src/components/client/ClientUpcomingAuditSection.tsx` |
| Modify | `src/pages/AuditWorkspaceNew.tsx` |
| Modify | `src/components/audit/workspace/AuditSidebar.tsx` |
| Modify | `src/components/audit/workspace/ReportTab.tsx` |
| Modify | `src/types/auditWorkspace.ts` |
| Modify | `src/components/client/ClientHomePage.tsx` |

