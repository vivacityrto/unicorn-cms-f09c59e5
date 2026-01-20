import { useState } from 'react';
import { CheckCircle, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMeetingMinutes } from '@/hooks/useMeetingMinutes';
import type { MinutesStatus } from '@/types/eos';

interface FinaliseMinutesDialogProps {
  meetingId: string;
  minutesStatus: MinutesStatus;
}

export function FinaliseMinutesDialog({ meetingId, minutesStatus }: FinaliseMinutesDialogProps) {
  const { finaliseMinutes, createRevision } = useMeetingMinutes(meetingId);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');

  const isFinalOrLocked = minutesStatus === 'Final' || minutesStatus === 'Locked';

  const handleFinalise = async () => {
    if (!summary.trim()) return;
    await finaliseMinutes.mutateAsync(summary.trim());
    setOpen(false);
    setSummary('');
  };

  const handleCreateRevision = async () => {
    if (!summary.trim()) return;
    await createRevision.mutateAsync(summary.trim());
    setOpen(false);
    setSummary('');
  };

  if (minutesStatus === 'Locked') {
    return null; // Cannot do anything when locked
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isFinalOrLocked ? (
          <Button variant="outline" size="sm" className="gap-2">
            <Edit3 className="h-4 w-4" />
            Create Revision
          </Button>
        ) : (
          <Button variant="default" size="sm" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Finalise Minutes
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isFinalOrLocked ? 'Create Revision' : 'Finalise Minutes'}
          </DialogTitle>
          <DialogDescription>
            {isFinalOrLocked
              ? 'Creating a revision will allow you to edit the finalised minutes. This will create a new draft version.'
              : 'Finalising the minutes marks them as complete. You can still create revisions after finalisation if needed.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="summary">
            {isFinalOrLocked ? 'Reason for revision *' : 'Finalisation summary *'}
          </Label>
          <Textarea
            id="summary"
            placeholder={isFinalOrLocked 
              ? 'e.g., Need to add missed action item from discussion'
              : 'e.g., Reviewed and approved by leadership team'
            }
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={isFinalOrLocked ? handleCreateRevision : handleFinalise}
            disabled={!summary.trim() || finaliseMinutes.isPending || createRevision.isPending}
          >
            {isFinalOrLocked
              ? (createRevision.isPending ? 'Creating...' : 'Create Revision')
              : (finaliseMinutes.isPending ? 'Finalising...' : 'Finalise Minutes')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
