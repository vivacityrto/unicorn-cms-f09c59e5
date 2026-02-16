import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Users, XCircle } from 'lucide-react';
import { QuorumStatus, useMeetingAttendance } from '@/hooks/useMeetingAttendance';

interface QuorumStartGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingType: string;
  onStartConfirmed: () => void;
}

export const QuorumStartGate = ({
  open,
  onOpenChange,
  meetingId,
  meetingType,
  onStartConfirmed,
}: QuorumStartGateProps) => {
  const [_overrideReason] = useState('');
  const [showOverrideInput] = useState(false);

  const { quorumStatus, startMeetingWithQuorum, attendees, presentCount, invitedCount } = 
    useMeetingAttendance(meetingId);

  const handleStartMeeting = async () => {
    const reason = showOverrideInput ? _overrideReason : undefined;
    const result = await startMeetingWithQuorum.mutateAsync(reason);
    
    if (result.success) {
      onStartConfirmed();
      onOpenChange(false);
    } else if (result.blocked) {
      // Only Same Page meetings are hard-blocked
      return;
    }
  };

  const isSamePage = meetingType === 'Same_Page';
  const isBlocked = isSamePage && quorumStatus && !quorumStatus.quorum_met;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Start Meeting
          </DialogTitle>
          <DialogDescription>
            Review attendance and quorum before starting the meeting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Attendance Summary */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Attendance</span>
            <Badge variant="outline">
              {presentCount} of {invitedCount} present
            </Badge>
          </div>

          {/* Quorum Status */}
          {quorumStatus && (
            <div className={`p-4 rounded-lg border ${
              quorumStatus.quorum_met 
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800' 
                : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
            }`}>
              <div className="flex items-start gap-3">
                {quorumStatus.quorum_met ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${
                    quorumStatus.quorum_met ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {quorumStatus.quorum_met ? 'Quorum Requirements Met' : 'Quorum Not Met'}
                  </p>
                  
                  {!quorumStatus.quorum_met && quorumStatus.issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {quorumStatus.issues.map((issue, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <XCircle className="w-3 h-3 text-destructive" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Role indicators */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant={quorumStatus.owner_present ? 'default' : 'outline'}>
                      Owner: {quorumStatus.owner_present ? '✓' : '—'}
                    </Badge>
                    {(meetingType === 'Same_Page' || meetingType === 'Annual') && (
                      <>
                        <Badge variant={quorumStatus.visionary_present ? 'default' : 'secondary'}>
                          Visionary: {quorumStatus.visionary_present ? '✓' : '✗'}
                        </Badge>
                        <Badge variant={quorumStatus.integrator_present ? 'default' : 'secondary'}>
                          Integrator: {quorumStatus.integrator_present ? '✓' : '✗'}
                        </Badge>
                      </>
                    )}
                    {meetingType === 'Quarterly' && quorumStatus.core_team_required > 0 && (
                      <Badge variant={quorumStatus.core_team_present >= Math.ceil(quorumStatus.core_team_required * 0.8) ? 'default' : 'secondary'}>
                        Core Team: {quorumStatus.core_team_present}/{quorumStatus.core_team_required}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Blocked Message for Same Page only */}
          {isBlocked && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive font-medium">
                Same Page meetings require both Visionary and Integrator to be present.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Please mark both roles as present before starting, or convert to a Working Session.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStartMeeting}
            disabled={startMeetingWithQuorum.isPending || isBlocked}
          >
            {startMeetingWithQuorum.isPending ? 'Starting...' : 
             (quorumStatus && !quorumStatus.quorum_met && !isBlocked) ? 'Start Without Full Quorum' : 'Start Meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
