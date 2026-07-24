import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFacilitatorChange } from '@/hooks/useFacilitatorChange';
import { Users, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { VivacityTeamPicker } from './VivacityTeamPicker';

interface ChangeFacilitatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
}

/**
 * "Change Facilitator" from the meetings list — advance reassignment,
 * any time before a meeting starts. Same dialog/hook/RPC as
 * FacilitatorSelectDialog's pre-start flow, but without the
 * "start meeting" coupling: this only reassigns, it never starts anything.
 */
export const ChangeFacilitatorDialog = ({ open, onOpenChange, meetingId }: ChangeFacilitatorDialogProps) => {
  const { participantsLoading, currentFacilitator, changeFacilitator } = useFacilitatorChange(meetingId);
  const [selectedFacilitator, setSelectedFacilitator] = useState<string>('');

  // Re-sync to the actual current facilitator once per dialog open, not on
  // every render - the dialog stays mounted across open/close, and the
  // prior "only if still empty" guard meant a stale pick (from a
  // cancelled attempt, a different meeting, or an external facilitator
  // change since) could persist and enable Save against the wrong
  // person. Gated on participantsLoading (not just `open`) so it waits
  // for real data instead of resetting to '' first and never
  // recovering; the initializedRef guard (reset when the dialog closes)
  // stops a background refetch from clobbering an in-progress pick.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (!initializedRef.current && !participantsLoading) {
      setSelectedFacilitator(currentFacilitator?.user_id ?? '');
      initializedRef.current = true;
    }
  }, [open, participantsLoading, currentFacilitator]);

  const handleSave = async () => {
    if (selectedFacilitator && selectedFacilitator !== currentFacilitator?.user_id) {
      await changeFacilitator.mutateAsync(selectedFacilitator);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Change Facilitator
          </DialogTitle>
          <DialogDescription>
            Reassign who will facilitate this meeting. Same permission model as at-start and mid-meeting
            handoff — current Leader, Super Admin, or Integrator-or-above.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {participantsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Facilitator
                <Badge variant="secondary" className="ml-2 text-xs">Vivacity Team</Badge>
              </label>
              <VivacityTeamPicker
                mode="single"
                value={selectedFacilitator}
                onChange={setSelectedFacilitator}
                placeholder="Select facilitator..."
                disabled={changeFacilitator.isPending}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={changeFacilitator.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={changeFacilitator.isPending || !selectedFacilitator || selectedFacilitator === currentFacilitator?.user_id}
          >
            {changeFacilitator.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
