import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCloseCycle } from "@/features/pdp/hooks";

interface Props {
  cycleId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloseCycleDialog({ cycleId, open, onOpenChange }: Props) {
  const [notes, setNotes] = useState("");
  const close = useCloseCycle(cycleId);

  const onConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    await close.mutateAsync({ outcomeNotes: notes.trim() });
    setNotes("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this PDP cycle?</AlertDialogTitle>
          <AlertDialogDescription>
            Closing marks the cycle as completed and locks it from edits. This action is auditable.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="outcome">Outcome notes</Label>
          <Textarea
            id="outcome"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Summarise key outcomes, evidence highlights, and any carry-over."
            required
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!notes.trim() || close.isPending}
          >
            {close.isPending ? "Closing…" : "Close cycle"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
