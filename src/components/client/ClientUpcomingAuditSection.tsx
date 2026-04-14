import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, MessageSquare, FileText, Target, Download, ExternalLink, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import type { AuditAppointment } from '@/types/auditWorkspace';

function generateICS(summary: string, start: string, end: string, location?: string, description?: string): string {
  const uid = crypto.randomUUID();
  const dtStart = start.replace(/[-:]/g, '').replace('T', 'T').split('.')[0] + 'Z';
  const dtEnd = end.replace(/[-:]/g, '').replace('T', 'T').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vivacity//Audit//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function downloadICS(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ClientUpcomingAuditSection() {
  const { activeTenantId } = useClientTenant();

  const { data: auditData } = useQuery({
    queryKey: ['client-upcoming-audit', activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      // Get current active audit for tenant
      const { data: audits, error: auditErr } = await supabase
        .from('client_audits' as any)
        .select('id, title, audit_type, status, lead_auditor_id, subject_tenant_id')
        .eq('subject_tenant_id', activeTenantId)
        .in('status', ['draft', 'in_progress', 'review'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (auditErr || !audits || audits.length === 0) return null;

      const audit = audits[0] as any;

      // Get appointments for this audit
      const { data: appointments, error: apptErr } = await supabase
        .from('audit_appointments' as any)
        .select('*')
        .eq('audit_id', audit.id)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true });
      if (apptErr) return null;

      if (!appointments || appointments.length === 0) return null;

      // Get lead auditor name
      let auditorName: string | null = null;
      if (audit.lead_auditor_id) {
        const { data: user } = await supabase
          .from('users' as any)
          .select('first_name, last_name')
          .eq('user_uuid', audit.lead_auditor_id)
          .single();
        if (user) auditorName = `${(user as any).first_name} ${(user as any).last_name}`;
      }

      return {
        audit,
        appointments: appointments as unknown as AuditAppointment[],
        auditorName,
      };
    },
  });

  if (!auditData) return null;

  const { audit, appointments, auditorName } = auditData;
  const deadline = appointments.find(a => a.appointment_type === 'document_submission_deadline');
  const opening = appointments.find(a => a.appointment_type === 'opening_meeting');
  const closing = appointments.find(a => a.appointment_type === 'closing_meeting');

  const handleDownloadICS = (appt: AuditAppointment, label: string) => {
    if (!appt.scheduled_date) return;
    const start = `${appt.scheduled_date}T${appt.scheduled_start_time || '09:00:00'}`;
    const dur = appt.duration_minutes || 60;
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + dur * 60 * 1000);
    const ics = generateICS(
      `${label} — ${audit.title}`,
      startDate.toISOString(),
      endDate.toISOString(),
      appt.is_online ? appt.meeting_url || 'Online' : appt.location || undefined,
      appt.client_instructions || undefined,
    );
    downloadICS(`${label.toLowerCase().replace(/\s/g, '-')}.ics`, ics);
  };

  const TimelineItem = ({ icon, label, appt, showMeetingLink }: {
    icon: React.ReactNode; label: string; appt: AuditAppointment | undefined; showMeetingLink?: boolean;
  }) => {
    if (!appt) return null;
    const isCompleted = appt.status === 'completed';

    return (
      <div className="flex gap-3 relative">
        <div className="flex flex-col items-center">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
            {icon}
          </div>
          <div className="w-px flex-1 bg-border" />
        </div>
        <div className="pb-6 flex-1">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-sm text-muted-foreground">
            {appt.scheduled_date
              ? format(new Date(appt.scheduled_date + 'T00:00:00'), 'd MMM yyyy')
              : '—'}
            {appt.scheduled_start_time && ` at ${appt.scheduled_start_time.slice(0, 5)}`}
          </p>
          {appt.client_instructions && (
            <p className="text-xs text-muted-foreground mt-1">{appt.client_instructions}</p>
          )}
          {showMeetingLink && appt.meeting_url && (
            <a href={appt.meeting_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
              Join meeting <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <Button
            variant="ghost" size="sm" className="text-xs mt-1 h-6 px-2"
            onClick={() => handleDownloadICS(appt, label)}
          >
            <CalendarIcon className="h-3 w-3 mr-1" /> Add to calendar
          </Button>
        </div>
      </div>
    );
  };

  // Review period display
  const ReviewPeriod = () => {
    if (!opening?.scheduled_date || !closing?.scheduled_date) return null;
    return (
      <div className="flex gap-3 relative">
        <div className="flex flex-col items-center">
          <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
          </div>
          <div className="w-px flex-1 bg-border" />
        </div>
        <div className="pb-6 flex-1">
          <p className="font-medium text-sm">Document Review</p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(opening.scheduled_date + 'T00:00:00'), 'd MMM')} – {format(new Date(closing.scheduled_date + 'T00:00:00'), 'd MMM yyyy')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Your consultant will review your documents. No action required from you during this period.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          📋 Upcoming Compliance Audit
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {audit.title}
          {auditorName && <> · Your consultant: <strong>{auditorName}</strong></>}
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        <TimelineItem icon={<ClipboardList className="h-4 w-4" />} label="Document Deadline" appt={deadline} />
        <TimelineItem icon={<MessageSquare className="h-4 w-4" />} label="Opening Meeting" appt={opening} showMeetingLink />
        <ReviewPeriod />
        <TimelineItem icon={<Target className="h-4 w-4" />} label="Closing Meeting" appt={closing} showMeetingLink />

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/client/documents">
              <FileText className="h-3.5 w-3.5 mr-1" /> Upload documents
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
