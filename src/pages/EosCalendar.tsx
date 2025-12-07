import { useEosMeetings } from '@/hooks/useEos';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Download, Plus, Repeat, ExternalLink } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { format } from 'date-fns';
import { useState } from 'react';
import { RecurringMeetingDialog } from '@/components/eos/RecurringMeetingDialog';
import { Link } from 'react-router-dom';

export default function EosCalendar() {
  return (
    <DashboardLayout>
      <CalendarContent />
    </DashboardLayout>
  );
}

function CalendarContent() {
  const { meetings, isLoading } = useEosMeetings();
  const [selectedMeeting, setSelectedMeeting] = useState<{ id: string; title: string } | null>(null);

  const upcomingMeetings = meetings
    ?.filter(m => !m.is_complete && new Date(m.scheduled_date) >= new Date())
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());

  const handleDownloadIcal = (meeting: any) => {
    const icsContent = generateICalFile(meeting);
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${meeting.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generateGoogleCalendarUrl = (meeting: any) => {
    const startDate = format(new Date(meeting.scheduled_date), "yyyyMMdd'T'HHmmss");
    const endDate = format(
      new Date(new Date(meeting.scheduled_date).getTime() + (meeting.duration_minutes || 90) * 60000),
      "yyyyMMdd'T'HHmmss"
    );
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      meeting.title
    )}&dates=${startDate}/${endDate}&details=${encodeURIComponent(
      `Level 10 Meeting - ${meeting.meeting_type || 'Weekly'}`
    )}`;
  };

  const generateOutlookUrl = (meeting: any) => {
    const startDate = new Date(meeting.scheduled_date).toISOString();
    const endDate = new Date(
      new Date(meeting.scheduled_date).getTime() + (meeting.duration_minutes || 90) * 60000
    ).toISOString();
    
    return `https://outlook.office.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
      meeting.title
    )}&startdt=${startDate}&enddt=${endDate}&body=${encodeURIComponent(
      `Level 10 Meeting - ${meeting.meeting_type || 'Weekly'}`
    )}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="EOS Calendar" icon={Calendar} />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="EOS Calendar"
        description="View and manage your Level 10 meeting schedule"
        icon={Calendar}
        actions={
          <Button asChild>
            <Link to="/eos/meetings">
              <Plus className="mr-2 h-4 w-4" />
              Schedule Meeting
            </Link>
          </Button>
        }
      />

      {!upcomingMeetings || upcomingMeetings.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No upcoming meetings"
          description="Schedule your first Level 10 meeting to get started"
          action={{
            label: 'Schedule Meeting',
            onClick: () => window.location.href = '/eos/meetings',
            icon: Plus,
          }}
        />
      ) : (
        <div className="grid gap-4">
          {upcomingMeetings.map((meeting) => (
            <Card key={meeting.id} className="hover:shadow-card-hover transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">{meeting.title}</h3>
                      {meeting.recurrence_rule && (
                        <Badge variant="secondary" className="gap-1">
                          <Repeat className="h-3 w-3" />
                          Weekly
                        </Badge>
                      )}
                    </div>
                    
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>{format(new Date(meeting.scheduled_date), 'EEEE, MMMM d, yyyy')}</p>
                      <p>{format(new Date(meeting.scheduled_date), 'h:mm a')} • {meeting.duration_minutes || 90} minutes</p>
                      <p className="capitalize">{meeting.meeting_type || 'Weekly'} Meeting</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadIcal(meeting)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download .ics
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(generateGoogleCalendarUrl(meeting), '_blank')}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Google
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(generateOutlookUrl(meeting), '_blank')}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Outlook
                    </Button>

                    {!meeting.parent_meeting_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedMeeting({ id: meeting.id, title: meeting.title })}
                      >
                        <Repeat className="mr-2 h-4 w-4" />
                        Make Recurring
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedMeeting && (
        <RecurringMeetingDialog
          open={!!selectedMeeting}
          onOpenChange={(open) => !open && setSelectedMeeting(null)}
          meetingId={selectedMeeting.id}
          meetingTitle={selectedMeeting.title}
        />
      )}
    </div>
  );
}

function generateICalFile(meeting: any): string {
  const startDate = format(new Date(meeting.scheduled_date), "yyyyMMdd'T'HHmmss");
  const endDate = format(
    new Date(new Date(meeting.scheduled_date).getTime() + (meeting.duration_minutes || 90) * 60000),
    "yyyyMMdd'T'HHmmss"
  );
  const now = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Unicorn CMS//EOS Meeting//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${meeting.id}@unicorn-cms.au
DTSTAMP:${now}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${meeting.title}
DESCRIPTION:${meeting.meeting_type || 'Weekly'} Level 10 Meeting
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}
