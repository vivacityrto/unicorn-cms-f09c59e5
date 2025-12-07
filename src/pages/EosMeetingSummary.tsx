import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail } from 'lucide-react';
import { MeetingSummaryCard } from '@/components/eos/MeetingSummaryCard';
import { DashboardLayout } from '@/components/DashboardLayout';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { EosMeetingSummary } from '@/types/eos';

export default function EosMeetingSummary() {
  return (
    <DashboardLayout>
      <SummaryContent />
    </DashboardLayout>
  );
}

function SummaryContent() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['meeting-summary', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_summaries')
        .select('*')
        .eq('meeting_id', meetingId!)
        .single();
      
      if (error) throw error;
      return data as EosMeetingSummary;
    },
    enabled: !!meetingId,
  });

  const { data: meeting } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('*')
        .eq('id', meetingId!)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
  });

  const handleEmailSummary = async () => {
    toast({
      title: 'Email feature coming soon',
      description: 'Meeting summary email will be available in a future update',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading summary...</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No summary found for this meeting</p>
        <Button onClick={() => navigate('/eos/meetings')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Meetings
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/eos/meetings')}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Meetings
          </Button>
          <h1 className="text-3xl font-bold">{meeting?.title}</h1>
          <p className="text-muted-foreground mt-1">
            {meeting?.scheduled_date ? format(new Date(meeting.scheduled_date), 'PPP') : ''}
          </p>
        </div>
        
        <Button onClick={handleEmailSummary} variant="outline">
          <Mail className="h-4 w-4 mr-2" />
          Email Summary
        </Button>
      </div>

      <MeetingSummaryCard summary={summary} />
    </div>
  );
}
