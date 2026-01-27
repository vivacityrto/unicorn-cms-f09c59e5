import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFacilitatorChange } from '@/hooks/useFacilitatorChange';
import { Users, Play, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FacilitatorSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  onStartMeeting: () => void;
  isStarting?: boolean;
}

export const FacilitatorSelectDialog = ({
  open,
  onOpenChange,
  meetingId,
  onStartMeeting,
  isStarting = false,
}: FacilitatorSelectDialogProps) => {
  const { participants, participantsLoading, currentFacilitator, changeFacilitator } = 
    useFacilitatorChange(meetingId);
  
  const [selectedFacilitator, setSelectedFacilitator] = useState<string>('');

  // Set initial selection when data loads
  useEffect(() => {
    if (currentFacilitator?.user_id && !selectedFacilitator) {
      setSelectedFacilitator(currentFacilitator.user_id);
    }
  }, [currentFacilitator, selectedFacilitator]);

  const handleStartMeeting = async () => {
    // If facilitator changed, update it first
    if (selectedFacilitator && selectedFacilitator !== currentFacilitator?.user_id) {
      await changeFacilitator.mutateAsync(selectedFacilitator);
    }
    
    // Then start the meeting
    onStartMeeting();
    onOpenChange(false);
  };

  const getParticipantName = (participant: any) => {
    if (participant.users?.first_name || participant.users?.last_name) {
      return `${participant.users?.first_name || ''} ${participant.users?.last_name || ''}`.trim();
    }
    return 'Unknown User';
  };

  const isPending = changeFacilitator.isPending || isStarting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Select Meeting Facilitator
          </DialogTitle>
          <DialogDescription>
            Confirm or change the facilitator before starting the meeting. The facilitator controls segment transitions and meeting flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {participantsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : participants && participants.length > 0 ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Facilitator</label>
                <Select
                  value={selectedFacilitator}
                  onValueChange={setSelectedFacilitator}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select facilitator..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {participants.map((participant) => (
                      <SelectItem 
                        key={participant.id} 
                        value={participant.user_id}
                      >
                        <div className="flex items-center gap-2">
                          <span>{getParticipantName(participant)}</span>
                          {participant.role === 'Leader' && (
                            <Badge variant="secondary" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedFacilitator && selectedFacilitator !== currentFacilitator?.user_id && (
                <p className="text-sm text-muted-foreground">
                  Facilitator will be changed when you start the meeting.
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p>No participants found for this meeting.</p>
              <p className="text-sm mt-1">You'll be set as the facilitator.</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartMeeting}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Meeting
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
