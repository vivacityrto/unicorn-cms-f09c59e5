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
import { CheckCircle2, Circle, Settings, Clock, X } from 'lucide-react';

interface MissingField {
  field: string;
  label: string;
  tab: 'profile' | 'team';
}

interface ProfileSetupReminderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingFields: MissingField[];
  onSnooze: () => void;
  onDismiss: () => void;
  onGoToSettings: () => void;
  bestTab: string;
}

export function ProfileSetupReminderModal({
  open,
  onOpenChange,
  missingFields,
  onSnooze,
  onDismiss,
  onGoToSettings,
  bestTab,
}: ProfileSetupReminderModalProps) {
  const navigate = useNavigate();

  const handleGoToSettings = () => {
    onGoToSettings();
    navigate(`/settings?tab=${bestTab}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Complete your profile setup
          </DialogTitle>
          <DialogDescription>
            A few details are missing from your profile. Completing these helps the team stay coordinated.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium text-foreground mb-3">Missing information:</p>
          <ul className="space-y-2">
            {missingFields.map((field) => (
              <li key={field.field} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Circle className="h-4 w-4 text-warning" />
                {field.label}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleGoToSettings} className="w-full">
            <Settings className="h-4 w-4 mr-2" />
            Go to Profile Settings
          </Button>
          
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              onClick={onSnooze}
              className="flex-1"
            >
              <Clock className="h-4 w-4 mr-2" />
              Remind me later
            </Button>
            <Button
              variant="ghost"
              onClick={onDismiss}
              className="flex-1 text-muted-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
