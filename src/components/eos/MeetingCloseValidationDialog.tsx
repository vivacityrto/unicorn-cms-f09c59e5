import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  AlertCircle, CheckCircle, XCircle, Clock, Star, 
  ListTodo, Target, FileText, AlertTriangle, Sparkles
} from 'lucide-react';
import { useMeetingOutcomes, type OutcomeType, type ValidationResult } from '@/hooks/useMeetingOutcomes';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { MeetingType } from '@/types/eos';

interface MeetingCloseValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingType: MeetingType;
  todosCount: number;
  issuesDiscussed: number;
}

interface OutcomeCheckItem {
  outcomeType: OutcomeType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const L10_OUTCOMES: OutcomeCheckItem[] = [
  {
    outcomeType: 'no_ids_required',
    label: 'No IDS items required this week',
    icon: <AlertCircle className="h-4 w-4" />,
    description: 'Confirm if no issues were discussed during IDS',
  },
  {
    outcomeType: 'no_todos_required',
    label: 'No To-Dos required',
    icon: <ListTodo className="h-4 w-4" />,
    description: 'Confirm if no new To-Dos were created',
  },
];

const SAME_PAGE_OUTCOMES: OutcomeCheckItem[] = [
  {
    outcomeType: 'no_decisions_required',
    label: 'No decisions required',
    icon: <FileText className="h-4 w-4" />,
    description: 'Confirm if this was an alignment-only meeting',
  },
  {
    outcomeType: 'alignment_achieved',
    label: 'Alignment achieved, no actions required',
    icon: <Sparkles className="h-4 w-4" />,
    description: 'Confirm full alignment without new actions',
  },
];

const QUARTERLY_OUTCOMES: OutcomeCheckItem[] = [
  {
    outcomeType: 'all_rocks_closed',
    label: 'All previous quarter Rocks closed',
    icon: <Target className="h-4 w-4" />,
    description: 'All Rocks are Complete, Rolled, or Dropped',
  },
  {
    outcomeType: 'flight_plan_confirmed',
    label: 'Superhero Flight Plan confirmed',
    icon: <CheckCircle className="h-4 w-4" />,
    description: 'New quarter priorities and Rocks are set',
  },
];

const ANNUAL_OUTCOMES: OutcomeCheckItem[] = [
  {
    outcomeType: 'vto_reviewed',
    label: 'Vision/Traction Organizer reviewed',
    icon: <FileText className="h-4 w-4" />,
    description: 'V/TO has been reviewed and updated',
  },
  {
    outcomeType: 'annual_priorities_set',
    label: 'Annual priorities defined',
    icon: <Target className="h-4 w-4" />,
    description: 'At least one annual priority or Rock is set',
  },
  {
    outcomeType: 'no_risks_required',
    label: 'No strategic risks identified',
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'Confirm if no risks were identified',
  },
];

const getOutcomesForMeetingType = (meetingType: MeetingType): OutcomeCheckItem[] => {
  switch (meetingType) {
    case 'L10':
      return L10_OUTCOMES;
    case 'Same_Page':
      return SAME_PAGE_OUTCOMES;
    case 'Quarterly':
      return QUARTERLY_OUTCOMES;
    case 'Annual':
      return ANNUAL_OUTCOMES;
    default:
      return [];
  }
};

export function MeetingCloseValidationDialog({
  open,
  onOpenChange,
  meetingId,
  meetingType,
  todosCount,
  issuesDiscussed,
}: MeetingCloseValidationDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { 
    confirmations, 
    ratings, 
    validateClose, 
    closeMeeting, 
    saveConfirmation, 
    saveRating,
    hasConfirmation,
    getUserRating,
  } = useMeetingOutcomes(meetingId);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [justifications, setJustifications] = useState<Record<OutcomeType, string>>({} as Record<OutcomeType, string>);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showForceCloseConfirm, setShowForceCloseConfirm] = useState(false);

  const outcomes = getOutcomesForMeetingType(meetingType);
  const userRating = profile?.user_uuid ? getUserRating(profile.user_uuid) : undefined;

  // Load initial state when dialog opens
  useEffect(() => {
    if (open) {
      setIsValidating(true);
      validateClose.mutateAsync()
        .then(result => {
          setValidation(result);
          setIsValidating(false);
        })
        .catch(() => {
          setIsValidating(false);
        });
      
      if (userRating) {
        setSelectedRating(userRating);
      }
    }
  }, [open]);

  const handleConfirmationToggle = async (outcome: OutcomeCheckItem, checked: boolean) => {
    if (checked) {
      const justification = justifications[outcome.outcomeType];
      if (!justification?.trim()) {
        return; // Don't allow checking without justification
      }
      await saveConfirmation.mutateAsync({ 
        outcomeType: outcome.outcomeType, 
        justification: justification.trim() 
      });
    }
    // Refresh validation
    const result = await validateClose.mutateAsync();
    setValidation(result);
  };

  const handleRatingSave = async (rating: number) => {
    setSelectedRating(rating);
    await saveRating.mutateAsync(rating);
    // Refresh validation
    const result = await validateClose.mutateAsync();
    setValidation(result);
  };

  const handleCloseMeeting = async () => {
    try {
      const result = await closeMeeting.mutateAsync();
      if (result.success) {
        onOpenChange(false);
        navigate(`/eos/meetings/${meetingId}/summary`);
      } else {
        // Show validation errors from the RPC response
        const errors = result.validation_errors || result.unmet_requirements || [];
        if (errors.length > 0) {
          // Map RPC validation_errors into the validation state for display
          setValidation(prev => ({
            ...prev,
            is_valid: false,
            unmet_requirements: errors,
          }));
        }
        if (result.error) {
          toast.error(result.error);
        }
      }
    } catch (error) {
      // Error toast already handled by mutation onError
    }
  };

  const isReadyToClose = validation?.is_valid === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReadyToClose ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            )}
            {isReadyToClose ? 'Ready to Close Meeting' : 'Meeting Close Checklist'}
          </DialogTitle>
          <DialogDescription>
            {isReadyToClose 
              ? 'All required outcomes are met. You can now close this meeting.'
              : 'Complete the required outcomes before closing this meeting.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Stats */}
          <Card className="p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold">{todosCount}</p>
                  <p className="text-xs text-muted-foreground">To-Dos</p>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <p className="text-2xl font-bold">{issuesDiscussed}</p>
                  <p className="text-xs text-muted-foreground">Issues Discussed</p>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <p className="text-2xl font-bold">{ratings?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Ratings</p>
                </div>
              </div>
              <Badge variant="outline" className="text-sm">
                {meetingType} Meeting
              </Badge>
            </div>
          </Card>

          {/* Unmet Requirements */}
          {validation && !validation.is_valid && validation.unmet_requirements && validation.unmet_requirements.length > 0 && (
            <Card className="p-4 border-destructive/50 bg-destructive/5">
              <h4 className="font-semibold text-destructive flex items-center gap-2 mb-3">
                <XCircle className="h-4 w-4" />
                Missing Requirements
              </h4>
              <ul className="space-y-2">
                {validation.unmet_requirements.map((req, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-destructive mt-0.5">•</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Meeting Rating - Required for L10 */}
          {meetingType === 'L10' && (
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                Rate this Meeting (1-10)
              </h4>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <Button
                    key={n}
                    variant={selectedRating === n ? 'default' : 'outline'}
                    size="sm"
                    className="w-9 h-9"
                    onClick={() => handleRatingSave(n)}
                    disabled={saveRating.isPending}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              {selectedRating && (
                <p className="text-sm text-muted-foreground">
                  Your rating: <span className="font-medium">{selectedRating}/10</span>
                </p>
              )}
            </div>
          )}

          {/* Outcome Confirmations */}
          {outcomes.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold">Explicit Confirmations (if applicable)</h4>
              <p className="text-sm text-muted-foreground">
                If outcomes aren't met, you can confirm they weren't required with a justification.
              </p>
              
              <div className="space-y-4">
                {outcomes.map((outcome) => {
                  const isConfirmed = hasConfirmation(outcome.outcomeType);
                  const justification = justifications[outcome.outcomeType] || '';
                  
                  return (
                    <Card key={outcome.outcomeType} className={`p-4 ${isConfirmed ? 'bg-primary/5 border-primary/30' : ''}`}>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={outcome.outcomeType}
                            checked={isConfirmed}
                            disabled={!justification.trim() && !isConfirmed}
                            onCheckedChange={(checked) => handleConfirmationToggle(outcome, !!checked)}
                          />
                          <div className="flex-1">
                            <Label 
                              htmlFor={outcome.outcomeType} 
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              {outcome.icon}
                              {outcome.label}
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              {outcome.description}
                            </p>
                          </div>
                          {isConfirmed && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Confirmed
                            </Badge>
                          )}
                        </div>
                        
                        {!isConfirmed && (
                          <Input
                            placeholder="Justification required before confirming..."
                            value={justification}
                            onChange={(e) => setJustifications(prev => ({
                              ...prev,
                              [outcome.outcomeType]: e.target.value,
                            }))}
                            className="text-sm"
                          />
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Continue Meeting
          </Button>
          <Button
            onClick={handleCloseMeeting}
            disabled={!isReadyToClose || closeMeeting.isPending || isValidating}
          >
            {closeMeeting.isPending ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Closing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Close Meeting
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
