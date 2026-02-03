import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface MeetingChainNavProps {
  meetingId: string;
  previousMeetingId?: string | null;
  nextMeetingId?: string | null;
  meetingType?: string;
  isCompleted?: boolean;
  className?: string;
}

export function MeetingChainNav({ 
  meetingId, 
  previousMeetingId, 
  nextMeetingId, 
  meetingType = 'Meeting',
  isCompleted = false,
  className,
}: MeetingChainNavProps) {
  const navigate = useNavigate();
  
  const handlePrevious = () => {
    if (previousMeetingId) {
      navigate(`/eos/meetings/${previousMeetingId}/summary`);
    }
  };
  
  const handleNext = () => {
    if (nextMeetingId) {
      // Navigate to live view if next meeting is in progress, otherwise summary
      navigate(`/eos/meetings/${nextMeetingId}/live`);
    }
  };

  const hasChain = previousMeetingId || nextMeetingId;

  if (!hasChain) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1 text-sm", className)}>
      <Link2 className="w-4 h-4 text-muted-foreground mr-1" />
      
      <Button
        variant="ghost"
        size="sm"
        disabled={!previousMeetingId}
        onClick={handlePrevious}
        className="h-8 px-2"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Previous
      </Button>
      
      <span className="px-2 text-muted-foreground font-medium text-xs">
        {meetingType}
      </span>
      
      <Button
        variant="ghost"
        size="sm"
        disabled={!nextMeetingId}
        onClick={handleNext}
        className="h-8 px-2"
      >
        Next
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}
