import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { AuditAppointment, AppointmentType } from '@/types/auditWorkspace';

// ─── Fetch Appointments ───
export function useAuditAppointments(auditId: string | undefined) {
  const query = useQuery({
    queryKey: ['audit-appointments', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_appointments' as any)
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
      attendees?: any[];
      clientInstructions?: string;
      internalNotes?: string;
      auditTitle?: string;
      tenantId?: number;
    }) => {
      if (!auditId || !user?.id) throw new Error('Missing audit ID or user');

      // Call the RPC
      const { data: appointmentId, error: rpcErr } = await supabase.rpc(
        'schedule_audit_phase' as any,
        {
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
        } as any
      );
      if (rpcErr) throw rpcErr;

      // For meetings, create calendar event and sync
      if (params.appointmentType === 'opening_meeting' || params.appointmentType === 'closing_meeting') {
        const meetingLabel = params.appointmentType === 'opening_meeting' ? 'Opening Meeting' : 'Closing Meeting';
        const title = `${meetingLabel} — ${params.auditTitle || 'Audit'}`;

        try {
          const { data: event, error: calErr } = await supabase
            .from('calendar_events' as any)
            .insert({
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
            } as any)
            .select('id')
            .single();

          if (!calErr && event) {
            const eventId = (event as any).id;
            // Link calendar event to appointment
            await supabase
              .from('audit_appointments' as any)
              .update({ calendar_event_id: eventId } as any)
              .eq('id', appointmentId);

            // Try Outlook sync (non-blocking)
            try {
              const { data: syncData } = await supabase.functions.invoke('sync-outlook-calendar', {
                body: { event_id: eventId, action: 'create', send_invites: true },
              });
              if (syncData?.outlook_event_id) {
                await supabase
                  .from('audit_appointments' as any)
                  .update({
                    outlook_event_id: syncData.outlook_event_id,
                    outlook_synced_at: new Date().toISOString(),
                  } as any)
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
      toast.success(`${labels[params.appointmentType] || 'Appointment'} scheduled`);
    },
    onError: (err: any) => {
      toast.error('Failed to schedule: ' + (err.message || 'Unknown error'));
    },
  });
}

// ─── Cancel Appointment ───
export function useCancelAuditAppointment(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointment: AuditAppointment) => {
      const { error } = await supabase
        .from('audit_appointments' as any)
        .update({ status: 'cancelled' } as any)
        .eq('id', appointment.id);
      if (error) throw error;

      // Cancel Outlook event if synced
      if (appointment.outlook_event_id && appointment.calendar_event_id) {
        try {
          await supabase.functions.invoke('sync-outlook-calendar', {
            body: { event_id: appointment.calendar_event_id, action: 'cancel' },
          });
        } catch {}
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
        .from('audit_appointments' as any)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        } as any)
        .eq('id', appointment.id);
      if (error) throw error;

      // Opening meeting complete → transition audit to in_progress
      if (appointment.appointment_type === 'opening_meeting' && auditStatus === 'draft') {
        await supabase
          .from('client_audits' as any)
          .update({ status: 'in_progress' } as any)
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
