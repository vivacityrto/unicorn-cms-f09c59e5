import { ClipboardList, MessageSquare, Target, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AppointmentPanel } from './AppointmentPanel';
import { useAuditAppointments, useScheduleAuditPhase, useCancelAuditAppointment, useCompleteAuditAppointment } from '@/hooks/useAuditSchedule';
import type { ClientAudit } from '@/types/clientAudits';
import type { AuditAppointment } from '@/types/auditWorkspace';

interface ScheduleTabProps {
  audit: ClientAudit;
}

export function ScheduleTab({ audit }: ScheduleTabProps) {
  const { documentDeadline, openingMeeting, closingMeeting } = useAuditAppointments(audit.id);
  const schedulePhase = useScheduleAuditPhase(audit.id);
  const cancelAppointment = useCancelAuditAppointment(audit.id);
  const completeAppointment = useCompleteAuditAppointment(audit.id);

  const getSyncStatus = (appt: AuditAppointment | null) => {
    if (!appt) return null;
    if (appt.outlook_event_id) return 'synced' as const;
    return null;
  };

  // Closing meeting validation
  const canScheduleClosing = !!openingMeeting && openingMeeting.status !== 'cancelled';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Audit Schedule</h2>
        <p className="text-sm text-muted-foreground">Set deadlines and schedule meetings for this audit.</p>
      </div>

      {/* Phase 1 — Document Submission */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Phase 1 — Prep
          </span>
        </div>
        <AppointmentPanel
          icon={<ClipboardList className="h-4 w-4 text-blue-600" />}
          title="Document Submission Deadline"
          description="Set the date by which the client must upload all evidence before the audit."
          appointment={documentDeadline}
          showTimeFields={false}
          defaultInstructions="Please upload all required compliance documents listed in your evidence request before this date. Your consultant will review these ahead of the opening meeting."
          isScheduling={schedulePhase.isPending}
          onSchedule={(params) => schedulePhase.mutate({
            appointmentType: 'document_submission_deadline',
            ...params,
            auditTitle: audit.title || undefined,
            tenantId: audit.subject_tenant_id,
          })}
          onCancel={(appt) => cancelAppointment.mutate(appt)}
        />
      </div>

      {/* Phase 2 — Opening Meeting */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Phase 2 — Opening Meeting
          </span>
        </div>
        <AppointmentPanel
          icon={<MessageSquare className="h-4 w-4 text-indigo-600" />}
          title="Opening Meeting"
          description="Schedule the opening meeting with the RTO representative."
          appointment={openingMeeting}
          defaultInstructions="We will discuss the audit scope, your organisation context, and any third-party arrangements. Please have your key compliance staff available."
          isScheduling={schedulePhase.isPending}
          syncStatus={getSyncStatus(openingMeeting)}
          onSchedule={(params) => schedulePhase.mutate({
            appointmentType: 'opening_meeting',
            ...params,
            auditTitle: audit.title || undefined,
            tenantId: audit.subject_tenant_id,
          })}
          onCancel={(appt) => cancelAppointment.mutate(appt)}
          onComplete={(appt) => completeAppointment.mutate({ appointment: appt, auditStatus: audit.status })}
        />
      </div>

      {/* Review period info */}
      {openingMeeting && openingMeeting.status !== 'cancelled' && (
        <Alert className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Document Review</strong> — The period between the opening and closing meetings. Your consultant will review
            all submitted evidence during this time. No action required from the client.
          </AlertDescription>
        </Alert>
      )}

      {/* Phase 3 — Closing Meeting */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Phase 3 — Closing Meeting
          </span>
        </div>
        <AppointmentPanel
          icon={<Target className="h-4 w-4 text-emerald-600" />}
          title="Closing Meeting"
          description="Schedule the closing meeting to present findings to the client."
          appointment={closingMeeting}
          defaultInstructions="We will present the compliance health check findings to your team. Please ensure your CEO/Principal and compliance manager are available. We will discuss each finding, your responses, and the corrective action plan."
          isScheduling={schedulePhase.isPending}
          disabled={!canScheduleClosing}
          disabledReason="Schedule the opening meeting first before setting the closing meeting."
          syncStatus={getSyncStatus(closingMeeting)}
          onSchedule={(params) => {
            // Validate closing is after opening
            if (openingMeeting?.scheduled_date && params.scheduledDate < openingMeeting.scheduled_date) {
              return;
            }
            schedulePhase.mutate({
              appointmentType: 'closing_meeting',
              ...params,
              auditTitle: audit.title || undefined,
              tenantId: audit.subject_tenant_id,
            });
          }}
          onCancel={(appt) => cancelAppointment.mutate(appt)}
          onComplete={(appt) => completeAppointment.mutate({ appointment: appt, auditStatus: audit.status })}
        />
      </div>
    </div>
  );
}
