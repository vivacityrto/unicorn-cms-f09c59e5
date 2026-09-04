import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { autoCompleteStageTasks } from '@/hooks/useStageAuditLink';
import type { AuditAppointment, AppointmentType } from '@/types/auditWorkspace';
import type { Database, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// schedule_audit_phase's generated Args mark p_start_time/p_end_time as required
// strings (Postgres parameters with no default), but the SQL body only reads them
// when scheduling opening/closing meetings — confirmed via pg_get_functiondef.
// The one caller that omits them (the document-submission-deadline phase) never
// reaches that branch, so passing null here is intentional and safe.
type ScheduleAuditPhaseArgs = Database['public']['Functions']['schedule_audit_phase']['Args'];

// ─── Fetch Appointments ───
export function useAuditAppointments(auditId: string | undefined) {
  const query = useQuery({
    queryKey: ['audit-appointments', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_appointments')
        .select('*')
        .eq('audit_id', auditId)
        .order('scheduled_date', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AuditAppointment[];
    },
  });

  const appointments = query.data || [];

  return {
    ...query,
    documentDeadline: appointments.find(a => a.appointment_type === 'document_submission_deadline') || null,
    openingMeeting: appointments.find(a => a.appointment_type === 'opening_meeting') || null,
    closingMeeting: appointments.find(a => a.appointment_type === 'closing_meeting') || null,
    all: appointments,
  };
}

// ─── Schedule Phase ───
export function useScheduleAuditPhase(auditId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      appointmentType: AppointmentType;
      scheduledDate: string;
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      location?: string;
      isOnline?: boolean;
      meetingUrl?: string;
      attendees?: unknown[];
      clientInstructions?: string;
      internalNotes?: string;
      auditTitle?: string;
      tenantId?: number;
      auditStatus?: string;
    }) => {
      if (!auditId || !user?.id) throw new Error('Missing audit ID or user');

      // A date before today means this meeting already happened and the
      // auditor is backfilling the record rather than booking it ahead —
      // that changes several downstream side effects below.
      const scheduledStartOfDay = new Date(`${params.scheduledDate}T00:00:00`);
      const todayStartOfDay = new Date(new Date().toDateString());
      const isBackdated = scheduledStartOfDay < todayStartOfDay;

      // Call the RPC
      const rpcArgs = {
        p_audit_id: auditId,
        p_appointment_type: params.appointmentType,
        p_scheduled_date: params.scheduledDate,
        p_start_time: params.startTime || null,
        p_end_time: params.endTime || null,
        p_duration_minutes: params.durationMinutes || null,
        p_location: params.location || null,
        p_is_online: params.isOnline ?? true,
        p_meeting_url: params.meetingUrl || null,
        p_attendees: params.attendees ? JSON.stringify(params.attendees) : null,
        p_client_instructions: params.clientInstructions || null,
        p_internal_notes: params.internalNotes || null,
        p_created_by: user.id,
      } as unknown as ScheduleAuditPhaseArgs;
      const { data: appointmentId, error: rpcErr } = await supabase.rpc('schedule_audit_phase', rpcArgs);
      if (rpcErr) throw rpcErr;

      // Auto-complete stage tasks — 'conducted' rather than 'scheduled' when
      // backfilling a meeting that's already taken place, since that's what it
      // actually is (the stage-task system already models both milestones).
      if (params.appointmentType === 'opening_meeting' && auditId) {
        await autoCompleteStageTasks(auditId, isBackdated ? 'conducted' : 'scheduled');
      }

      if (isBackdated) {
        // An already-concluded meeting shouldn't sit in "scheduled" waiting on a
        // separate manual "Complete" click, and it shouldn't get a calendar
        // invite for a date that's already passed. Land it as completed
        // immediately, stamped with the meeting's own date/time rather than now.
        const backdatedUpdate: TablesUpdate<'audit_appointments'> = {
          status: 'completed',
          completed_at: `${params.scheduledDate}T${params.startTime || '00:00'}:00`,
        };
        await supabase
          .from('audit_appointments')
          .update(backdatedUpdate)
          .eq('id', appointmentId);

        if (params.appointmentType === 'opening_meeting' && params.auditStatus === 'draft') {
          await supabase
            .from('client_audits')
            .update({ status: 'in_progress' })
            .eq('id', auditId);
        }

        return appointmentId;
      }

      // For meetings booked ahead of time, create a calendar event and sync it
      // (including sending an invite) — not applicable once isBackdated is true.
      if (params.appointmentType === 'opening_meeting' || params.appointmentType === 'closing_meeting') {
        const meetingLabel = params.appointmentType === 'opening_meeting' ? 'Opening Meeting' : 'Closing Meeting';
        const title = `${meetingLabel} — ${params.auditTitle || 'Audit'}`;

        try {
          // KNOWN BUG (confirmed live, not fixed here — out of scope for a
          // type-only change): calendar_events.calendar_id and
          // provider_event_id are NOT NULL with no default, and this insert
          // supplies neither, so it has never once succeeded in production
          // (confirmed: 0 of 9,611 calendar_events rows have
          // provider = 'internal'). The surrounding try/catch silently
          // swallows the resulting error, so no calendar entry or Outlook
          // invite has ever actually gone out for an opening/closing
          // meeting scheduled through this flow. Needs a design decision on
          // where calendar_id/provider_event_id should come from before
          // this can be fixed for real.
          const calendarInsertPayload = {
            tenant_id: params.tenantId,
            user_id: user.id,
            title,
            description: params.clientInstructions || '',
            start_at: `${params.scheduledDate}T${params.startTime || '09:00'}:00`,
            end_at: `${params.scheduledDate}T${params.endTime || '10:00'}:00`,
            location: params.location || null,
            meeting_url: params.meetingUrl || null,
            attendees: params.attendees || [],
            provider: 'internal',
            status: 'confirmed',
          } as unknown as TablesInsert<'calendar_events'>;
          const { data: event, error: calErr } = await supabase
            .from('calendar_events')
            .insert(calendarInsertPayload)
            .select('id')
            .single();

          if (!calErr && event) {
            const eventId = event.id;
            // Link calendar event to appointment
            const linkUpdate: TablesUpdate<'audit_appointments'> = { calendar_event_id: eventId };
            await supabase
              .from('audit_appointments')
              .update(linkUpdate)
              .eq('id', appointmentId);

            // Try Outlook sync (non-blocking)
            try {
              const { data: syncData } = await supabase.functions.invoke('sync-outlook-calendar', {
                body: { event_id: eventId, action: 'create', send_invites: true },
              });
              if (syncData?.outlook_event_id) {
                const outlookSyncUpdate: TablesUpdate<'audit_appointments'> = {
                  outlook_event_id: syncData.outlook_event_id,
                  outlook_synced_at: new Date().toISOString(),
                };
                await supabase
                  .from('audit_appointments')
                  .update(outlookSyncUpdate)
                  .eq('id', appointmentId);
              }
            } catch {
              // Outlook sync is optional
            }
          }
        } catch {
          // Calendar event creation is optional
        }
      }

      return appointmentId;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['audit-appointments', auditId] });
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      const labels: Record<string, string> = {
        document_submission_deadline: 'Document deadline',
        opening_meeting: 'Opening meeting',
        closing_meeting: 'Closing meeting',
      };
      const isBackdated = new Date(`${params.scheduledDate}T00:00:00`) < new Date(new Date().toDateString());
      toast.success(`${labels[params.appointmentType] || 'Appointment'} ${isBackdated ? 'logged' : 'scheduled'}`);
    },
    onError: (err: unknown) => {
      toast.error('Failed to schedule: ' + (err instanceof Error ? err.message : 'Unknown error'));
    },
  });
}

// ─── Cancel Appointment ───
export function useCancelAuditAppointment(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointment: AuditAppointment) => {
      const { error } = await supabase
        .from('audit_appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointment.id);
      if (error) throw error;

      // Cancel Outlook event if synced
      if (appointment.outlook_event_id && appointment.calendar_event_id) {
        try {
          await supabase.functions.invoke('sync-outlook-calendar', {
            body: { event_id: appointment.calendar_event_id, action: 'cancel' },
          });
        } catch { /* best-effort; the appointment is already cancelled above regardless of calendar sync */ }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-appointments', auditId] });
      toast.success('Appointment cancelled');
    },
  });
}

// ─── Complete Appointment ───
export function useCompleteAuditAppointment(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appointment, auditStatus }: { appointment: AuditAppointment; auditStatus?: string }) => {
      const { error } = await supabase
        .from('audit_appointments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', appointment.id);
      if (error) throw error;

      // Opening meeting complete → transition audit to in_progress
      if (appointment.appointment_type === 'opening_meeting' && auditStatus === 'draft') {
        await supabase
          .from('client_audits')
          .update({ status: 'in_progress' })
          .eq('id', auditId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-appointments', auditId] });
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      toast.success('Appointment marked as completed');
    },
  });
}
