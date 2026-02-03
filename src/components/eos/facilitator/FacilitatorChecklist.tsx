import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, Clock, Users, AlertTriangle, Lightbulb } from 'lucide-react';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import type { EosMeetingSegment, MeetingType } from '@/types/eos';

interface FacilitatorChecklistProps {
  meetingType: MeetingType;
  segments?: EosMeetingSegment[];
  currentSegmentId?: string;
  attendeesCount?: number;
  quorumMet?: boolean;
  meetingStartTime?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  isComplete: boolean;
  isRequired: boolean;
  category: 'preparation' | 'execution' | 'closing';
}

// Meeting type specific outcomes
const MEETING_OUTCOMES: Partial<Record<MeetingType, string[]>> = {
  L10: [
    'Scorecard reviewed - off-track metrics flagged',
    'Rocks updated (On Track / Off Track)',
    'Issues identified and prioritised',
    'IDS completed with decisions recorded',
    'To-Dos assigned with due dates',
    'Meeting rated 1-10 by all',
  ],
  Same_Page: [
    'Visionary and Integrator aligned',
    'Strategic decisions documented',
    'Action items assigned',
    'Next check-in scheduled',
  ],
  Quarterly: [
    'Previous quarter reviewed',
    'Flight Plan updated',
    'New Rocks defined and assigned',
    'Scorecard targets confirmed',
    'Quarterly goal set',
  ],
  Annual: [
    'V/TO reviewed and updated',
    '12-month objectives set',
    'Annual Rocks identified',
    'Quarterly planning cadence confirmed',
    'Team alignment verified',
  ],
  Custom: [
    'Meeting objectives achieved',
    'Action items recorded',
    'Next steps defined',
  ],
  Focus_Day: [
    'Focus topics addressed',
    'Decisions documented',
    'Follow-up actions assigned',
  ],
};

/**
 * Side panel checklist for facilitators.
 * Auto-updates as meeting progresses.
 * Shows agenda section order, required outcomes, quorum status, and time remaining.
 */
export function FacilitatorChecklist({
  meetingType,
  segments = [],
  currentSegmentId,
  attendeesCount = 0,
  quorumMet = true,
  meetingStartTime,
}: FacilitatorChecklistProps) {
  const { isFacilitatorMode } = useFacilitatorMode();
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // Calculate elapsed time
  useEffect(() => {
    if (!meetingStartTime) return;

    const calculateElapsed = () => {
      const start = new Date(meetingStartTime).getTime();
      const now = Date.now();
      setElapsedMinutes(Math.floor((now - start) / 60000));
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 60000);
    return () => clearInterval(interval);
  }, [meetingStartTime]);

  if (!isFacilitatorMode) {
    return null;
  }

  // Calculate segment progress
  const completedSegments = segments.filter(s => s.completed_at).length;
  const totalSegments = segments.length;
  const progressPercent = totalSegments > 0 ? (completedSegments / totalSegments) * 100 : 0;

  // Get current segment info
  const currentSegment = segments.find(s => s.id === currentSegmentId);
  const currentIndex = currentSegment ? segments.findIndex(s => s.id === currentSegmentId) + 1 : 0;

  // Calculate expected duration
  const totalDuration = segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const remainingMinutes = Math.max(0, totalDuration - elapsedMinutes);

  const outcomes = MEETING_OUTCOMES[meetingType] || [];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Facilitator Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Agenda Progress</span>
            <span className="font-medium">{completedSegments}/{totalSegments} sections</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Current Section */}
        {currentSegment && (
          <div className="p-2 rounded-md bg-background border">
            <p className="text-xs text-muted-foreground mb-1">Current Section ({currentIndex}/{totalSegments})</p>
            <p className="text-sm font-medium">{currentSegment.segment_name}</p>
            {currentSegment.duration_minutes && (
              <p className="text-xs text-muted-foreground mt-1">
                Time box: {currentSegment.duration_minutes} min
              </p>
            )}
          </div>
        )}

        {/* Time Status */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {elapsedMinutes > 0 ? `${elapsedMinutes}m elapsed` : 'Not started'}
          </span>
          {remainingMinutes > 0 && (
            <Badge variant="outline" className="text-xs">
              ~{remainingMinutes}m remaining
            </Badge>
          )}
        </div>

        {/* Quorum Status */}
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{attendeesCount} attendees</span>
          {quorumMet ? (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              Quorum met
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Quorum needed
            </Badge>
          )}
        </div>

        {/* Required Outcomes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Required Outcomes
          </p>
          <ul className="space-y-1.5">
            {outcomes.slice(0, 5).map((outcome, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Circle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{outcome}</span>
              </li>
            ))}
            {outcomes.length > 5 && (
              <li className="text-xs text-muted-foreground pl-5">
                +{outcomes.length - 5} more
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
